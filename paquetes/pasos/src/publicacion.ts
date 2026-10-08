import { z } from "zod";
import { escribirArchivo, escribirJson, formatoReloj, huella, huellaArchivo, leerJsonSiExiste } from "@guion2video/nucleo";
import { renderizarMiniatura } from "@guion2video/render/renderizar";
import type { Timeline } from "@guion2video/render";
import type { ContextoPaso } from "./contexto.ts";
import type { Paso } from "./paso.ts";
import { llmConCache, registrarCosto } from "./cache.ts";
import { leerGuion } from "./guion.ts";
import { leerTimeline } from "./composicion.ts";
import { promptPublicacion, VERSION_PROMPTS } from "./prompts.ts";
import { leerEscenas } from "./escenas.ts";
import type { Credito } from "./audio-ambiente.ts";

const VERSION = 1;

const RespuestaPublicacion = z.object({
  titulos: z.array(z.object({ titulo: z.string().max(100), resaltado: z.string().optional() })).min(3).max(5),
  resumen: z.string(),
  etiquetas: z.array(z.string()).max(25).default([]),
  imagenes_miniatura: z.array(z.string()).min(1).max(5),
});
type RespuestaPublicacion = z.infer<typeof RespuestaPublicacion>;

/**
 * Capítulos de YouTube: el primero en 0:00, al menos 3 y cada uno de 10 s o más.
 * Las partes demasiado cortas se fusionan con la anterior.
 */
export function capitulos(timeline: Pick<Timeline, "partes" | "fps" | "duracion_frames">): { inicio_ms: number; titulo: string }[] {
  const ms = (f: number) => (f * 1000) / timeline.fps;
  const lista: { inicio_ms: number; titulo: string }[] = [];
  timeline.partes.forEach((p, i) => {
    const inicio = i === 0 ? 0 : ms(p.desde);
    const fin = i + 1 < timeline.partes.length ? ms(timeline.partes[i + 1].desde) : ms(timeline.duracion_frames);
    if (lista.length && fin - inicio < 10_000) return;
    lista.push({ inicio_ms: inicio, titulo: p.titulo });
  });
  return lista.length >= 3 ? lista : [];
}

export function textoDescripcion(op: {
  resumen: string;
  capitulos: { inicio_ms: number; titulo: string }[];
  fuentes: string[];
  creditos: Credito[];
  notaIa: string;
  llamadas: string[];
  etiquetas: string[];
}): string {
  const bloques = [op.resumen.trim()];
  if (op.llamadas.length) bloques.push(op.llamadas.join("\n"));
  if (op.capitulos.length) bloques.push(`CAPÍTULOS\n${op.capitulos.map((c) => `${formatoReloj(c.inicio_ms)} ${c.titulo}`).join("\n")}`);
  if (op.fuentes.length) bloques.push(`FUENTES\n${op.fuentes.map((f) => `• ${f}`).join("\n")}`);
  const musica = op.creditos.filter((c) => c.tipo === "musica");
  const efectos = op.creditos.filter((c) => c.tipo === "efecto");
  if (musica.length || efectos.length) {
    bloques.push(
      ["MÚSICA Y EFECTOS", ...musica.map((c) => `• Música: ${c.atribucion}`), ...efectos.map((c) => `• Efecto: ${c.atribucion}`)].join("\n"),
    );
  }
  bloques.push(`SOBRE ESTE VIDEO\n${op.notaIa}`);
  if (op.etiquetas.length) bloques.push(op.etiquetas.slice(0, 3).map((e) => `#${e.replace(/\s+/g, "")}`).join(" "));
  return bloques.join("\n\n") + "\n";
}

const LISTA = (titulo: string) => `# Lista de publicación — ${titulo}

Antes de subir a YouTube (la subida es manual y como borrador privado):

- [ ] Ver el video completo (no solo la vista previa).
- [ ] En YouTube Studio, marcar **"Contenido alterado o sintético"** si hay imágenes realistas generadas con IA.
- [ ] Revisar que ninguna imagen muestre el rostro realista de una persona real.
- [ ] Confirmar que las afirmaciones no juzgadas usan "presuntamente" / "según la Fiscalía".
- [ ] Revisar la lista de fuentes de la descripción.
- [ ] Subir \`subtitulos.srt\` como subtítulos en español.
- [ ] Elegir título y miniatura entre las 3 opciones.
- [ ] Revisar que los créditos de música y efectos están en la descripción.
- [ ] Publicar como borrador privado y revisar en el celular antes de programar.
`;

