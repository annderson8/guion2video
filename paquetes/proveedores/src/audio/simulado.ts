import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { sha256 } from "@guion2video/nucleo";
import { conTemporal, ffmpeg } from "../medios.ts";
import type { ProveedorAudio } from "../tipos.ts";

/** Música y efectos falsos generados con ffmpeg (acordes y ruido). */
export function crearAudioSimulado(): ProveedorAudio {
  return {
    id: "simulado",
    async buscar({ tipo, etiqueta }) {
      return [
        {
          id: `simulado-${tipo}-${etiqueta}`,
          titulo: `${tipo === "musica" ? "Pista" : "Efecto"} simulado: ${etiqueta}`,
          autor: "guion2video",
          licencia: "CC0",
          origen: `${tipo}:${etiqueta}`,
        },
      ];
    },
    async descargar(c) {
      const [tipo, etiqueta] = c.origen.split(":");
      const base = 110 + (parseInt(sha256(etiqueta).slice(0, 2), 16) % 60);
      return conTemporal(async (dir) => {
        const salida = join(dir, "a.mp3");
        if (tipo === "musica") {
          await ffmpeg([
            "-f", "lavfi", "-i", `sine=frequency=${base}:duration=90`,
            "-f", "lavfi", "-i", `sine=frequency=${(base * 1.5).toFixed(1)}:duration=90`,
            "-f", "lavfi", "-i", `sine=frequency=${(base * 1.2).toFixed(1)}:duration=90`,
            "-filter_complex", "[0][1][2]amix=inputs=3,volume='0.6+0.3*sin(2*PI*0.1*t)':eval=frame,afade=t=in:d=2",
            "-ac", "2", "-ar", "48000", salida,
          ]);
        } else {
          await ffmpeg(["-f", "lavfi", "-i", "anoisesrc=color=pink:duration=3:amplitude=0.3", "-af", "afade=t=in:d=0.3,afade=t=out:st=2.2:d=0.8", "-ac", "2", salida]);
        }
        return readFile(salida);
      });
    },
  };
}
