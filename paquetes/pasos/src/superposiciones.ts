import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { transformSync } from "esbuild";
import sharp from "sharp";
import { z } from "zod";
import { enParalelo, ErrorGuion2Video, escribirJson, existe, huella, huellaArchivo, leerJsonSiExiste, palabras, type Escena } from "@guion2video/nucleo";
import type { AdjuntoImagen } from "@guion2video/proveedores";
import type { ItemVideo, Timeline } from "@guion2video/render";
import type { Paso } from "./paso.ts";
import type { ContextoPaso } from "./contexto.ts";
import { leerGuion } from "./guion.ts";
import { leerEscenas } from "./escenas.ts";
import { leerAlineacion } from "./alineacion.ts";
import { leerMetaImagen } from "./imagenes.ts";
import { construirBloques } from "./subtitulos.ts";
import { llmConCache, registrarCosto } from "./cache.ts";
import { mensajeAnimaciones, mensajeRevisionAnimaciones, sistemaAnimaciones, sistemaRevisionAnimaciones } from "./prompts.ts";
import { estiloVisual, pausaTrasMs } from "./tiempos.ts";

const VERSION = 2;
const MAX_CARACTERES = 8000;
const ANCHO_ADJUNTO = 960;

export const AnimacionEscena = z.object({
  idea: z.string().default(""),
  /** Qué cambió Claude al revisar los fotogramas renderizados. */
  revision: z.string().optional(),
  codigo: z.string().min(20),
});
export type AnimacionEscena = z.infer<typeof AnimacionEscena>;

/** superposiciones.json: la animación (código JSX) de cada escena que la lleva. Se puede editar a mano. */
export const ArchivoSuperposiciones = z.object({ escenas: z.record(z.string(), AnimacionEscena) });
export type ArchivoSuperposiciones = z.infer<typeof ArchivoSuperposiciones>;

const RespuestaDiseno = z.object({
  escenas: z.array(
    z.object({
      id: z.string(),
      idea: z.string().default(""),
      codigo: z.string().nullable().default(null),
      revisar_en: z.array(z.number()).max(3).default([]),
    }),
  ),
});
type RespuestaDiseno = z.infer<typeof RespuestaDiseno>;

const RespuestaRevision = z.object({
  escenas: z.array(z.object({ id: z.string(), ok: z.boolean(), comentario: z.string().default(""), codigo: z.string().nullable().default(null) })),
});
type RespuestaRevision = z.infer<typeof RespuestaRevision>;

export const rutaSuperposiciones = (ctx: ContextoPaso) => ctx.espacio.ruta("superposiciones.json");
export const leerSuperposiciones = (ctx: ContextoPaso) => leerJsonSiExiste(rutaSuperposiciones(ctx), ArchivoSuperposiciones);

// Lo que el código no puede tocar: red, DOM, almacenamiento, tiempo real ni azar no determinista.
const PROHIBIDO = /\b(import|export|require|fetch|XMLHttpRequest|WebSocket|eval|window|document|globalThis|localStorage|sessionStorage|indexedDB|navigator|process|setTimeout|setInterval)\b|Math\.random|Date\.now|new Date/;

