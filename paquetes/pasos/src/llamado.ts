import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  conReintentos,
  ErrorGuion2Video,
  escribirArchivo,
  escribirJson,
  existe,
  huella,
  leerJsonSiExiste,
  normalizarPalabra,
  palabras,
  prepararHabla,
  type Bitacora,
  type EstiloCargado,
  type PalabraAlineada,
  type TokenHabla,
} from "@guion2video/nucleo";
import { conTemporal, duracionMs, esReintentable, normalizarSonoridad, type Proveedores } from "@guion2video/proveedores";
import { alinearSecuencias, aPalabrasEscritas } from "./alineacion.ts";

const VERSION = 1;

/** Voz y tiempos del llamado a suscribirse: viven en estilos/<id>/llamado/ y los comparten todos los proyectos del estilo. */
export interface MetaLlamado {
  huella: string;
  archivo: string;
  texto: string;
  texto_hablado: string;
  tokens: TokenHabla[];
  palabras: PalabraAlineada[];
  duracion_ms: number;
  proveedor: string;
  modelo: string;
  fuente: "proveedor" | "transcripcion" | "estimada";
  costo_usd: number;
  fecha: string;
}

export const dirLlamado = (estilo: EstiloCargado) => join(estilo.dir, "llamado");
export const rutaVozLlamado = (estilo: EstiloCargado) => join(dirLlamado(estilo), "voz.wav");
const rutaMeta = (estilo: EstiloCargado) => join(dirLlamado(estilo), "llamado.json");

/** Huella de lo que determina el audio: texto hablado + voz. Si cambia, hay que regenerar. */
export function huellaLlamado(estilo: EstiloCargado, proveedores: Proveedores): string {
  const { voz, llamado } = estilo.estilo;
  const prov = proveedores.voz(llamado.voz_proveedor ?? voz.proveedor);
  const hablado = prepararHabla(llamado.texto, estilo.pronunciacion, { normalizarNumeros: voz.normalizar_numeros });
  return huella("llamado", VERSION, hablado.hablado, prov.id, prov.modelo, voz.voz_id, voz.velocidad, voz.estabilidad, voz.similitud, voz.lufs);
}

export const leerMetaLlamado = (estilo: EstiloCargado) => leerJsonSiExiste<MetaLlamado>(rutaMeta(estilo));

export type EstadoLlamado = "desactivado" | "sin_generar" | "obsoleto" | "al_dia";

export async function estadoLlamado(estilo: EstiloCargado, proveedores: Proveedores): Promise<{ estado: EstadoLlamado; meta?: MetaLlamado }> {
  if (!estilo.estilo.llamado.activo) return { estado: "desactivado" };
  const meta = await leerMetaLlamado(estilo);
  if (!meta || !(await existe(rutaVozLlamado(estilo)))) return { estado: "sin_generar" };
  return { estado: meta.huella === huellaLlamado(estilo, proveedores) ? "al_dia" : "obsoleto", meta };
}

/** Meta del llamado solo si está al día; la composición la usa para decidir si lo inserta. */
export async function llamadoVigente(estilo: EstiloCargado, proveedores: Proveedores): Promise<MetaLlamado | undefined> {
  const e = await estadoLlamado(estilo, proveedores);
  return e.estado === "al_dia" ? e.meta : undefined;
}

export function estimarLlamado(estilo: EstiloCargado, proveedores: Proveedores): number {
  const { voz, llamado } = estilo.estilo;
  const hablado = prepararHabla(llamado.texto, estilo.pronunciacion, { normalizarNumeros: voz.normalizar_numeros });
  return proveedores.voz(llamado.voz_proveedor ?? voz.proveedor).estimarCosto(hablado.hablado);
}

