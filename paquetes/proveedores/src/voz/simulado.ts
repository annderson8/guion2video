import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { contarPalabras, type CalculadoraCostos } from "@guion2video/nucleo";
import { ffmpeg, conTemporal } from "../medios.ts";
import { alineacionEstimada } from "../alineacion-estimada.ts";
import type { ProveedorVoz } from "../tipos.ts";

/** Voz falsa: un tono modulado con la duración que tendría la narración (≈2,6 palabras/s). */
export function crearVozSimulada(costos?: CalculadoraCostos): ProveedorVoz {
  return {
    id: "simulado",
    modelo: "tono",
    estimarCosto: (texto) => costos?.voz("simulado", texto.length) ?? 0,
    async sintetizar({ texto, opciones }) {
      const segundos = Math.max(0.8, contarPalabras(texto) / (2.6 * opciones.velocidad) + 0.3);
      return conTemporal(async (dir) => {
        const salida = join(dir, "voz.wav");
        await ffmpeg([
          "-f", "lavfi",
          "-i", `sine=frequency=170:sample_rate=48000:duration=${segundos.toFixed(3)}`,
          "-af", "volume='0.25+0.2*sin(2*PI*3.5*t)':eval=frame,afade=t=in:d=0.05,areverse,afade=t=in:d=0.1,areverse",
          "-ac", "1",
          salida,
        ]);
        return {
          audio: await readFile(salida),
          formato: "wav" as const,
          alineacion: alineacionEstimada(texto, Math.round(segundos * 1000)),
          costoUsd: costos?.voz("simulado", texto.length) ?? 0,
        };
      });
    },
  };
}
