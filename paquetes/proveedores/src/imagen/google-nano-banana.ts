import type { CalculadoraCostos } from "@guion2video/nucleo";
import { exigirClave, pedirJson, ErrorProveedor } from "../http.ts";
import type { ProveedorImagen } from "../tipos.ts";
import { INSTRUCCION_REFERENCIAS, leerReferencias, promptConNegativo } from "./comun.ts";

interface RespuestaGemini {
  candidates?: {
    finishReason?: string;
    content?: { parts?: { text?: string; inlineData?: { mimeType: string; data: string } }[] };
  }[];
  promptFeedback?: { blockReason?: string };
}

/** Google Nano Banana 2 (Gemini 3.1 Flash Image) vía la API de Gemini. Admite imágenes de referencia. */
export function crearNanoBanana(clave: string | undefined, cfg: Record<string, unknown>, costos: CalculadoraCostos): ProveedorImagen {
  const id = "google-nano-banana-2";
  const modelo = String(cfg.modelo ?? "gemini-3.1-flash-image-preview");
  return {
    id,
    modelo,
    estimarCosto: ({ calidad }) => costos.imagen(id, calidad),
    async generar(p) {
      const apiKey = exigirClave(id, "GOOGLE_API_KEY", clave);
      const refs = await leerReferencias(p.referencias);
      const texto = promptConNegativo(p.prompt, p.negativo) + (refs.length ? `\n\n${INSTRUCCION_REFERENCIAS}` : "");
      const r = await pedirJson<RespuestaGemini>(
        id,
        `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`,
        {
          method: "POST",
          headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  ...refs.map((ref) => ({ inlineData: { mimeType: ref.mime, data: ref.datos.toString("base64") } })),
                  { text: texto },
                ],
              },
            ],
            generationConfig: {
              responseModalities: ["IMAGE"],
              imageConfig: {
                aspectRatio: p.relacionAspecto,
                imageSize: String(p.calidad === "premium" ? (cfg.tamano_premium ?? "4K") : (cfg.tamano ?? "2K")),
              },
            },
          }),
        },
      );
      if (r.promptFeedback?.blockReason) {
        throw new ErrorProveedor(id, `Prompt bloqueado (${r.promptFeedback.blockReason}). Reescribe el prompt.`, 400, false);
      }
      const candidato = r.candidates?.[0];
      const parte = candidato?.content?.parts?.find((x) => x.inlineData?.data);
      if (!parte?.inlineData) {
        const motivo = candidato?.finishReason ?? "sin imagen";
        // SAFETY / PROHIBITED_CONTENT no se arreglan reintentando el mismo prompt.
        const reintentable = !/SAFETY|PROHIBITED|BLOCK|IMAGE_SAFETY/.test(motivo);
        throw new ErrorProveedor(id, `La respuesta no trae imagen (${motivo})`, reintentable ? 502 : 400, reintentable);
      }
      return {
        imagen: Buffer.from(parte.inlineData.data, "base64"),
        costoUsd: costos.imagen(id, p.calidad),
        meta: { referencias: p.referencias.length, finishReason: candidato?.finishReason },
      };
    },
  };
}
