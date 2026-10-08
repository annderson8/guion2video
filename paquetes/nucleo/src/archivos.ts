import { mkdir, readFile, rename, writeFile, stat, copyFile, link, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import type { z } from "zod";

export async function existe(ruta: string): Promise<boolean> {
  try {
    await stat(ruta);
    return true;
  } catch {
    return false;
  }
}

export async function asegurarCarpeta(ruta: string): Promise<void> {
  await mkdir(ruta, { recursive: true });
}

/** Escritura atómica: se escribe a un temporal y se renombra, para no dejar archivos a medias. */
export async function escribirArchivo(ruta: string, datos: string | Buffer): Promise<void> {
  await asegurarCarpeta(dirname(ruta));
  const tmp = `${ruta}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, datos);
  await rename(tmp, ruta);
}

export async function escribirJson(ruta: string, datos: unknown): Promise<void> {
  await escribirArchivo(ruta, JSON.stringify(datos, null, 2) + "\n");
}

export async function leerJson<T>(ruta: string, esquema?: z.ZodType<T>): Promise<T> {
  const texto = await readFile(ruta, "utf8");
  let datos: unknown;
  try {
    datos = JSON.parse(texto);
  } catch (e) {
    throw new Error(`JSON inválido en ${ruta}: ${(e as Error).message}`);
  }
  if (!esquema) return datos as T;
  const r = esquema.safeParse(datos);
  if (!r.success) {
    throw new Error(`${ruta} no cumple el esquema:\n${formatearErrorZod(r.error)}`);
  }
  return r.data;
}

export async function leerJsonSiExiste<T>(ruta: string, esquema?: z.ZodType<T>): Promise<T | undefined> {
  if (!(await existe(ruta))) return undefined;
  return leerJson(ruta, esquema);
}

export function formatearErrorZod(error: z.ZodError): string {
  return error.issues
    .map((i) => `  • ${i.path.length ? i.path.join(".") + ": " : ""}${i.message}`)
    .join("\n");
}

/** Copia un archivo desde la caché a su nombre legible. Intenta enlace duro para no duplicar espacio. */
export async function enlazarOCopiar(origen: string, destino: string): Promise<void> {
  await asegurarCarpeta(dirname(destino));
  if (await existe(destino)) await unlink(destino);
  try {
    await link(origen, destino);
  } catch {
    await copyFile(origen, destino);
  }
}
