import { basename } from "node:path";
import type { CalculadoraCostos } from "@guion2video/nucleo";
import { exigirClave, pedirJson } from "../http.ts";
import type { ProveedorImagen } from "../tipos.ts";
import { INSTRUCCION_REFERENCIAS, leerReferencias, promptConNegativo } from "./comun.ts";

interface RespuestaImagenes {
  data: { b64_json?: string; revised_prompt?: string }[];
  usage?: Record<string, unknown>;
}

/** OpenAI GPT Image 2: calidad premium y texto legible dentro de la imagen (miniaturas). */
export function crearGptImage(clave: string | undefined, cfg: Record<string, unknown>, costos: CalculadoraCostos): ProveedorImagen {
  const id = "openai-gpt-image-2";
  const modelo = String(cfg.modelo ?? "gpt-image-2");
  const tamano = String(cfg.tamano ?? "1536x1024");
  return {
    id,
    modelo,
    estimarCosto: ({ calidad }) => costos.imagen(id, calidad),
    async generar(p) {
      const apiKey = exigirClave(id, "OPENAI_API_KEY", clave);
      const calidad = String(p.calidad === "premium" ? (cfg.calidad_premium ?? "high") : (cfg.calidad_estandar ?? "medium"));
      const refs = await leerReferencias(p.referencias);
      const prompt = promptConNegativo(p.prompt, p.negativo) + (refs.length ? `\n\n${INSTRUCCION_REFERENCIAS}` : "");
      let r: RespuestaImagenes;
      if (refs.length) {
        const form = new FormData();
        form.append("model", modelo);
        form.append("prompt", prompt);
        form.append("size", tamano);
        form.append("quality", calidad);
        for (const ref of refs) {
          form.append("image[]", new Blob([new Uint8Array(ref.datos)], { type: ref.mime }), basename(ref.ruta));
        }
        r = await pedirJson(id, "https://api.openai.com/v1/images/edits", {
          method: "POST",
          headers: { authorization: `Bearer ${apiKey}` },
          body: form,
        });
      } else {
        r = await pedirJson(id, "https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({ model: modelo, prompt, size: tamano, quality: calidad, n: 1 }),
        });
      }
      const b64 = r.data?.[0]?.b64_json;
      if (!b64) throw new Error(`[${id}] La respuesta no trae imagen`);
      return {
        imagen: Buffer.from(b64, "base64"),
        costoUsd: costos.imagen(id, p.calidad),
        meta: { calidad_api: calidad, tamano, uso: r.usage },
      };
    },
  };
}
