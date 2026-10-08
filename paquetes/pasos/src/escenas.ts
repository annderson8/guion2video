import { z } from "zod";
import {
  ArchivoEscenas,
  BibliaVisual,
  contarPalabras,
  enParalelo,
  ErrorGuion2Video,
  escribirJson,
  existe,
  Grafico,
  huella,
  huellaArchivo,
  leerJson,
  Movimiento,
  TipoTransicion,
  TIPOS_GRAFICOS,
  type Escena,
  type Estilo,
  type GuionEstructurado,
  type ParteGuion,
} from "@guion2video/nucleo";
import type { Paso } from "./paso.ts";
import type { ContextoPaso } from "./contexto.ts";
import { leerGuion } from "./guion.ts";
import { llmConCache, registrarCosto } from "./cache.ts";
import { AMBIENTES, mensajeParte, promptBiblia, sistemaEscenas, VERSION_PROMPTS } from "./prompts.ts";

// ───────── Lo que devuelve Claude por cada parte ─────────

const ImagenLlm = z.object({
  prompt: z.string().min(15),
  movimiento: Movimiento.default("zoom_lento_entrada"),
  calidad: z.enum(["estandar", "premium"]).default("estandar"),
});

const EscenaLlm = z.object({
  desde: z.string(),
  hasta: z.string(),
  tipo_visual: z.enum(["imagen_ia", "cifra", "linea_tiempo", "mapa", "comparacion", "documento", "cita"]),
  nota_visual: z.string().optional(),
  imagenes: z.array(ImagenLlm).default([]),
  grafico: Grafico.optional(),
  ambiente: z
    .object({ musica: z.enum(AMBIENTES).catch("neutral"), efectos: z.array(z.string()).max(3).default([]) })
    .default({ musica: "neutral", efectos: [] }),
  transicion: TipoTransicion.optional(),
});
type EscenaLlm = z.infer<typeof EscenaLlm>;

const RespuestaParte = z.object({ escenas: z.array(EscenaLlm).min(1) });
type RespuestaParte = z.infer<typeof RespuestaParte>;

const palabrasPorSegundo = (estilo: Estilo) => 2.6 * estilo.voz.velocidad;

/** Comprueba que las escenas cubren todas las oraciones de la parte, en orden y sin huecos. */
export function validarCobertura(parte: ParteGuion, r: RespuestaParte, estilo: Estilo): string[] {
  const ids = parte.oraciones.map((o) => o.id);
  const errores: string[] = [];
  let esperado = 0;
  r.escenas.forEach((e, i) => {
    const desde = ids.indexOf(e.desde);
    const hasta = ids.indexOf(e.hasta);
    if (desde < 0 || hasta < 0) {
      errores.push(`Escena ${i + 1}: "${e.desde}"–"${e.hasta}" no son oraciones de esta parte`);
      return;
    }
    if (desde !== esperado) errores.push(`Escena ${i + 1} empieza en ${e.desde} pero debía empezar en ${ids[esperado] ?? "(fin)"}`);
    if (hasta < desde) errores.push(`Escena ${i + 1}: "hasta" (${e.hasta}) va antes de "desde" (${e.desde})`);
    esperado = hasta + 1;
    if (e.tipo_visual === "imagen_ia" && !e.imagenes.length) errores.push(`Escena ${i + 1} es imagen_ia pero no tiene imágenes`);
    if (e.tipo_visual !== "imagen_ia") {
      if (!e.grafico) errores.push(`Escena ${i + 1} es ${e.tipo_visual} pero no tiene "grafico"`);
      else if (e.grafico.tipo !== e.tipo_visual) errores.push(`Escena ${i + 1}: grafico.tipo debe ser "${e.tipo_visual}"`);
    }
    if (e.tipo_visual === "imagen_ia" && desde >= 0 && hasta >= desde) {
      const palabras = parte.oraciones.slice(desde, hasta + 1).reduce((s, o) => s + contarPalabras(o.texto), 0);
      const segundos = palabras / palabrasPorSegundo(estilo);
      const minimo = Math.ceil(segundos / (estilo.ritmo.segundos_por_imagen_max * 1.5));
      if (e.imagenes.length < minimo) errores.push(`Escena ${i + 1} dura ≈${segundos.toFixed(0)} s y necesita al menos ${minimo} imágenes (tiene ${e.imagenes.length})`);
    }
  });
  if (esperado !== ids.length) errores.push(`Faltan oraciones al final: la última escena debe terminar en ${ids[ids.length - 1]}`);
  return errores;
}

