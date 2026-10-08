/**
 * Contrato de timeline.json. El paquete render solo lee esto y archivos: no llama a ninguna API.
 * Todos los tiempos están en frames.
 */

export type TipoItemVideo =
  | "imagen_ia"
  | "archivo"
  | "cifra"
  | "linea_tiempo"
  | "mapa"
  | "comparacion"
  | "documento"
  | "cita"
  | "titulo_parte"
  | "video";

export type MovimientoImagen =
  | "zoom_lento_entrada"
  | "zoom_lento_salida"
  | "paneo_izquierda"
  | "paneo_derecha"
  | "estatico";

export type TransicionItem = "fundido" | "corte" | "negro" | "barrido";

export interface ItemVideo {
  id: string;
  escena: string;
  desde: number;
  duracion: number;
  tipo: TipoItemVideo;
  /** Ruta relativa a la carpeta del proyecto (o URL / data:). */
  src?: string;
  /** Huella del archivo: cambia cuando el archivo cambia aunque la ruta sea la misma. */
  huella?: string;
  movimiento?: MovimientoImagen;
  props?: Record<string, unknown>;
  transicion: TransicionItem;
}

export interface ItemAudio {
  desde: number;
  duracion?: number;
  src: string;
  volumen_db?: number;
  huella?: string;
  etiqueta?: string;
}

export interface PalabraSubtitulo {
  texto: string;
  desde: number;
  hasta: number;
}

export interface BloqueSubtitulo {
  desde: number;
  hasta: number;
  texto: string;
  lineas: string[];
  palabras: PalabraSubtitulo[];
}

export interface EstiloVisual {
  colores: { fondo: string; acento: string; texto: string; alerta: string };
  tipografia: { titulos: string; subtitulos: string; cifras: string };
  subtitulos: { activos: boolean; resaltar_palabra_actual: boolean; posicion: "inferior" | "superior" };
  marca: { texto?: string; logo?: string };
}

export interface Timeline {
  version: 1;
  titulo: string;
  fps: number;
  ancho: number;
  alto: number;
  duracion_frames: number;
  estilo: EstiloVisual;
  pistas: {
    video: ItemVideo[];
    voz: ItemAudio[];
    musica: ItemAudio[];
    efectos: ItemAudio[];
    /** Mezcla final (voz + música con ducking + efectos), normalizada. Es lo que suena. */
    mezcla?: ItemAudio;
    subtitulos: BloqueSubtitulo[];
  };
  partes: { titulo: string; desde: number }[];
}

export type PropsVideo = {
  timeline: Timeline;
  /** Prefijo para resolver rutas relativas (servidor local al renderizar, API en la vista previa). */
  base?: string;
};

export type PropsMiniatura = {
  titulo: string;
  resaltado?: string;
  src?: string;
  base?: string;
  estilo: EstiloVisual;
  variante?: 0 | 1 | 2;
};
