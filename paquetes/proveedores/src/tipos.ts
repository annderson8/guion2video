import type { z } from "zod";
import type { PalabraAlineada } from "@guion2video/nucleo";

// ───────── Voz ─────────

export interface OpcionesVoz {
  velocidad: number;
  estabilidad: number;
  similitud: number;
  idioma: string;
}

export interface ResultadoVoz {
  audio: Buffer;
  formato: "mp3" | "wav" | "aiff";
  /** Tiempos por palabra del texto enviado (el texto hablado), si el proveedor los entrega. */
  alineacion?: PalabraAlineada[];
  costoUsd: number;
}

export interface ProveedorVoz {
  id: string;
  modelo: string;
  estimarCosto(texto: string): number;
  sintetizar(params: { texto: string; vozId: string; opciones: OpcionesVoz }): Promise<ResultadoVoz>;
}

// ───────── Imagen ─────────

export interface ParamsImagen {
  prompt: string;
  negativo?: string;
  /** Rutas locales de imágenes de referencia de estilo. */
  referencias: string[];
  relacionAspecto: string;
  calidad: "estandar" | "premium";
  semilla?: number;
}

export interface ResultadoImagen {
  imagen: Buffer;
  costoUsd: number;
  meta: Record<string, unknown>;
}

export interface ProveedorImagen {
  id: string;
  modelo: string;
  estimarCosto(params: Pick<ParamsImagen, "calidad">): number;
  generar(params: ParamsImagen): Promise<ResultadoImagen>;
}

// ───────── LLM ─────────

export interface PeticionJson<T> {
  etiqueta: string;
  sistema: string;
  mensaje: string;
  esquema: z.ZodType<T>;
  /** Validación extra (p. ej. que las escenas cubran todas las oraciones). Devuelve errores legibles. */
  validar?: (datos: T) => string[];
  /** Respuesta falsa determinista para el modo simulado. */
  simulacion: () => T;
  maxTokens?: number;
}

export interface ResultadoLlm<T> {
  datos: T;
  costoUsd: number;
  modelo: string;
  tokens: { entrada: number; salida: number };
}

export interface ProveedorLlm {
  id: string;
  modelo: string;
  estimarCosto(tokensEntrada: number, tokensSalida: number): number;
  generarJson<T>(peticion: PeticionJson<T>): Promise<ResultadoLlm<T>>;
}

// ───────── Transcripción ─────────

export interface ProveedorTranscripcion {
  id: string;
  modelo: string;
  estimarCosto(segundos: number): number;
  transcribir(params: { archivo: string; idioma: string; texto?: string }): Promise<{
    palabras: PalabraAlineada[];
    costoUsd: number;
  }>;
}

// ───────── Música y efectos ─────────

export interface CandidatoAudio {
  id: string;
  titulo: string;
  autor: string;
  licencia: string;
  url_licencia?: string;
  url_fuente?: string;
  duracion_s?: number;
  /** URL de descarga o ruta local. */
  origen: string;
}

export interface ProveedorAudio {
  id: string;
  buscar(params: { tipo: "musica" | "efecto"; etiqueta: string; consulta: string; duracionMinS?: number }): Promise<CandidatoAudio[]>;
  descargar(c: CandidatoAudio): Promise<Buffer>;
}
