import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { CalculadoraCostos } from "@guion2video/nucleo";
import { exigirClave, pedirJson } from "../http.ts";
import { duracionMs } from "../medios.ts";
import type { ProveedorTranscripcion } from "../tipos.ts";

interface RespuestaWhisper {
  duration?: number;
  words?: { word: string; start: number; end: number }[];
}

/** Whisper vía API de OpenAI con marcas de tiempo por palabra. */
export function crearWhisper(clave: string | undefined, modelo: string, costos: CalculadoraCostos): ProveedorTranscripcion {
  const id = "openai-whisper";
  return {
    id,
    modelo,
    estimarCosto: (segundos) => costos.transcripcion(id, segundos),
    async transcribir({ archivo, idioma, texto }) {
      const apiKey = exigirClave(id, "OPENAI_API_KEY", clave);
      const form = new FormData();
      form.append("file", new Blob([new Uint8Array(await readFile(archivo))]), basename(archivo));
      form.append("model", modelo);
      form.append("language", idioma);
      form.append("response_format", "verbose_json");
      form.append("timestamp_granularities[]", "word");
      // El texto esperado ayuda a escribir bien nombres propios.
      if (texto) form.append("prompt", texto.slice(0, 800));
      const r = await pedirJson<RespuestaWhisper>(id, "https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}` },
        body: form,
      });
      const segundos = r.duration ?? (await duracionMs(archivo)) / 1000;
      return {
        palabras: (r.words ?? []).map((w) => ({
          palabra: w.word.trim(),
          inicio_ms: Math.round(w.start * 1000),
          fin_ms: Math.round(w.end * 1000),
        })),
        costoUsd: costos.transcripcion(id, segundos),
      };
    },
  };
}
