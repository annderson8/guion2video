import { palabras, type PalabraAlineada } from "@guion2video/nucleo";

/**
 * Reparte la duración entre las palabras según su longitud (aprox. proporcional a las sílabas),
 * con pausas un poco mayores tras comas y puntos. Se usa cuando no hay tiempos reales.
 */
export function alineacionEstimada(texto: string, duracionMs: number, margenMs = 120): PalabraAlineada[] {
  const lista = palabras(texto);
  if (!lista.length) return [];
  const pesos = lista.map((p) => Math.max(2, p.replace(/[^\p{L}\p{N}]/gu, "").length) + (/[.,;:!?…]$/.test(p) ? 3 : 0.6));
  const total = pesos.reduce((a, b) => a + b, 0);
  const util = Math.max(1, duracionMs - margenMs * 2);
  let t = margenMs;
  return lista.map((palabra, i) => {
    const dur = (pesos[i] / total) * util;
    const inicio = t;
    t += dur;
    const pausa = /[.,;:!?…]$/.test(palabra) ? Math.min(dur * 0.35, 250) : 0;
    return { palabra, inicio_ms: Math.round(inicio), fin_ms: Math.round(t - pausa) };
  });
}

/** Convierte tiempos por carácter (ElevenLabs) en tiempos por palabra del mismo texto. */
export function palabrasDesdeCaracteres(
  caracteres: string[],
  inicios: number[],
  fines: number[],
): PalabraAlineada[] {
  const salida: PalabraAlineada[] = [];
  let actual: { texto: string; inicio: number; fin: number } | null = null;
  for (let i = 0; i < caracteres.length; i++) {
    const c = caracteres[i];
    if (/\s/.test(c)) {
      if (actual) salida.push({ palabra: actual.texto, inicio_ms: actual.inicio, fin_ms: actual.fin });
      actual = null;
      continue;
    }
    const ini = Math.round(inicios[i] * 1000);
    const fin = Math.round(fines[i] * 1000);
    if (!actual) actual = { texto: c, inicio: ini, fin };
    else {
      actual.texto += c;
      actual.fin = fin;
    }
  }
  if (actual) salida.push({ palabra: actual.texto, inicio_ms: actual.inicio, fin_ms: actual.fin });
  return salida;
}
