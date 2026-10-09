import type { CalculadoraCostos } from "@guion2video/nucleo";
import { descargar, ErrorProveedor, exigirClave, pedirJson } from "../http.ts";
import type { ProveedorImagen } from "../tipos.ts";
import { promptConNegativo } from "./comun.ts";

const BASE = "https://api.atlascloud.ai/api/v1/model";

interface Prediccion {
  data?: { id?: string; status?: string; outputs?: string[]; error?: string };
}

/**
 * Atlas Cloud: agregador con una sola clave para Seedream, Nano Banana, FLUX, etc.
 * La API es asíncrona: crea la predicción y consulta hasta que termine.
 * Los parámetros de cada modelo (size, aspect_ratio, resolution…) van en configuracion.json.
 */
export function crearAtlas(id: string, clave: string | undefined, cfg: Record<string, unknown>, costos: CalculadoraCostos): ProveedorImagen {
  const modelo = String(cfg.modelo ?? "bytedance/seedream-v4.7/text-to-image");
  const parametros = (cfg.parametros ?? {}) as Record<string, unknown>;
  const parametrosPremium = (cfg.parametros_premium ?? {}) as Record<string, unknown>;
  return {
    id,
    modelo,
    estimarCosto: ({ calidad }) => costos.imagen(id, calidad),
    async generar(p) {
      const apiKey = exigirClave(id, "ATLAS_API_KEY", clave);
      const auth = { authorization: `Bearer ${apiKey}` };
      const creada = await pedirJson<Prediccion>(id, `${BASE}/generateImage`, {
        method: "POST",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({
          model: modelo,
          prompt: promptConNegativo(p.prompt, p.negativo),
          ...parametros,
          ...(p.calidad === "premium" ? parametrosPremium : {}),
        }),
      });
      const prediccionId = creada.data?.id;
      if (!prediccionId) throw new Error(`[${id}] La respuesta no trae id de predicción`);

      let d = creada.data!;
      const limite = Date.now() + 300_000;
      while (d.status !== "completed") {
        if (d.status === "failed") throw new ErrorProveedor(id, `Generación fallida: ${d.error ?? "sin detalle"}`, undefined, false);
        if (Date.now() > limite) throw new ErrorProveedor(id, `Sin resultado tras 5 min (predicción ${prediccionId})`);
        await new Promise((r) => setTimeout(r, 2000));
        d = (await pedirJson<Prediccion>(id, `${BASE}/prediction/${prediccionId}`, { headers: auth, timeoutMs: 30_000 })).data ?? {};
      }
      const url = d.outputs?.[0];
      if (!url) throw new Error(`[${id}] La respuesta no trae imagen`);
      return { imagen: await descargar(id, url), costoUsd: costos.imagen(id, p.calidad), meta: { prediccion: prediccionId } };
    },
  };
}
