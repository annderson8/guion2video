import type { CalculadoraCostos } from "@guion2video/nucleo";
import { exigirClave, pedirJson, ErrorProveedor } from "../http.ts";
import { palabrasDesdeCaracteres } from "../alineacion-estimada.ts";
import type { ProveedorVoz } from "../tipos.ts";

interface RespuestaConTiempos {
  audio_base64: string;
  alignment?: {
    characters: string[];
    character_start_times_seconds: number[];
    character_end_times_seconds: number[];
  };
}

export function crearElevenLabs(id: string, clave: string | undefined, cfg: Record<string, unknown>, costos: CalculadoraCostos): ProveedorVoz {
  const modelo = String(cfg.modelo ?? "eleven_multilingual_v2");
  const formato = String(cfg.formato ?? "mp3_44100_128");
  return {
    id,
    modelo,
    estimarCosto: (texto) => costos.voz(id, texto.length),
    async sintetizar({ texto, vozId, opciones }) {
      const apiKey = exigirClave(id, "ELEVENLABS_API_KEY", clave);
      if (!vozId || vozId === "VOZ_CLONADA_ID") {
        throw new ErrorProveedor(id, "Configura voz.voz_id en estilo.json con el ID de tu voz clonada", 400, false);
      }
      // El endpoint "with-timestamps" devuelve el audio y los tiempos por carácter en una sola llamada:
      // así no hace falta transcribir para obtener la alineación.
      const r = await pedirJson<RespuestaConTiempos>(
        id,
        `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(vozId)}/with-timestamps?output_format=${formato}`,
        {
          method: "POST",
          headers: { "xi-api-key": apiKey, "content-type": "application/json" },
          body: JSON.stringify({
            text: texto,
            model_id: modelo,
            voice_settings: {
              stability: opciones.estabilidad,
              similarity_boost: opciones.similitud,
              speed: opciones.velocidad,
            },
          }),
        },
      );
      const a = r.alignment;
      return {
        audio: Buffer.from(r.audio_base64, "base64"),
        formato: "mp3",
        alineacion: a
          ? palabrasDesdeCaracteres(a.characters, a.character_start_times_seconds, a.character_end_times_seconds)
          : undefined,
        costoUsd: costos.voz(id, texto.length),
      };
    },
  };
}
