import { rename } from "node:fs/promises";
import {
  ArchivoRecortes,
  asegurarCarpeta,
  ErrorGuion2Video,
  escribirJson,
  existe,
  huella,
  huellaArchivo,
  leerJsonSiExiste,
  Recorte,
} from "@guion2video/nucleo";
import { framesContenido, segmentosRecorte, type RecorteVertical, type Timeline } from "@guion2video/render";
import { huellaFuentes, renderizarVertical } from "@guion2video/render/renderizar";
import type { ContextoPaso } from "./contexto.ts";
import { leerTimeline } from "./composicion.ts";

const VERSION = 1;
/** Límites orientativos de cada plataforma: solo generan un aviso, y conviene confirmarlos porque cambian. */
const MAX_SHORT_S = 180;
const MAX_REEL_S = 90;
/** Tolerancia para considerar que un recorte ya empieza o termina en límite de palabra. */
const MIN_RECORTE_S = 3;

export const rutaRecortes = (ctx: ContextoPaso) => ctx.espacio.ruta("recortes.json");
export const rutaVideoRecorte = (ctx: ContextoPaso, id: string) => ctx.espacio.ruta("salida", "recortes", `${id}.mp4`);
const rutaMeta = (ctx: ContextoPaso, id: string) => ctx.espacio.ruta("salida", "recortes", `${id}.meta.json`);

export async function leerRecortes(ctx: ContextoPaso): Promise<ArchivoRecortes> {
  return (await leerJsonSiExiste(rutaRecortes(ctx), ArchivoRecortes)) ?? { recortes: [] };
}

const guardarRecortes = (ctx: ContextoPaso, archivo: ArchivoRecortes) => escribirJson(rutaRecortes(ctx), archivo);

interface PalabraTiempo {
  texto: string;
  inicio_s: number;
  fin_s: number;
}

/** Todas las palabras narradas del video final con su tiempo en segundos (salen de los subtítulos). */
export function palabrasDelVideo(timeline: Pick<Timeline, "pistas" | "fps">): PalabraTiempo[] {
  return timeline.pistas.subtitulos.flatMap((b) => b.palabras.map((p) => ({ texto: p.texto, inicio_s: p.desde / timeline.fps, fin_s: p.hasta / timeline.fps })));
}

/**
 * Lleva el inicio y el final a límite de palabra para no cortar una palabra a la mitad:
 * el inicio, a la palabra que empieza más cerca; el final, a la que termina más cerca.
 */
export function ajustarAPalabras(palabras: PalabraTiempo[], desde_s: number, hasta_s: number): { desde_s: number; hasta_s: number } {
  if (!palabras.length) return { desde_s, hasta_s };
  const cercano = (valores: number[], x: number) => valores.reduce((mejor, v) => (Math.abs(v - x) < Math.abs(mejor - x) ? v : mejor), valores[0]);
  const inicio = cercano(palabras.map((p) => p.inicio_s), desde_s);
  const fin = cercano(palabras.map((p) => p.fin_s), hasta_s);
  return { desde_s: Math.round(inicio * 100) / 100, hasta_s: Math.round(fin * 100) / 100 };
}

/** Duración real del recorte (sin la tarjeta de cierre y sin el llamado, que se saca). */
export function duracionRecorteS(timeline: Timeline, r: Pick<Recorte, "desde_s" | "hasta_s">): number {
  const segmentos = segmentosRecorte(timeline, Math.round(r.desde_s * timeline.fps), Math.round(r.hasta_s * timeline.fps));
  return framesContenido(segmentos) / timeline.fps;
}

/** Errores (impiden renderizar) y avisos (solo informan) de un recorte. */
export function validarRecorte(timeline: Timeline, r: Recorte): { errores: string[]; avisos: string[] } {
  const errores: string[] = [];
  const avisos: string[] = [];
  const total = timeline.duracion_frames / timeline.fps;
  if (r.hasta_s <= r.desde_s) errores.push("el final debe ser mayor que el inicio");
  if (r.desde_s >= total) errores.push(`empieza en ${r.desde_s} s pero el video dura ${total.toFixed(1)} s`);
  if (r.hasta_s > total + 0.05) errores.push(`termina en ${r.hasta_s} s pero el video dura ${total.toFixed(1)} s`);
  if (errores.length) return { errores, avisos };
  const dur = duracionRecorteS(timeline, r);
  if (dur < MIN_RECORTE_S) errores.push(`dura ${dur.toFixed(1)} s: es muy corto (mínimo ${MIN_RECORTE_S} s)`);
  if (r.tipo === "short" && dur > MAX_SHORT_S) avisos.push(`dura ${Math.round(dur)} s y los Shorts admiten hasta ${MAX_SHORT_S} s (confírmalo en YouTube)`);
  if (r.tipo === "reel" && dur > MAX_REEL_S) avisos.push(`dura ${Math.round(dur)} s; los Reels rinden mejor hasta ${MAX_REEL_S} s (confírmalo en Instagram)`);
  return { errores, avisos };
}