// ───────── Simulación determinista (modo GUION2VIDEO_SIMULAR) ─────────

function simularParte(parte: ParteGuion, estilo: Estilo): RespuestaParte {
  const escenas: EscenaLlm[] = [];
  let grupo: typeof parte.oraciones = [];
  let palabras = 0;
  const objetivo = 12 * palabrasPorSegundo(estilo);
  const cerrar = () => {
    if (!grupo.length) return;
    const texto = grupo.map((o) => o.texto).join(" ");
    const i = escenas.length;
    const numero = texto.match(/\b\d{1,3}(?:\.\d{3})+\b|\b\d{2,}\b/);
    const anio = texto.match(/\b(19|20)\d{2}\b/);
    const base = { desde: grupo[0].id, hasta: grupo[grupo.length - 1].id, ambiente: { musica: "tension_baja" as const, efectos: i === 0 ? ["crowd_murmur"] : [] }, imagenes: [] };
    if (i % 3 === 1 && anio) {
      escenas.push({ ...base, tipo_visual: "linea_tiempo", grafico: { tipo: "linea_tiempo", eventos: [{ fecha: anio[0], texto: "Hito" }, { fecha: String(Number(anio[0]) + 1), texto: "Después" }] } });
    } else if (i % 3 === 1 && numero) {
      escenas.push({ ...base, tipo_visual: "cifra", grafico: { tipo: "cifra", valor: Number(numero[0].replace(/\./g, "")), etiqueta: "dato" } });
    } else if (i % 3 === 1) {
      escenas.push({ ...base, tipo_visual: i % 2 ? "mapa" : "documento", grafico: i % 2 ? { tipo: "mapa", pais: "CO", resaltar: ["Putumayo"], etiqueta: "Putumayo" } : { tipo: "documento", titulo: "Documento recreado", cuerpo: texto.split(" ").slice(0, 12).join(" ") } });
    } else {
      const n = Math.max(1, Math.ceil(palabras / palabrasPorSegundo(estilo) / estilo.ritmo.segundos_por_imagen_max));
      escenas.push({
        ...base,
        tipo_visual: "imagen_ia",
        imagenes: Array.from({ length: n }, (_, j) => ({
          prompt: `Ilustración de: ${texto.split(" ").slice(j * 8, j * 8 + 14).join(" ") || texto.slice(0, 80)}`,
          movimiento: (["zoom_lento_entrada", "paneo_izquierda", "zoom_lento_salida", "paneo_derecha"] as const)[(i + j) % 4],
          calidad: "estandar" as const,
        })),
      });
    }
    grupo = [];
    palabras = 0;
  };
  for (const o of parte.oraciones) {
    grupo.push(o);
    palabras += contarPalabras(o.texto);
    if (palabras >= objetivo) cerrar();
  }
  cerrar();
  return { escenas };
}

function simularBiblia(g: GuionEstructurado): BibliaVisual {
  const nombres = [...new Set(g.partes.flatMap((p) => p.oraciones.flatMap((o) => o.texto.match(/\b[A-ZÁÉÍÓÚ][a-záéíóú]+ [A-ZÁÉÍÓÚ][a-záéíóú]+\b/g) ?? [])))].slice(0, 5);
  return { epoca_y_lugar: "Colombia, década de 2000", personas_reales: nombres, personajes: [], lugares: [] };
}

// ───────── Ensamblado ─────────

const LETRAS = "abcdefghijklmnopqrstuvwxyz";

function tituloYNumero(titulo: string, indice: number): { numero?: number; titulo: string } {
  const m = titulo.match(/^parte\s+(\d+)\s*[:.\-–—]\s*(.+)$/i);
  if (m) return { numero: Number(m[1]), titulo: m[2].trim() };
  return { numero: indice, titulo };
}

