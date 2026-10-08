import { readFile } from "node:fs/promises";
import { extname } from "node:path";

export const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

export async function leerReferencias(rutas: string[]) {
  return Promise.all(
    rutas.map(async (ruta) => ({
      ruta,
      mime: MIME[extname(ruta).toLowerCase()] ?? "image/png",
      datos: await readFile(ruta),
    })),
  );
}

/** Para modelos sin "negative prompt": lo que hay que evitar va dentro del texto. */
export function promptConNegativo(prompt: string, negativo?: string): string {
  return negativo?.trim() ? `${prompt}\n\nEvitar: ${negativo.trim()}.` : prompt;
}

export const INSTRUCCION_REFERENCIAS =
  "Las imágenes adjuntas son solo referencia de estilo visual (paleta, trazo, textura, iluminación). No copies su contenido ni sus personajes.";
