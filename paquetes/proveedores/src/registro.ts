import { join } from "node:path";
import { CalculadoraCostos, ConfigProveedores, ErrorGuion2Video, leerJson, type Config } from "@guion2video/nucleo";
import type { ProveedorAudio, ProveedorImagen, ProveedorLlm, ProveedorTranscripcion, ProveedorVoz } from "./tipos.ts";
import { crearElevenLabs } from "./voz/elevenlabs.ts";
import { crearCartesia } from "./voz/cartesia.ts";
import { crearVozLocal } from "./voz/local-say.ts";
import { crearVozSimulada } from "./voz/simulado.ts";
import { crearNanoBanana } from "./imagen/google-nano-banana.ts";
import { crearGptImage } from "./imagen/openai-gpt-image.ts";
import { crearFal } from "./imagen/fal.ts";
import { crearImagenSimulada } from "./imagen/simulado.ts";
import { crearAnthropic } from "./llm/anthropic.ts";
import { crearLlmSimulado } from "./llm/simulado.ts";
import { crearWhisper } from "./transcripcion/whisper.ts";
import { crearJamendo } from "./audio/jamendo.ts";
import { crearFreesound } from "./audio/freesound.ts";
import { crearBiblioteca } from "./audio/biblioteca.ts";
import { crearAudioSimulado } from "./audio/simulado.ts";
import { alineacionEstimada } from "./alineacion-estimada.ts";
import { duracionMs } from "./medios.ts";

export interface Proveedores {
  simular: boolean;
  config: ConfigProveedores;
  costos: CalculadoraCostos;
  voz(id: string): ProveedorVoz;
  imagen(id: string): ProveedorImagen;
  llm(): ProveedorLlm;
  transcripcion(): ProveedorTranscripcion;
  audio(id: string): ProveedorAudio;
}

export async function cargarConfigProveedores(raiz: string): Promise<ConfigProveedores> {
  return leerJson(join(raiz, "configuracion.json"), ConfigProveedores);
}

export async function crearProveedores(
  config: Config,
  op: { avisar?: (m: string) => void; configProveedores?: ConfigProveedores; costos?: CalculadoraCostos } = {},
): Promise<Proveedores> {
  const cfg = op.configProveedores ?? (await cargarConfigProveedores(config.raiz));
  const costos = op.costos ?? (await CalculadoraCostos.cargar(config.raiz, op.avisar));
  const k = config.claves;
  const simular = config.simular;
  const cache = new Map<string, unknown>();
  const memo = <T>(clave: string, crear: () => T): T => {
    if (!cache.has(clave)) cache.set(clave, crear());
    return cache.get(clave) as T;
  };
  const desconocido = (tipo: string, id: string): never => {
    throw new ErrorGuion2Video(`Proveedor de ${tipo} desconocido: "${id}"`, "configuracion");
  };

  return {
    simular,
    config: cfg,
    costos,
    voz: (id) =>
      memo(`voz:${simular ? "simulado" : id}`, () => {
        if (simular || id === "simulado") return crearVozSimulada(costos);
        const c = cfg.voz[id] ?? {};
        if (id === "elevenlabs") return crearElevenLabs(k.ELEVENLABS_API_KEY, c, costos);
        if (id === "cartesia") return crearCartesia(k.CARTESIA_API_KEY, c, costos);
        if (id === "local-say") return crearVozLocal(c);
        return desconocido("voz", id);
      }),
    imagen: (id) =>
      memo(`imagen:${simular ? "simulado" : id}`, () => {
        if (simular || id === "simulado") return crearImagenSimulada(costos);
        const c = cfg.imagen[id] ?? {};
        if (id === "google-nano-banana-2") return crearNanoBanana(k.GOOGLE_API_KEY, c, costos);
        if (id === "openai-gpt-image-2") return crearGptImage(k.OPENAI_API_KEY, c, costos);
        if (id.startsWith("fal-")) return crearFal(id, k.FAL_API_KEY, c, costos);
        return desconocido("imagen", id);
      }),
    llm: () =>
      memo("llm", () => {
        if (simular) return crearLlmSimulado(costos);
        if (cfg.llm.proveedor !== "anthropic") return desconocido("LLM", cfg.llm.proveedor);
        return crearAnthropic(k.ANTHROPIC_API_KEY, cfg.llm, costos);
      }),
    transcripcion: () =>
      memo("transcripcion", () => {
        if (simular || cfg.transcripcion.proveedor === "estimada" || !k.OPENAI_API_KEY) {
          return transcripcionEstimada(simular ? "simulado" : "estimada");
        }
        return crearWhisper(k.OPENAI_API_KEY, cfg.transcripcion.modelo, costos);
      }),
    audio: (id) =>
      memo(`audio:${simular ? "simulado" : id}`, () => {
        if (simular || id === "simulado") return crearAudioSimulado();
        if (id === "jamendo") return crearJamendo(k.JAMENDO_CLIENT_ID);
        if (id === "freesound") return crearFreesound(k.FREESOUND_API_KEY);
        if (id === "biblioteca") return crearBiblioteca(join(config.raiz, "biblioteca"));
        return desconocido("audio", id);
      }),
  };
}

/** Sin API de transcripción: reparte la duración real del audio entre las palabras del texto. */
function transcripcionEstimada(id: string): ProveedorTranscripcion {
  return {
    id,
    modelo: "proporcional",
    estimarCosto: () => 0,
    async transcribir({ archivo, texto }) {
      return { palabras: alineacionEstimada(texto ?? "", await duracionMs(archivo)), costoUsd: 0 };
    },
  };
}