export function ensamblarEscenas(g: GuionEstructurado, respuestas: RespuestaParte[], estilo: Estilo, slug: string, biblia?: BibliaVisual): ArchivoEscenas {
  const escenas: Escena[] = [];
  const id = () => `escena-${String(escenas.length + 1).padStart(3, "0")}`;
  g.partes.forEach((parte, ip) => {
    // Separador automático entre partes (la primera, normalmente el gancho, entra directo).
    if (ip > 0) {
      const t = tituloYNumero(parte.titulo, ip);
      escenas.push({
        id: id(),
        parte: parte.titulo,
        texto_narracion: "",
        tipo_visual: "titulo_parte",
        imagenes: [],
        grafico: { tipo: "titulo_parte", numero: t.numero, titulo: t.titulo },
        ambiente: { musica: respuestas[ip].escenas[0]?.ambiente.musica ?? "neutral", efectos: [] },
        transicion: "negro",
        duracion_estimada_s: 2.5,
      });
    }
    const ids = parte.oraciones.map((o) => o.id);
    for (const e of respuestas[ip].escenas) {
      const oraciones = parte.oraciones.slice(ids.indexOf(e.desde), ids.indexOf(e.hasta) + 1);
      const texto = oraciones.map((o) => o.texto).join(" ");
      const eid = id();
      const notas = oraciones.flatMap((o) => o.notas);
      escenas.push({
        id: eid,
        parte: parte.titulo,
        oraciones: [e.desde, e.hasta],
        texto_narracion: texto,
        nota_visual: [e.nota_visual, ...notas].filter(Boolean).join(" · ") || undefined,
        tipo_visual: e.tipo_visual,
        imagenes: e.tipo_visual === "imagen_ia" ? e.imagenes.map((img, j) => ({ id: `${eid}-${LETRAS[j]}`, ...img })) : [],
        grafico: e.tipo_visual === "imagen_ia" ? undefined : e.grafico,
        ambiente: e.ambiente,
        transicion: e.transicion,
        duracion_estimada_s: Math.round((contarPalabras(texto) / palabrasPorSegundo(estilo)) * 10) / 10,
      });
    }
  });
  return ArchivoEscenas.parse({ proyecto: slug, biblia, escenas });
}

export async function leerEscenas(ctx: ContextoPaso): Promise<ArchivoEscenas> {
  return leerJson(ctx.espacio.rutas.escenas, ArchivoEscenas);
}

export const proporcionGraficos = (escenas: Escena[]) => {
  const narradas = escenas.filter((e) => e.tipo_visual !== "titulo_parte");
  const graficos = narradas.filter((e) => TIPOS_GRAFICOS.includes(e.tipo_visual)).length;
  return narradas.length ? (graficos / narradas.length) * 100 : 0;
};

// ───────── Paso ─────────

const huellaEntradas = async (ctx: ContextoPaso) => {
  const llm = ctx.proveedores.llm();
  const { estilo } = ctx.estilo;
  return huella("escenas", VERSION_PROMPTS, await huellaArchivo(ctx.espacio.rutas.guionJson), llm.id, llm.modelo, estilo.ritmo, estilo.voz.velocidad, estilo.imagen.estilo_prompt);
};