export async function huellaTimeline(ctx: ContextoPaso): Promise<string> {
  return huellaArchivo(ctx.espacio.rutas.timeline);
}

/** Props del render vertical de un recorte, con el texto de cierre del estilo (o el propio del recorte). */
export function recorteVertical(ctx: ContextoPaso, timeline: Timeline, r: Recorte): RecorteVertical {
  const { recortes, llamado } = ctx.estilo.estilo;
  const texto = r.texto_cierre ?? (r.tipo === "short" ? recortes.texto_short : recortes.texto_reel);
  const subtexto = r.tipo === "short" ? (recortes.subtexto_short ?? llamado.canal) : recortes.subtexto_reel;
  return {
    tipo: r.tipo,
    desde: Math.round(r.desde_s * timeline.fps),
    hasta: Math.round(r.hasta_s * timeline.fps),
    enfoque: r.enfoque,
    cierre: { texto, subtexto, frames: Math.round(recortes.cierre_s * timeline.fps) },
  };
}

export interface AgregarRecorte {
  tipo: Recorte["tipo"];
  desde_s: number;
  hasta_s: number;
  id?: string;
  titulo?: string;
  enfoque?: number;
  texto_cierre?: string;
  /** Sin ajuste, los segundos se usan tal cual (por defecto se llevan a límite de palabra). */
  sinAjuste?: boolean;
}

/** Crea o reemplaza (mismo id) un recorte. Devuelve cómo quedó y si se ajustaron los segundos. */
export async function agregarRecorte(ctx: ContextoPaso, datos: AgregarRecorte) {
  if (!(await existe(ctx.espacio.rutas.timeline))) {
    throw new ErrorGuion2Video("Aún no hay video armado: ejecuta primero la composición (pnpm guion2video ejecutar <slug> --hasta composicion)", "dependencia");
  }
  const timeline = await leerTimeline(ctx);
  const archivo = await leerRecortes(ctx);
  const ajustado = datos.sinAjuste ? { desde_s: datos.desde_s, hasta_s: datos.hasta_s } : ajustarAPalabras(palabrasDelVideo(timeline), datos.desde_s, datos.hasta_s);
  const id = datos.id ?? siguienteId(archivo, datos.tipo);
  const recorte = Recorte.parse({
    id,
    tipo: datos.tipo,
    titulo: datos.titulo,
    desde_s: ajustado.desde_s,
    hasta_s: ajustado.hasta_s,
    enfoque: datos.enfoque,
    texto_cierre: datos.texto_cierre,
    huella_timeline: await huellaTimeline(ctx),
  });
  const v = validarRecorte(timeline, recorte);
  if (v.errores.length) throw new ErrorGuion2Video(`El recorte no es válido: ${v.errores.join("; ")}`, "validacion");
  const i = archivo.recortes.findIndex((r) => r.id === id);
  if (i >= 0) archivo.recortes[i] = recorte;
  else archivo.recortes.push(recorte);
  await guardarRecortes(ctx, archivo);
  return { recorte, avisos: v.avisos, ajustado: ajustado.desde_s !== datos.desde_s || ajustado.hasta_s !== datos.hasta_s, duracion_s: duracionRecorteS(timeline, recorte) };
}

function siguienteId(archivo: ArchivoRecortes, tipo: Recorte["tipo"]): string {
  for (let n = 1; ; n++) if (!archivo.recortes.some((r) => r.id === `${tipo}-${n}`)) return `${tipo}-${n}`;
}

export async function quitarRecorte(ctx: ContextoPaso, id: string) {
  const archivo = await leerRecortes(ctx);
  if (!archivo.recortes.some((r) => r.id === id)) throw new ErrorGuion2Video(`No existe el recorte "${id}"`, "no_encontrado");
  archivo.recortes = archivo.recortes.filter((r) => r.id !== id);
  await guardarRecortes(ctx, archivo);
}

export type EstadoRecorte = "pendiente" | "al_dia" | "obsoleto";