/** Valida y compila a JavaScript el JSX de una animación. Lo usan este paso y la composición. */
export function compilarAnimacion(codigo: string): { js: string } | { error: string } {
  if (codigo.length > MAX_CARACTERES) return { error: `tiene ${codigo.length} caracteres (máximo ${MAX_CARACTERES})` };
  const prohibido = codigo.match(PROHIBIDO);
  if (prohibido) return { error: `usa "${prohibido[0]}", que no está permitido` };
  if (!/function\s+Superposicion\s*\(/.test(codigo)) return { error: 'debe declarar "function Superposicion(props)"' };
  try {
    const r = transformSync(codigo, { loader: "jsx", jsx: "transform", jsxFactory: "React.createElement", jsxFragment: "React.Fragment", target: "es2020" });
    return { js: r.code };
  } catch (e) {
    return { error: (e as Error).message.split("\n").slice(0, 4).join(" ").slice(0, 400) };
  }
}

/** Escenas sobre las que va una animación: las que tienen ilustración y narración. */
const conIlustracion = (escenas: Escena[]) => escenas.filter((e) => (e.tipo_visual === "imagen_ia" || e.tipo_visual === "archivo") && e.texto_narracion.trim());

interface DatosEscena {
  escena: Escena;
  duracion: number;
  palabras: { texto: string; desde: number; hasta: number }[];
  /** En ms, para los subtítulos de la revisión. */
  palabrasMs: { texto: string; inicio_ms: number; fin_ms: number }[];
  imagenes: { archivo: string; huella: string }[];
}

async function datosEscenas(ctx: ContextoPaso): Promise<DatosEscena[]> {
  const { escenas } = await leerEscenas(ctx);
  const { estilo } = ctx.estilo;
  const fps = estilo.formato.fps;
  const aFrame = (ms: number) => Math.round((ms * fps) / 1000);
  const ilustradas = new Set(conIlustracion(escenas).map((e) => e.id));
  const datos: DatosEscena[] = [];
  for (let i = 0; i < escenas.length; i++) {
    const e = escenas[i];
    if (!ilustradas.has(e.id)) continue;
    const alineacion = await leerAlineacion(ctx, e.id);
    if (!alineacion) throw new ErrorGuion2Video(`Falta la alineación de ${e.id}`, "dependencia");
    const imagenes = [];
    for (const img of e.imagenes) {
      const meta = await leerMetaImagen(ctx, img.id);
      if (!meta) throw new ErrorGuion2Video(`Falta la imagen ${img.id}`, "dependencia");
      imagenes.push({ archivo: meta.archivo, huella: meta.archivo_huella });
    }
    datos.push({
      escena: e,
      duracion: aFrame(alineacion.duracion_ms + pausaTrasMs(escenas, i, estilo)),
      palabras: alineacion.palabras.map((p) => ({ texto: p.palabra, desde: aFrame(p.inicio_ms), hasta: aFrame(p.fin_ms) })),
      palabrasMs: alineacion.palabras.map((p) => ({ texto: p.palabra, inicio_ms: p.inicio_ms, fin_ms: p.fin_ms })),
      imagenes,
    });
  }
  return datos;
}

const validarCodigos = (ids: string[], r: { escenas: { id: string; codigo: string | null }[] }) => {
  const errores: string[] = [];
  for (const e of r.escenas) {
    if (!ids.includes(e.id)) errores.push(`"${e.id}" no es una de las escenas recibidas`);
    if (e.codigo) {
      const c = compilarAnimacion(e.codigo);
      if ("error" in c) errores.push(`${e.id}: el código no es válido: ${c.error}`);
    }
  }
  const faltan = ids.filter((id) => !r.escenas.some((e) => e.id === id));
  if (faltan.length) errores.push(`Faltan escenas: ${faltan.join(", ")}`);
  return errores;
};

/** Respuesta determinista para el modo simulado: la palabra más larga de la escena, centrada. */
function simular(datos: DatosEscena[]): RespuestaDiseno {
  return {
    escenas: datos.map((d, i) => {
      if (i % 3 === 2) return { id: d.escena.id, idea: "", codigo: null, revisar_en: [] };
      const palabra = palabras(d.escena.texto_narracion).map((p) => p.replace(/[^\p{L}\p{N}]/gu, "")).sort((a, b) => b.length - a.length)[0] ?? "";
      const codigo = `function Superposicion({ duracion }) {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [0, 10, duracion - 10, duracion], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity: o }}>
    <span style={{ fontFamily: tema.fuentes.titulos, fontSize: 110, color: tema.colores.acento }}>{${JSON.stringify(palabra.toUpperCase())}}</span>
  </AbsoluteFill>;
}`;
      return { id: d.escena.id, idea: `Resalta "${palabra}"`, codigo, revisar_en: [Math.round(d.duracion / 2)] };
    }),
  };
}

const adjuntarImagen = async (etiqueta: string, ruta: string): Promise<AdjuntoImagen> => ({
  etiqueta,
  mime: "image/jpeg",
  datos: await sharp(await readFile(ruta)).resize({ width: ANCHO_ADJUNTO, withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer(),
});

/** Timeline mínimo con las escenas una tras otra (ilustración, animación y subtítulos) para renderizar fotogramas de revisión. */
function timelineRevision(ctx: ContextoPaso, datos: DatosEscena[], codigos: Map<string, string>): { timeline: Timeline; inicio: Map<string, number> } {
  const { estilo } = ctx.estilo;
  const fps = estilo.formato.fps;
  const video: ItemVideo[] = [];
  const superposiciones: NonNullable<Timeline["pistas"]["superposiciones"]> = [];
  const subtitulos: Timeline["pistas"]["subtitulos"] = [];
  const inicio = new Map<string, number>();
  let cursor = 0;
  for (const d of datos) {
    inicio.set(d.escena.id, cursor);
    d.imagenes.forEach((img, j) => {
      const a = cursor + Math.round((d.duracion * j) / d.imagenes.length);
      const b = cursor + Math.round((d.duracion * (j + 1)) / d.imagenes.length);
      video.push({ id: `${d.escena.id}-${j}`, escena: d.escena.id, desde: a, duracion: b - a, tipo: "imagen_ia", src: img.archivo, huella: img.huella, movimiento: d.escena.imagenes[j]?.movimiento, transicion: "corte" });
    });
    const js = codigos.get(d.escena.id);
    if (js) superposiciones.push({ id: `${d.escena.id}-animacion`, escena: d.escena.id, desde: cursor, duracion: d.duracion, codigo: js, palabras: d.palabras });
    const inicioMs = (cursor * 1000) / fps;
    subtitulos.push(
      ...construirBloques(
        d.palabrasMs.map((p) => ({ texto: p.texto, inicio_ms: inicioMs + p.inicio_ms, fin_ms: inicioMs + p.fin_ms })),
        { fps, palabrasPorBloque: estilo.subtitulos.palabras_por_bloque },
      ),
    );
    cursor += d.duracion;
  }
  const timeline: Timeline = {
    version: 1,
    titulo: "revisión",
    fps,
    ancho: estilo.formato.ancho,
    alto: estilo.formato.alto,
    duracion_frames: Math.max(1, cursor),
    estilo: estiloVisual(estilo),
    pistas: { video, voz: [], musica: [], efectos: [], subtitulos, superposiciones },
    partes: [],
  };
  return { timeline, inicio };
}

const huellaEntradas = async (ctx: ContextoPaso) => {
  const llm = ctx.proveedores.llmAnimaciones();
  const { estilo } = ctx.estilo;
  const { escenas } = await leerEscenas(ctx);
  const ilustradas = conIlustracion(escenas);
  const alineaciones = await Promise.all(ilustradas.map(async (e) => ((await leerAlineacion(ctx, e.id)) as { huella?: string } | undefined)?.huella ?? null));
  const imagenes = await Promise.all(ilustradas.map(async (e) => Promise.all(e.imagenes.map(async (i) => (await leerMetaImagen(ctx, i.id))?.archivo_huella ?? null))));
  return huella(
    "superposiciones",
    VERSION,
    llm.id,
    llm.modelo,
    estilo.superposiciones,
    estilo.colores,
    estilo.tipografia,
    estilo.subtitulos.posicion,
    estilo.marca.texto ?? null,
    ilustradas.map((e, i) => [e.id, e.parte, e.texto_narracion, e.nota_visual ?? null, alineaciones[i], imagenes[i]]),
  );
};

export const pasoSuperposiciones: Paso = {
  nombre: "superposiciones",
  titulo: "Animaciones",
  depende: ["alineacion", "imagenes"],
  revision: false,
  huella: huellaEntradas,
  salidas: (ctx) => [rutaSuperposiciones(ctx)],
  async estimar(ctx) {
    const { estilo } = ctx.estilo;
    if (!estilo.superposiciones.activas) return { costo_usd: 0, unidades: 0, pendientes: 0, detalle: "desactivadas en el estilo" };
    const { escenas } = await leerEscenas(ctx);
    const ilustradas = conIlustracion(escenas);
    const llm = ctx.proveedores.llmAnimaciones();
    const partes = new Set(ilustradas.map((e) => e.parte)).size;
    const imagenes = ilustradas.reduce((s, e) => s + e.imagenes.length, 0);
    const revisar = estilo.superposiciones.revision_visual;
    // Diseño: instrucciones + ~800 tokens por ilustración; ~1.500 de código por escena. Revisión: código + 2 fotogramas por escena.
    const entrada = 3000 * partes + 800 * imagenes + 300 * ilustradas.length + (revisar ? 3000 * partes + 2300 * ilustradas.length : 0);
    const salida = 1500 * ilustradas.length * (revisar ? 1.5 : 1);
    return {
      costo_usd: llm.estimarCosto(entrada, salida),
      unidades: partes,
      pendientes: partes,
      detalle: `${ilustradas.length} escenas en ${partes} partes${revisar ? " + revisión visual" : ""} (${llm.modelo})`,
    };
  },
  async ejecutar(ctx) {
    const ruta = rutaSuperposiciones(ctx);
    const estado = ctx.proyecto.pasos.superposiciones;
    if (!ctx.forzarSobrescritura && estado?.huella_salida && (await existe(ruta)) && (await huellaArchivo(ruta)) !== estado.huella_salida) {
      throw new ErrorGuion2Video("superposiciones.json tiene ediciones manuales y las escenas cambiaron. Para regenerarlo y perder esas ediciones usa --forzar.", "validacion");
    }
    const { estilo } = ctx.estilo;
    if (!estilo.superposiciones.activas) {
      await escribirJson(ruta, { escenas: {} });
      return { costo_usd: 0, resumen: "desactivadas en el estilo", avisos: [], huella_salida: await huellaArchivo(ruta) };
    }

    const g = await leerGuion(ctx);
    const llm = ctx.proveedores.llmAnimaciones();
    // Lo que ya se generó con el modelo general (antes de separar el de animaciones) se reutiliza.
    const general = ctx.proveedores.llm();
    const conOtroModelo = (...partes: unknown[]) => (general.modelo === llm.modelo ? [] : [huella(...partes.map((p) => (p === llm.modelo ? general.modelo : p === llm.id ? general.id : p)))]);
    const datos = await datosEscenas(ctx);
    const partes = [...new Set(datos.map((d) => d.escena.parte))].map((parte) => datos.filter((d) => d.escena.parte === parte));
    const revisar = estilo.superposiciones.revision_visual && !ctx.proveedores.simular;
    const forzar = ctx.forzar.has("superposiciones");
    const sistemaDiseno = sistemaAnimaciones(estilo);
    const sistemaRevision = sistemaRevisionAnimaciones(estilo);
    const avisos: string[] = [];
    let hechas = 0;
    ctx.log.progreso("animaciones", 0, partes.length);

    const lote = await enParalelo(partes, ctx.proveedores.config.animaciones?.paralelo ?? 1, async (grupo) => {
      const parte = grupo[0].escena.parte;
      const ids = grupo.map((d) => d.escena.id);

      // 1. Diseño: Claude ve las ilustraciones, la narración y el frame de cada palabra.
      const mensaje = mensajeAnimaciones(
        g,
        parte,
        grupo.map((d) => ({ id: d.escena.id, texto_narracion: d.escena.texto_narracion, nota_visual: d.escena.nota_visual, duracion: d.duracion, fps: estilo.formato.fps, imagenes: d.imagenes.length, palabras: d.palabras })),
      );
      const adjuntos = ctx.proveedores.simular
        ? []
        : await Promise.all(grupo.flatMap((d) => d.imagenes.map((img, j) => adjuntarImagen(`${d.escena.id} · ilustración ${j + 1}`, ctx.espacio.ruta(img.archivo)))));
      const diseno = await llmConCache(ctx, {
        huella: huella("animaciones-diseno", VERSION, llm.id, llm.modelo, sistemaDiseno, mensaje, grupo.map((d) => d.imagenes.map((i) => i.huella))),
        alternativas: conOtroModelo("animaciones-diseno", VERSION, llm.id, llm.modelo, sistemaDiseno, mensaje, grupo.map((d) => d.imagenes.map((i) => i.huella))),
        forzar,
        llamar: () =>
          llm.generarJson({ etiqueta: `animaciones de "${parte}"`, sistema: sistemaDiseno, mensaje, adjuntos, esquema: RespuestaDiseno, validar: (d) => validarCodigos(ids, d), simulacion: () => simular(grupo), maxTokens: 64000 }),
      });
      await registrarCosto(ctx, { paso: "superposiciones", unidad: parte, proveedor: llm.id, modelo: diseno.modelo, costo_usd: diseno.costoUsd, cache: diseno.desde_cache });
      let costoParte = diseno.costoUsd;
      const animaciones = new Map<string, AnimacionEscena & { revisar_en: number[] }>();
      for (const e of RespuestaDiseno.parse(diseno.datos).escenas) if (e.codigo && ids.includes(e.id)) animaciones.set(e.id, { idea: e.idea, codigo: e.codigo, revisar_en: e.revisar_en });

      // 2. Revisión visual: se renderizan fotogramas reales y Claude corrige lo que no se vea bien.
      if (revisar && animaciones.size) {
        const dir = await mkdtemp(join(tmpdir(), "guion2video-revision-"));
        try {
          const conAnimacion = grupo.filter((d) => animaciones.has(d.escena.id));
          const js = new Map([...animaciones].map(([id, a]) => [id, (compilarAnimacion(a.codigo) as { js: string }).js]));
          const { timeline, inicio } = timelineRevision(ctx, conAnimacion, js);
          const fotogramas = conAnimacion.flatMap((d) => {
            const pedidos = animaciones.get(d.escena.id)!.revisar_en.filter((f) => f >= 0 && f < d.duracion);
            const frames = (pedidos.length ? pedidos : [d.duracion * 0.45, d.duracion * 0.85]).map(Math.round);
            return frames.map((f) => ({ id: d.escena.id, local: f, frame: inicio.get(d.escena.id)! + f, salida: join(dir, `${d.escena.id}-${f}.jpg`) }));
          });
          ctx.log.info(`Renderizando ${fotogramas.length} fotogramas para revisar las animaciones de "${parte}"…`);
          const { renderizarFotogramas } = await import("@guion2video/render/renderizar");
          const registro = await renderizarFotogramas({ timeline, dirProyecto: ctx.espacio.dir, fotogramas });
          const adjuntosRevision: AdjuntoImagen[] = await Promise.all(fotogramas.map(async (f) => ({ etiqueta: `${f.id} · frame ${f.local}`, mime: "image/jpeg" as const, datos: await readFile(f.salida) })));
          const mensajeRevision = mensajeRevisionAnimaciones(
            conAnimacion.map((d) => {
              const a = animaciones.get(d.escena.id)!;
              return { id: d.escena.id, idea: a.idea, codigo: a.codigo, errores: registro.filter((r) => r.includes(d.escena.id)), fotogramas: fotogramas.filter((f) => f.id === d.escena.id).map((f) => f.local) };
            }),
          );
          const idsRevision = conAnimacion.map((d) => d.escena.id);
          const revision = await llmConCache(ctx, {
            huella: huella("animaciones-revision", VERSION, llm.id, llm.modelo, sistemaRevision, mensajeRevision, adjuntosRevision.map((a) => huella(a.datos.toString("base64")))),
            alternativas: conOtroModelo("animaciones-revision", VERSION, llm.id, llm.modelo, sistemaRevision, mensajeRevision, adjuntosRevision.map((a) => huella(a.datos.toString("base64")))),
            forzar,
            llamar: () =>
              llm.generarJson({
                etiqueta: `revisión de animaciones de "${parte}"`,
                sistema: sistemaRevision,
                mensaje: mensajeRevision,
                adjuntos: adjuntosRevision,
                esquema: RespuestaRevision,
                validar: (r) => validarCodigos(idsRevision, r),
                simulacion: (): RespuestaRevision => ({ escenas: idsRevision.map((id) => ({ id, ok: true, comentario: "", codigo: null })) }),
                maxTokens: 64000,
              }),
          });
          await registrarCosto(ctx, { paso: "superposiciones", unidad: `${parte} (revisión)`, proveedor: llm.id, modelo: revision.modelo, costo_usd: revision.costoUsd, cache: revision.desde_cache });
          costoParte += revision.costoUsd;
          for (const r of RespuestaRevision.parse(revision.datos).escenas) {
            const a = animaciones.get(r.id);
            if (a && !r.ok && r.codigo) animaciones.set(r.id, { ...a, codigo: r.codigo, revision: r.comentario || undefined });
          }
        } catch (e) {
          // La revisión mejora, pero no es imprescindible: si falla, se quedan las animaciones del diseño.
          avisos.push(`No se pudo revisar visualmente "${parte}": ${(e as Error).message.split("\n")[0].slice(0, 200)}`);
        } finally {
          await rm(dir, { recursive: true, force: true });
        }
      }
      ctx.log.progreso("animaciones", ++hechas, partes.length, parte);
      return { animaciones, costo: costoParte };
    });
    if (lote.fallidos.length) {
      throw new ErrorGuion2Video(`Fallaron ${lote.fallidos.length} parte(s):\n${lote.fallidos.map((f) => `  • ${f.item[0].escena.parte}: ${(f.error as Error).message}`).join("\n")}`, "proveedor");
    }

    const archivo: ArchivoSuperposiciones = { escenas: {} };
    let costo = 0;
    for (const { resultado } of lote.ok) {
      costo += resultado.costo;
      for (const [id, a] of resultado.animaciones) archivo.escenas[id] = { idea: a.idea, revision: a.revision, codigo: a.codigo };
    }
    await escribirJson(ruta, archivo);
    const n = Object.keys(archivo.escenas).length;
    return {
      costo_usd: costo,
      resumen: `${n} animaciones en ${datos.length} escenas con ilustración${revisar ? ", revisadas viendo fotogramas" : ""}`,
      avisos,
      huella_salida: await huellaArchivo(ruta),
    };
  },
};
