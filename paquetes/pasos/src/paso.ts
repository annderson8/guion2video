import type { NombrePaso } from "@guion2video/nucleo";
import type { ContextoPaso } from "./contexto.ts";

export interface Estimacion {
  costo_usd: number;
  /** Unidades totales y las que de verdad hay que generar (el resto sale de la caché). */
  unidades: number;
  pendientes: number;
  detalle?: string;
}

export interface ResultadoPaso {
  costo_usd: number;
  resumen: string;
  avisos: string[];
  huella_salida?: string;
}

export interface Paso {
  nombre: NombrePaso;
  titulo: string;
  depende: NombrePaso[];
  /** Si true, la cadena se detiene aquí hasta que una persona apruebe. */
  revision: boolean;
  /** Huella de las entradas: si no cambia, el paso no se vuelve a ejecutar. */
  huella(ctx: ContextoPaso): Promise<string>;
  /** Lo que se aprueba (por defecto, la huella de entradas). Cambia si cambia el contenido producido. */
  huellaAprobacion?(ctx: ContextoPaso): Promise<string>;
  /** Archivos que deben existir para considerar el paso al día. */
  salidas(ctx: ContextoPaso): string[];
  estimar(ctx: ContextoPaso): Promise<Estimacion>;
  ejecutar(ctx: ContextoPaso): Promise<ResultadoPaso>;
  /** Aprobación granular (p. ej. imágenes una a una). */
  aprobar?(ctx: ContextoPaso, op: { unidades?: string[] }): Promise<number>;
  /** Para pasos con aprobación granular: ¿está todo aprobado? */
  aprobado?(ctx: ContextoPaso): Promise<boolean>;
}