/** Genera la voz y la alineación del llamado una sola vez para el estilo. Sin `forzar`, si está al día no gasta nada. */
export async function generarLlamado(op: { estilo: EstiloCargado; proveedores: Proveedores; log: Bitacora; forzar?: boolean }): Promise<{ meta: MetaLlamado; generado: boolean }> {
  const { estilo, proveedores, log } = op;
  const { voz, llamado } = estilo.estilo;
  if (!llamado.texto.trim()) throw new ErrorGuion2Video("El llamado no tiene texto: escríbelo en el estilo (llamado.texto)", "validacion");
  const actual = await estadoLlamado(estilo, proveedores);
  if (actual.estado === "al_dia" && !op.forzar) return { meta: actual.meta!, generado: false };

  const prov = proveedores.voz(llamado.voz_proveedor ?? voz.proveedor);
  const hablado = prepararHabla(llamado.texto, estilo.pronunciacion, { normalizarNumeros: voz.normalizar_numeros });
  log.info(`Generando la voz del llamado (${hablado.hablado.length} caracteres, ${prov.id})…`);
  const sintesis = await conReintentos(
    () => prov.sintetizar({ texto: hablado.hablado, vozId: voz.voz_id, opciones: { velocidad: voz.velocidad, estabilidad: voz.estabilidad, similitud: voz.similitud, idioma: estilo.estilo.idioma } }),
    { reintentable: esReintentable, alReintentar: (e, n) => log.aviso(`llamado: reintento ${n} (${(e as Error).message.slice(0, 120)})`) },
  );
  const datos = await conTemporal(async (dir) => {
    const crudo = join(dir, `crudo.${sintesis.formato}`);
    const salida = join(dir, "norm.wav");
    await writeFile(crudo, sintesis.audio);
    await normalizarSonoridad(crudo, salida, { lufs: voz.lufs, frecuencia: 48000, canales: 1, codec: ["-c:a", "pcm_s16le"] });
    return readFile(salida);
  });
  const archivo = rutaVozLlamado(estilo);
  await escribirArchivo(archivo, datos);
  const duracion = await duracionMs(archivo);

  // Tiempos por palabra: los del proveedor si los trae; si no, Whisper o un reparto proporcional.
  let obtenidas: PalabraAlineada[];
  let fuente: MetaLlamado["fuente"];
  let costoTranscripcion = 0;
  if (sintesis.alineacion?.length) {
    obtenidas = sintesis.alineacion;
    fuente = "proveedor";
  } else {
    const trans = proveedores.transcripcion();
    const r = await trans.transcribir({ archivo, idioma: estilo.estilo.idioma, texto: hablado.hablado });
    obtenidas = r.palabras;
    costoTranscripcion = r.costoUsd;
    fuente = trans.id === "openai-whisper" ? "transcripcion" : "estimada";
  }
  const tiempos = alinearSecuencias(palabras(hablado.hablado), obtenidas, duracion);
  const meta: MetaLlamado = {
    huella: huellaLlamado(estilo, proveedores),
    archivo: "voz.wav",
    texto: llamado.texto,
    texto_hablado: hablado.hablado,
    tokens: hablado.tokens,
    palabras: aPalabrasEscritas(hablado.tokens, tiempos),
    duracion_ms: duracion,
    proveedor: prov.id,
    modelo: prov.modelo,
    fuente,
    costo_usd: sintesis.costoUsd + costoTranscripcion,
    fecha: new Date().toISOString(),
  };
  await escribirJson(rutaMeta(estilo), meta);
  log.info(`Llamado listo: ${(duracion / 1000).toFixed(1)} s en ${archivo}`);
  return { meta, generado: true };
}

/**
 * Frames (desde el inicio del segmento) en que el cursor hace clic: a mitad de "suscríbete" y de "gusta".
 * Si el texto no dice alguna de las dos, ese clic queda sin definir y la animación lo reparte sola.
 */
export function clicsLlamado(palabras: PalabraAlineada[], fps: number, inicioVozMs: number): { suscribir?: number; like?: number } {
  const frame = (p: PalabraAlineada) => Math.round(((inicioVozMs + p.inicio_ms + (p.fin_ms - p.inicio_ms) * 0.55) * fps) / 1000);
  const suscribir = palabras.find((p) => normalizarPalabra(p.palabra).startsWith("suscrib"));
  const like = palabras.find((p) => ["gusta", "like"].includes(normalizarPalabra(p.palabra)));
  return { suscribir: suscribir && frame(suscribir), like: like && frame(like) };
}