export const pasoEscenas: Paso = {
  nombre: "escenas",
  titulo: "Escenas",
  depende: ["guion"],
  revision: true,
  huella: huellaEntradas,
  huellaAprobacion: (ctx) => huellaArchivo(ctx.espacio.rutas.escenas),
  salidas: (ctx) => [ctx.espacio.rutas.escenas],
  async estimar(ctx) {
    const g = await leerGuion(ctx);
    const llm = ctx.proveedores.llm();
    // ≈1,6 tokens por palabra en español; ~3.500 tokens de instrucciones por llamada; ~220 tokens por escena + razonamiento.
    const tokensGuion = g.palabras * 1.6;
    const escenasEstimadas = g.palabras / 30;
    const entrada = tokensGuion * 2 + 3500 * (g.partes.length + 1);
    const salida = escenasEstimadas * 220 + 3000 * (g.partes.length + 1);
    return { costo_usd: llm.estimarCosto(entrada, salida), unidades: g.partes.length + 1, pendientes: g.partes.length + 1, detalle: `${g.partes.length} partes + biblia visual (${llm.modelo})` };
  },
  async ejecutar(ctx) {
    const rutas = ctx.espacio.rutas;
    const estado = ctx.proyecto.pasos.escenas;
    if (!ctx.forzarSobrescritura && estado?.huella_salida && (await existe(rutas.escenas)) && (await huellaArchivo(rutas.escenas)) !== estado.huella_salida) {
      throw new ErrorGuion2Video(
        "escenas.json tiene ediciones manuales y el guion cambió. Para regenerar y perder esas ediciones usa --forzar; para conservarlas, aprueba las escenas tal como están.",
        "validacion",
      );
    }
    const g = await leerGuion(ctx);
    const { estilo } = ctx.estilo;
    const llm = ctx.proveedores.llm();
    let costo = 0;

    const pb = promptBiblia(g, estilo);
    ctx.log.info("Preparando la biblia visual del episodio…");
    const forzar = ctx.forzar.has("escenas");
    const biblia = await llmConCache(ctx, {
      huella: huella("biblia", VERSION_PROMPTS, llm.id, llm.modelo, pb),
      forzar,
      llamar: () => llm.generarJson({ etiqueta: "biblia visual", ...pb, esquema: BibliaVisual, simulacion: () => simularBiblia(g), maxTokens: 16000 }),
    });
    costo += biblia.costoUsd;
    await registrarCosto(ctx, { paso: "escenas", unidad: "biblia", proveedor: llm.id, modelo: biblia.modelo, costo_usd: biblia.costoUsd, cache: biblia.desde_cache });

    const sistema = sistemaEscenas(estilo, biblia.datos);
    let hechas = 0;
    ctx.log.progreso("escenas", 0, g.partes.length);
    const lote = await enParalelo(g.partes, 3, async (parte, i) => {
      const mensaje = mensajeParte(g, parte, i);
      const r = await llmConCache(ctx, {
        huella: huella("escenas-parte", VERSION_PROMPTS, llm.id, llm.modelo, sistema, mensaje),
        forzar,
        llamar: () =>
          llm.generarJson({
            etiqueta: `escenas de "${parte.titulo}"`,
            sistema,
            mensaje,
            esquema: RespuestaParte,
            validar: (d) => validarCobertura(parte, d, estilo),
            simulacion: () => simularParte(parte, estilo),
          }),
      });
      // La caché guarda JSON crudo: se vuelve a validar por si cambió el esquema.
      const datos = RespuestaParte.parse(r.datos);
      await registrarCosto(ctx, { paso: "escenas", unidad: parte.id, proveedor: llm.id, modelo: r.modelo, costo_usd: r.costoUsd, cache: r.desde_cache });
      ctx.log.progreso("escenas", ++hechas, g.partes.length, parte.titulo);
      return { ...r, datos };
    });
    costo += lote.ok.reduce((s, x) => s + x.resultado.costoUsd, 0);
    if (lote.fallidos.length) {
      throw new ErrorGuion2Video(`Fallaron ${lote.fallidos.length} parte(s):\n${lote.fallidos.map((f) => `  • ${f.item.titulo}: ${(f.error as Error).message}`).join("\n")}`, "proveedor");
    }
    const respuestas = g.partes.map((p) => lote.ok.find((x) => x.item.id === p.id)!.resultado.datos);
    const archivo = ensamblarEscenas(g, respuestas, estilo, ctx.proyecto.slug, biblia.datos);
    await escribirJson(rutas.escenas, archivo);

    const avisos: string[] = [];
    const pct = proporcionGraficos(archivo.escenas);
    if (pct < estilo.ritmo.porcentaje_minimo_graficos) avisos.push(`Solo ${pct.toFixed(0)} % de las escenas son gráficos (mínimo ${estilo.ritmo.porcentaje_minimo_graficos} %). Revisa escenas.json.`);
    const imagenes = archivo.escenas.reduce((s, e) => s + e.imagenes.length, 0);
    return {
      costo_usd: costo,
      resumen: `${archivo.escenas.length} escenas, ${imagenes} imágenes por generar, ${pct.toFixed(0)} % gráficos`,
      avisos,
      huella_salida: await huellaArchivo(rutas.escenas),
    };
  },
};