export const pasoPublicacion: Paso = {
  nombre: "publicacion",
  titulo: "Publicación",
  depende: ["render"],
  revision: true,
  async huella(ctx) {
    const llm = ctx.proveedores.llm();
    return huella(
      "publicacion",
      VERSION,
      VERSION_PROMPTS,
      llm.id,
      llm.modelo,
      await huellaArchivo(ctx.espacio.rutas.timeline),
      await huellaArchivo(ctx.espacio.rutas.guionJson),
      await huellaArchivo(ctx.espacio.ruta("ambiente", "creditos.json")),
      ctx.estilo.estilo.publicacion,
    );
  },
  salidas: (ctx) => [ctx.espacio.ruta("salida", "descripcion.txt"), ctx.espacio.ruta("salida", "publicacion.json")],
  async estimar(ctx) {
    const g = await leerGuion(ctx);
    return { costo_usd: ctx.proveedores.llm().estimarCosto(g.palabras * 1.6 + 4000, 3000), unidades: 1, pendientes: 1 };
  },
  async ejecutar(ctx) {
    const g = await leerGuion(ctx);
    const t = await leerTimeline(ctx);
    const { escenas } = await leerEscenas(ctx);
    const llm = ctx.proveedores.llm();
    const enVideo = new Set(t.pistas.video.filter((v) => v.tipo === "imagen_ia" || v.tipo === "archivo").map((v) => v.id));
    const candidatas = escenas.flatMap((e) => e.imagenes.filter((i) => enVideo.has(i.id)).map((i) => ({ id: i.id, prompt: i.prompt }))).slice(0, 80);
    const p = promptPublicacion(g, candidatas, ctx.estilo.estilo);
    const simulacion = (): RespuestaPublicacion => ({
      titulos: [{ titulo: g.titulo, resaltado: g.titulo.split(" ")[0] }, { titulo: `La historia de ${g.titulo}`, resaltado: "historia" }, { titulo: `${g.titulo}: lo que nadie contó`, resaltado: "nadie" }],
      resumen: `Resumen simulado de "${g.titulo}".`,
      etiquetas: ["fraude", "documental", "colombia"],
      imagenes_miniatura: candidatas.slice(0, 3).map((c) => c.id),
    });
    const r = await llmConCache(ctx, {
      huella: huella("publicacion", VERSION_PROMPTS, llm.id, llm.modelo, p),
      forzar: ctx.forzar.has("publicacion"),
      llamar: () =>
        llm.generarJson({
          etiqueta: "publicación",
          ...p,
          esquema: RespuestaPublicacion,
          validar: (d) => d.imagenes_miniatura.filter((id) => !candidatas.some((c) => c.id === id)).map((id) => `"${id}" no está entre las imágenes candidatas`),
          simulacion,
          maxTokens: 16000,
        }),
    });
    const datos = RespuestaPublicacion.parse(r.datos);
    await registrarCosto(ctx, { paso: "publicacion", proveedor: llm.id, modelo: r.modelo, costo_usd: r.costoUsd, cache: r.desde_cache });

    // Tres miniaturas: cada una con un título y una imagen distintos.
    const rutaImagen = (id: string) => t.pistas.video.find((v) => v.id === id)?.src;
    const miniaturas: string[] = [];
    for (let i = 0; i < 3; i++) {
      const titulo = datos.titulos[i % datos.titulos.length];
      const src = rutaImagen(datos.imagenes_miniatura[i % datos.imagenes_miniatura.length] ?? "") ?? rutaImagen(candidatas[i]?.id ?? "");
      const archivo = `salida/miniatura-${i + 1}.png`;
      await renderizarMiniatura({
        props: { titulo: titulo.titulo, resaltado: titulo.resaltado, src, estilo: t.estilo, variante: i as 0 | 1 | 2 },
        dirProyecto: ctx.espacio.dir,
        salida: ctx.espacio.ruta(archivo),
      });
      miniaturas.push(archivo);
    }

    const creditos = (await leerJsonSiExiste<Credito[]>(ctx.espacio.ruta("ambiente", "creditos.json"))) ?? [];
    const caps = capitulos(t);
    const pub = ctx.estilo.estilo.publicacion;
    const descripcion = textoDescripcion({ resumen: datos.resumen, capitulos: caps, fuentes: g.fuentes, creditos, notaIa: pub.nota_ia, llamadas: pub.llamadas_accion, etiquetas: datos.etiquetas });
    await escribirArchivo(ctx.espacio.ruta("salida", "descripcion.txt"), descripcion);
    await escribirArchivo(ctx.espacio.ruta("salida", "titulos.txt"), datos.titulos.map((x, i) => `${i + 1}. ${x.titulo}`).join("\n") + "\n");
    await escribirArchivo(ctx.espacio.ruta("salida", "LISTA-PUBLICACION.md"), LISTA(g.titulo));
    await escribirJson(ctx.espacio.ruta("salida", "publicacion.json"), { ...datos, capitulos: caps, miniaturas, fuentes: g.fuentes, creditos });

    const avisos: string[] = [];
    if (!caps.length) avisos.push("Menos de 3 capítulos válidos: la descripción va sin capítulos");
    if (!g.fuentes.length) avisos.push("La descripción no tiene fuentes");
    return {
      costo_usd: r.costoUsd,
      resumen: `3 títulos, 3 miniaturas, descripción con ${caps.length} capítulos, ${g.fuentes.length} fuentes y ${creditos.length} créditos`,
      avisos,
    };
  },
};
