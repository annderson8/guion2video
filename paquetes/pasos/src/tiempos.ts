import type { Escena, Estilo } from "@guion2video/nucleo";
import type { EstiloVisual } from "@guion2video/render";

export const DURACION_SEPARADOR_MS = 2500;
export const COLA_FINAL_MS = 1500;

/** Silencio después de una escena: más largo al cambiar de parte, y una cola al final del video. */
export function pausaTrasMs(escenas: Escena[], i: number, estilo: Estilo): number {
  const siguiente = escenas[i + 1];
  if (!siguiente) return COLA_FINAL_MS;
  return (siguiente.parte !== escenas[i].parte ? estilo.voz.pausa_parte_s : estilo.voz.pausa_escena_s) * 1000;
}

/** Lo que el render necesita del estilo (sin el logo, que se copia aparte). */
export function estiloVisual(estilo: Estilo): EstiloVisual {
  return {
    colores: estilo.colores,
    tipografia: estilo.tipografia,
    subtitulos: { activos: estilo.subtitulos.activos, resaltar_palabra_actual: estilo.subtitulos.resaltar_palabra_actual, posicion: estilo.subtitulos.posicion },
    marca: { texto: estilo.marca.texto },
  };
}
