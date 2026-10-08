import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ejecutarComando, conTemporal } from "../medios.ts";
import { ErrorProveedor } from "../http.ts";
import type { ProveedorVoz } from "../tipos.ts";

/**
 * Voz del sistema de macOS (`say`). Gratis y sin red: sirve para borradores y para
 * revisar ritmo y duración antes de gastar en la voz clonada.
 */
export function crearVozLocal(cfg: Record<string, unknown>): ProveedorVoz {
  const voz = String(cfg.voz ?? "Paulina");
  const ppm = Number(cfg.palabras_por_minuto ?? 170);
  return {
    id: "local-say",
    modelo: `say:${voz}`,
    estimarCosto: () => 0,
    async sintetizar({ texto, opciones }) {
      if (process.platform !== "darwin") {
        throw new ErrorProveedor("local-say", "La voz local solo está disponible en macOS", 400, false);
      }
      return conTemporal(async (dir) => {
        const salida = join(dir, "voz.wav");
        await ejecutarComando("say", [
          "-v", voz,
          "-r", String(Math.round(ppm * opciones.velocidad)),
          "-o", salida,
          "--file-format=WAVE",
          "--data-format=LEI16@44100",
          texto,
        ]);
        return { audio: await readFile(salida), formato: "wav" as const, costoUsd: 0 };
      });
    },
  };
}
