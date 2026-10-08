import { readdir, readFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { existe, leerJsonSiExiste } from "@guion2video/nucleo";
import type { CandidatoAudio, ProveedorAudio } from "../tipos.ts";

interface Creditos {
  titulo?: string;
  autor?: string;
  licencia?: string;
  url_licencia?: string;
  url_fuente?: string;
}

/**
 * Biblioteca propia de pistas libres de derechos:
 *   biblioteca/musica/<etiqueta>/*.mp3   y   biblioteca/efectos/<etiqueta>/*.mp3
 * Junto a cada archivo puede ir <archivo>.json con { titulo, autor, licencia, url_fuente }.
 */
export function crearBiblioteca(raiz: string): ProveedorAudio {
  return {
    id: "biblioteca",
    async buscar({ tipo, etiqueta }) {
      const dir = join(raiz, tipo === "musica" ? "musica" : "efectos", etiqueta);
      if (!(await existe(dir))) return [];
      const archivos = (await readdir(dir)).filter((a) => /\.(mp3|wav|m4a|ogg|flac)$/i.test(a)).sort();
      return Promise.all(
        archivos.map(async (a) => {
          const ruta = join(dir, a);
          const c = (await leerJsonSiExiste<Creditos>(`${ruta}.json`)) ?? {};
          return {
            id: `biblioteca-${tipo}-${etiqueta}-${basename(a, extname(a))}`,
            titulo: c.titulo ?? basename(a, extname(a)),
            autor: c.autor ?? "",
            licencia: c.licencia ?? "",
            url_licencia: c.url_licencia,
            url_fuente: c.url_fuente,
            origen: ruta,
          } satisfies CandidatoAudio;
        }),
      );
    },
    descargar: (c) => readFile(c.origen),
  };
}
