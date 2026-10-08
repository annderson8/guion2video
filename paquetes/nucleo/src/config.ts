import { existsSync } from "node:fs";
import { dirname, resolve, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Raíz del monorepo (donde están estilos/, tarifas.json, configuracion.json). */
export const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

const ruta = (valor: string | undefined, porDefecto: string) => {
  const v = valor && valor.trim() ? valor.trim() : porDefecto;
  return isAbsolute(v) ? v : resolve(RAIZ, v);
};

/** Carga .env de la raíz si existe (sin pisar variables ya definidas en el entorno). */
export function cargarEnv(archivo = join(RAIZ, ".env")): void {
  if (!existsSync(archivo)) return;
  const previas = { ...process.env };
  process.loadEnvFile(archivo);
  for (const [k, v] of Object.entries(previas)) process.env[k] = v;
}

export interface Config {
  raiz: string;
  proyectos: string;
  estilos: string;
  presupuestoMaxUsd: number;
  paraleloImagenes: number;
  simular: boolean;
  puertoApi: number;
  claves: Record<NombreClave, string | undefined>;
}

export const NOMBRES_CLAVES = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GOOGLE_API_KEY",
  "FAL_API_KEY",
  "ELEVENLABS_API_KEY",
  "CARTESIA_API_KEY",
  "JAMENDO_CLIENT_ID",
  "FREESOUND_API_KEY",
] as const;
export type NombreClave = (typeof NOMBRES_CLAVES)[number];

export function cargarConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const claves = Object.fromEntries(NOMBRES_CLAVES.map((k) => [k, env[k]?.trim() || undefined])) as Config["claves"];
  return {
    raiz: RAIZ,
    proyectos: ruta(env.GUION2VIDEO_PROYECTOS, "./proyectos"),
    estilos: ruta(env.GUION2VIDEO_ESTILOS, "./estilos"),
    presupuestoMaxUsd: Number(env.GUION2VIDEO_PRESUPUESTO_MAX_USD ?? 15),
    paraleloImagenes: Number(env.GUION2VIDEO_PARALELO_IMAGENES ?? 4),
    simular: ["1", "true", "si", "sí"].includes((env.GUION2VIDEO_SIMULAR ?? "0").trim().toLowerCase()),
    puertoApi: Number(env.GUION2VIDEO_PUERTO_API ?? 4310),
    claves,
  };
}

/** Muestra solo los últimos 4 caracteres de una clave. */
export function enmascarar(clave: string | undefined): string | null {
  if (!clave) return null;
  return `••••${clave.slice(-4)}`;
}
