import { lstat, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { asegurarCarpeta, enlazarOCopiar, escribirArchivo, existe, leerJsonSiExiste, escribirJson, sha256 } from "@guion2video/nucleo";
import type { ContextoPaso } from "./contexto.ts";

export interface EntradaCache {
  huella: string;
  archivo_huella: string;
  costo_usd: number;
  fecha: string;
  meta: Record<string, unknown>;
}

/**
 * Caché direccionada por contenido: cache/<tipo>/<huella>.<ext>.
 * Si la escena 14 pasa a llamarse escena-015 pero su contenido es el mismo, no se vuelve a pagar.
 */
export async function conCache(
  ctx: ContextoPaso,
  op: {
    tipo: string;
    huella: string;
    ext: string;
    destino: string;
    forzar?: boolean;
    generar: () => Promise<{ datos: Buffer; costo_usd: number; meta: Record<string, unknown> }>;
  },
): Promise<EntradaCache & { desde_cache: boolean }> {
  const base = join(ctx.espacio.rutas.cache, op.tipo, op.huella);
  const archivo = `${base}.${op.ext}`;
  const metaRuta = `${base}.json`;
  if (!op.forzar && (await existe(archivo))) {
    const meta = await leerJsonSiExiste<EntradaCache>(metaRuta);
    if (meta) {
      await enlazarOCopiar(archivo, op.destino);
      return { ...meta, desde_cache: true };
    }
  }
  const r = await op.generar();
  const entrada: EntradaCache = {
    huella: op.huella,
    archivo_huella: sha256(r.datos).slice(0, 24),
    costo_usd: r.costo_usd,
    fecha: new Date().toISOString(),
    meta: r.meta,
  };
  await escribirArchivo(archivo, r.datos);
  await escribirJson(metaRuta, entrada);
  await enlazarOCopiar(archivo, op.destino);
  return { ...entrada, desde_cache: false };
}

export async function registrarCosto(
  ctx: ContextoPaso,
  r: { paso: string; proveedor: string; modelo?: string; costo_usd: number; cache: boolean; escena?: string; unidad?: string; detalle?: Record<string, unknown> },
) {
  await ctx.costos.registrar({ ...r, costo_usd: r.cache ? 0 : r.costo_usd, fecha: new Date().toISOString() });
}

/**
 * Respuestas del LLM en caché por huella de (modelo, instrucciones, mensaje):
 * si una parte falla, al reintentar no se vuelven a pagar las que ya salieron bien.
 */
export async function llmConCache<T>(
  ctx: ContextoPaso,
  op: { huella: string; forzar?: boolean; /** Otras huellas válidas (p. ej. la misma petición hecha con otro modelo). */ alternativas?: string[]; llamar: () => Promise<{ datos: T; costoUsd: number; modelo: string; tokens: unknown }> },
): Promise<{ datos: T; costoUsd: number; modelo: string; desde_cache: boolean }> {
  const ruta = join(ctx.espacio.rutas.cache, "llm", `${op.huella}.json`);
  if (!op.forzar) {
    for (const h of [op.huella, ...(op.alternativas ?? [])]) {
      const previo = await leerJsonSiExiste<{ datos: T; modelo: string }>(join(ctx.espacio.rutas.cache, "llm", `${h}.json`));
      if (previo) return { datos: previo.datos, modelo: previo.modelo, costoUsd: 0, desde_cache: true };
    }
  }
  const r = await op.llamar();
  await escribirJson(ruta, { datos: r.datos, modelo: r.modelo, costo_usd: r.costoUsd, tokens: r.tokens, fecha: new Date().toISOString() });
  return { ...r, desde_cache: false };
}

export interface ResumenCache {
  archivos: number;
  /** Tamaño de todo lo que hay en cache/. */
  bytes: number;
  /**
   * Lo que de verdad se liberaría: los archivos de audio e imágenes del proyecto son enlaces duros a la caché,
   * así que borrar la caché no libera los que siguen en uso en audio/ o imagenes/.
   */
  liberable_bytes: number;
  por_tipo: Record<string, { archivos: number; bytes: number }>;
}

/** Cuánto ocupa la caché del proyecto y cuánto espacio se liberaría al borrarla. */
export async function resumenCache(ctx: ContextoPaso): Promise<ResumenCache> {
  const resumen: ResumenCache = { archivos: 0, bytes: 0, liberable_bytes: 0, por_tipo: {} };
  const raiz = ctx.espacio.rutas.cache;
  const recorrer = async (dir: string, tipo: string) => {
    let entradas;
    try {
      entradas = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entradas) {
      const ruta = join(dir, e.name);
      if (e.isDirectory()) {
        await recorrer(ruta, tipo || e.name);
        continue;
      }
      const info = await lstat(ruta);
      const grupo = (resumen.por_tipo[tipo || "otros"] ??= { archivos: 0, bytes: 0 });
      grupo.archivos++;
      grupo.bytes += info.size;
      resumen.archivos++;
      resumen.bytes += info.size;
      if (info.nlink <= 1) resumen.liberable_bytes += info.size;
    }
  };
  await recorrer(raiz, "");
  return resumen;
}

/**
 * Borra todo lo que hay en cache/ (voz, imágenes y respuestas de Claude). Los archivos del proyecto (audio/, imagenes/…)
 * no se tocan: lo que se pierde es la posibilidad de reutilizar lo generado sin volver a pagar.
 */
export async function limpiarCache(ctx: ContextoPaso): Promise<ResumenCache> {
  const antes = await resumenCache(ctx);
  await rm(ctx.espacio.rutas.cache, { recursive: true, force: true });
  await asegurarCarpeta(ctx.espacio.rutas.cache);
  return antes;
}
