import type { CalculadoraCostos } from "@guion2video/nucleo";
import { descargar, exigirClave, pedirJson } from "../http.ts";
import type { ProveedorImagen } from "../tipos.ts";
import { promptConNegativo } from "./comun.ts";

interface RespuestaFal {
  images?: { url: string }[];
  seed?: number;
}

/** Seedream o FLUX vía fal.ai: alternativa barata para volumen. */
export function crearFal(id: string, clave: string | undefined, cfg: Record<string, unknown>, costos: CalculadoraCostos): ProveedorImagen {
  const modelo = String(cfg.modelo ?? "fal-ai/flux/schnell");
  return {
    id,
    modelo,
    estimarCosto: ({ calidad }) => costos.imagen(id, calidad),
    async generar(p) {
      const apiKey = exigirClave(id, "FAL_API_KEY", clave);
      const r = await pedirJson<RespuestaFal>(id, `https://fal.run/${modelo}`, {
        method: "POST",
        headers: { authorization: `Key ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          prompt: promptConNegativo(p.prompt, p.negativo),
          image_size: cfg.tamano ?? "landscape_16_9",
          num_images: 1,
          ...(p.semilla !== undefined ? { seed: p.semilla } : {}),
        }),
      });
      const url = r.images?.[0]?.url;
      if (!url) throw new Error(`[${id}] La respuesta no trae imagen`);
      return { imagen: await descargar(id, url), costoUsd: costos.imagen(id, p.calidad), meta: { semilla: r.seed } };
    },
  };
}