export interface InfoRecorte {
  recorte: Recorte;
  estado: EstadoRecorte;
  duracion_s?: number;
  errores: string[];
  avisos: string[];
  /** El video cambió desde que se definió el recorte: los segundos pueden apuntar a otro momento. */
  desfasado: boolean;
  archivo?: string;
}

async function huellaRecorte(ctx: ContextoPaso, r: Recorte, fuentes: string): Promise<string> {
  const { huella_timeline: _h, ...definicion } = r;
  return huella("recorte", VERSION, definicion, ctx.estilo.estilo.recortes, ctx.estilo.estilo.llamado.canal ?? null, await huellaTimeline(ctx), fuentes);
}

export async function estadoRecortes(ctx: ContextoPaso): Promise<InfoRecorte[]> {
  const archivo = await leerRecortes(ctx);
  if (!archivo.recortes.length) return [];
  const timeline = (await existe(ctx.espacio.rutas.timeline)) ? await leerTimeline(ctx) : undefined;
  const actual = await huellaTimeline(ctx);
  const fuentes = await huellaFuentes();
  return Promise.all(
    archivo.recortes.map(async (recorte): Promise<InfoRecorte> => {
      const v = timeline ? validarRecorte(timeline, recorte) : { errores: ["falta la composición del video"], avisos: [] };
      const meta = await leerJsonSiExiste<{ huella: string }>(rutaMeta(ctx, recorte.id));
      const hay = await existe(rutaVideoRecorte(ctx, recorte.id));
      let estado: EstadoRecorte = "pendiente";
      if (meta && hay) estado = !v.errores.length && meta.huella === (await huellaRecorte(ctx, recorte, fuentes)) ? "al_dia" : "obsoleto";
      return {
        recorte,
        estado,
        duracion_s: timeline && !v.errores.length ? duracionRecorteS(timeline, recorte) : undefined,
        errores: v.errores,
        avisos: v.avisos,
        desfasado: !!recorte.huella_timeline && recorte.huella_timeline !== actual,
        archivo: hay ? `salida/recortes/${recorte.id}.mp4` : undefined,
      };
    }),
  );
}

/** Renderiza los recortes pendientes u obsoletos (o los indicados). Lo que está al día no se vuelve a renderizar. */
export async function renderizarRecortes(ctx: ContextoPaso, op: { ids?: string[]; forzar?: boolean } = {}) {
  const info = await estadoRecortes(ctx);
  const elegidos = info.filter((i) => !op.ids?.length || op.ids.includes(i.recorte.id));
  if (op.ids?.length) {
    const faltan = op.ids.filter((id) => !info.some((i) => i.recorte.id === id));
    if (faltan.length) throw new ErrorGuion2Video(`No existe el recorte: ${faltan.join(", ")}`, "no_encontrado");
  }
  const timeline = await leerTimeline(ctx);
  const fuentes = await huellaFuentes();
  await asegurarCarpeta(ctx.espacio.ruta("salida", "recortes"));
  const hechos: { id: string; duracion_s: number; segundos_render: number }[] = [];
  const omitidos: string[] = [];
  const errores: string[] = [];
  for (const i of elegidos) {
    const r = i.recorte;
    if (i.errores.length) {
      errores.push(`${r.id}: ${i.errores.join("; ")}`);
      continue;
    }
    if (i.estado === "al_dia" && !op.forzar) {
      omitidos.push(r.id);
      continue;
    }
    const salida = rutaVideoRecorte(ctx, r.id);
    const tmp = `${salida}.parcial.mp4`;
    const inicio = Date.now();
    let ultimo = -1;
    await renderizarVertical({
      timeline,
      recorte: recorteVertical(ctx, timeline, r),
      dirProyecto: ctx.espacio.dir,
      salida: tmp,
      alProgreso: (p, etapa) => {
        const pct = Math.floor(p * 100);
        if (pct !== ultimo) {
          ultimo = pct;
          ctx.log.progreso(`recorte ${r.id}`, pct, 100, etapa);
        }
      },
    });
    await rename(tmp, salida);
    await escribirJson(rutaMeta(ctx, r.id), { huella: await huellaRecorte(ctx, r, fuentes), fecha: new Date().toISOString() });
    const duracion = (i.duracion_s ?? 0) + ctx.estilo.estilo.recortes.cierre_s;
    hechos.push({ id: r.id, duracion_s: duracion, segundos_render: (Date.now() - inicio) / 1000 });
    ctx.log.info(`Recorte ${r.id} listo (${duracion.toFixed(0)} s): ${salida}`);
  }
  return { hechos, omitidos, errores };
}
