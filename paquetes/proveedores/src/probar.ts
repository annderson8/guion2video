import Anthropic from "@anthropic-ai/sdk";
import type { Config, NombreClave } from "@guion2video/nucleo";
import { pedir } from "./http.ts";

export interface ResultadoPrueba {
  clave: NombreClave;
  presente: boolean;
  ok?: boolean;
  detalle: string;
}

/** Comprueba cada clave con una llamada gratuita (listar modelos, voces, etc.). Nunca genera contenido. */
export async function probarClaves(config: Config): Promise<ResultadoPrueba[]> {
  const k = config.claves;
  const pruebas: Record<NombreClave, (v: string) => Promise<string>> = {
    ANTHROPIC_API_KEY: async (v) => {
      const lista = await new Anthropic({ apiKey: v }).models.list({ limit: 5 });
      return `${lista.data.length} modelos visibles`;
    },
    OPENAI_API_KEY: async (v) => {
      await pedir("openai", "https://api.openai.com/v1/models", { headers: { authorization: `Bearer ${v}` }, timeoutMs: 15000 });
      return "ok";
    },
    GOOGLE_API_KEY: async (v) => {
      await pedir("google", "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", {
        headers: { "x-goog-api-key": v },
        timeoutMs: 15000,
      });
      return "ok";
    },
    FAL_API_KEY: async () => "presente (fal.ai no tiene un endpoint de prueba gratuito)",
    ELEVENLABS_API_KEY: async (v) => {
      await pedir("elevenlabs", "https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": v }, timeoutMs: 15000 });
      return "ok";
    },
    CARTESIA_API_KEY: async (v) => {
      await pedir("cartesia", "https://api.cartesia.ai/voices?limit=1", {
        headers: { authorization: `Bearer ${v}`, "cartesia-version": "2026-03-01" },
        timeoutMs: 15000,
      });
      return "ok";
    },
    JAMENDO_CLIENT_ID: async (v) => {
      const r = await pedir("jamendo", `https://api.jamendo.com/v3.0/tracks/?client_id=${encodeURIComponent(v)}&format=json&limit=1`, { timeoutMs: 15000 });
      const j = (await r.json()) as { headers?: { status?: string; error_message?: string } };
      if (j.headers?.status !== "success") throw new Error(j.headers?.error_message ?? "respuesta inesperada");
      return "ok";
    },
    FREESOUND_API_KEY: async (v) => {
      await pedir("freesound", `https://freesound.org/apiv2/search/text/?query=rain&page_size=1&token=${encodeURIComponent(v)}`, { timeoutMs: 15000 });
      return "ok";
    },
  };
  return Promise.all(
    (Object.keys(pruebas) as NombreClave[]).map(async (clave) => {
      const valor = k[clave];
      if (!valor) return { clave, presente: false, detalle: "sin configurar" };
      try {
        return { clave, presente: true, ok: true, detalle: await pruebas[clave](valor) };
      } catch (e) {
        return { clave, presente: true, ok: false, detalle: (e as Error).message.slice(0, 200) };
      }
    }),
  );
}
