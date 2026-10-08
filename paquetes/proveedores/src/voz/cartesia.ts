import type { CalculadoraCostos } from "@guion2video/nucleo";
import { exigirClave, pedir, ErrorProveedor } from "../http.ts";
import type { ProveedorVoz } from "../tipos.ts";

export function crearCartesia(clave: string | undefined, cfg: Record<string, unknown>, costos: CalculadoraCostos): ProveedorVoz {
  const modelo = String(cfg.modelo ?? "sonic-3");
  const version = String(cfg.version_api ?? "2026-03-01");
  return {
    id: "cartesia",
    modelo,
    estimarCosto: (texto) => costos.voz("cartesia", texto.length),
    async sintetizar({ texto, vozId, opciones }) {
      const apiKey = exigirClave("cartesia", "CARTESIA_API_KEY", clave);
      if (!vozId || vozId === "VOZ_CLONADA_ID") {
        throw new ErrorProveedor("cartesia", "Configura voz.voz_id en estilo.json con el ID de tu voz clonada", 400, false);
      }
      const cuerpo: Record<string, unknown> = {
        model_id: modelo,
        transcript: texto,
        voice: { mode: "id", id: vozId },
        language: String(cfg.idioma ?? opciones.idioma),
        output_format: { container: "wav", encoding: "pcm_s16le", sample_rate: 44100 },
      };
      if (opciones.velocidad !== 1) cuerpo.generation_config = { speed: opciones.velocidad };
      const r = await pedir("cartesia", "https://api.cartesia.ai/tts/bytes", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "cartesia-version": version,
          "content-type": "application/json",
        },
        body: JSON.stringify(cuerpo),
      });
      // Cartesia no devuelve tiempos en este endpoint: el paso de alineación transcribe el audio.
      return { audio: Buffer.from(await r.arrayBuffer()), formato: "wav", costoUsd: costos.voz("cartesia", texto.length) };
    },
  };
}
