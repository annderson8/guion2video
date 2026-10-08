import { join } from "node:path";
import { enlazarOCopiar, escribirArchivo, existe, leerJsonSiExiste, escribirJson, sha256 } from "@guion2video/nucleo";
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
  op: { huella: string; forzar?: boolean; llamar: () => Promise<{ datos: T; costoUsd: number; modelo: string; tokens: unknown }> },
): Promise<{ datos: T; costoUsd: number; modelo: string; desde_cache: boolean }> {
  const ruta = join(ctx.espacio.rutas.cache, "llm", `${op.huella}.json`);
  if (!op.forzar) {
    const previo = await leerJsonSiExiste<{ datos: T; modelo: string }>(ruta);
    if (previo) return { datos: previo.datos, modelo: previo.modelo, costoUsd: 0, desde_cache: true };
  }
  const r = await op.llamar();
  await escribirJson(ruta, { datos: r.datos, modelo: r.modelo, costo_usd: r.costoUsd, tokens: r.tokens, fecha: new Date().toISOString() });
  return { ...r, desde_cache: false };
}
