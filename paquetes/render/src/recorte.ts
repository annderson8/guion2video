import type { Timeline } from "./tipos.ts";

export const ANCHO_VERTICAL = 1080;
export const ALTO_VERTICAL = 1920;

/** Tramo del video final que entra al recorte, y dónde cae dentro del recorte (todo en frames). */
export interface SegmentoRecorte {
  desde: number;
  hasta: number;
  salida: number;
}

/**
 * Divide [desde, hasta) en los tramos que se conservan: el llamado a suscribirse se saca, y lo que sigue se corre
 * para que no quede un hueco. La mayoría de los recortes tiene un solo tramo.
 */
export function segmentosRecorte(timeline: Pick<Timeline, "pistas">, desde: number, hasta: number): SegmentoRecorte[] {
  const excluidos = timeline.pistas.video.filter((v) => v.tipo === "llamado").map((v) => [v.desde, v.desde + v.duracion] as const);
  let tramos: [number, number][] = [[desde, hasta]];
  for (const [a, b] of excluidos) {
    tramos = tramos.flatMap(([x, y]): [number, number][] => {
      if (b <= x || a >= y) return [[x, y]];
      const partes: [number, number][] = [];
      if (a > x) partes.push([x, a]);
      if (b < y) partes.push([b, y]);
      return partes;
    });
  }
  let salida = 0;
  return tramos
    .filter(([x, y]) => y > x)
    .map(([x, y]) => {
      const s = { desde: x, hasta: y, salida };
      salida += y - x;
      return s;
    });
}

/** Frames del contenido del recorte (sin la tarjeta de cierre). */
export const framesContenido = (segmentos: SegmentoRecorte[]) => segmentos.reduce((s, x) => s + (x.hasta - x.desde), 0);
