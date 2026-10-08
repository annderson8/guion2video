import type { BloqueSubtitulo } from "@guion2video/render";
import { formatoSrt } from "@guion2video/nucleo";

export interface PalabraTiempo {
  texto: string;
  inicio_ms: number;
  fin_ms: number;
}

export interface OpcionesSubtitulos {
  fps: number;
  palabrasPorBloque: number;
  maxCaracteresLinea?: number;
  minDuracionMs?: number;
  maxLineas?: number;
}

const FIN_FRASE = /[.?!…]["”»)]*$/;
const PAUSA = /[,;:—–]["”»)]*$/;

/** Reparte las palabras en una o dos líneas lo más parejas posible. */
export function partirLineas(palabras: string[], max: number, maxLineas = 2): string[] {
  const texto = palabras.join(" ");
  if (texto.length <= max || maxLineas === 1 || palabras.length < 2) return [texto];
  let mejor = 1;
  let peor = Infinity;
  for (let i = 1; i < palabras.length; i++) {
    const a = palabras.slice(0, i).join(" ").length;
    const b = palabras.slice(i).join(" ").length;
    const largo = Math.max(a, b);
    if (largo < peor) {
      peor = largo;
      mejor = i;
    }
  }
  return [palabras.slice(0, mejor).join(" "), palabras.slice(mejor).join(" ")];
}

/**
 * Agrupa palabras con tiempos en bloques legibles: máximo N palabras, cortes en final de frase,
 * comas o pausas largas, como mucho 2 líneas y nunca menos de 0,8 s en pantalla.
 */
export function construirBloques(palabras: PalabraTiempo[], op: OpcionesSubtitulos): BloqueSubtitulo[] {
  const max = op.maxCaracteresLinea ?? 42;
  const maxLineas = op.maxLineas ?? 2;
  const minDur = op.minDuracionMs ?? 800;
  const grupos: PalabraTiempo[][] = [];
  let actual: PalabraTiempo[] = [];
  for (let i = 0; i < palabras.length; i++) {
    const p = palabras[i];
    const siguiente = palabras[i + 1];
    const largoConP = [...actual, p].map((x) => x.texto).join(" ").length;
    if (actual.length && largoConP > max * maxLineas) {
      grupos.push(actual);
      actual = [];
    }
    actual.push(p);
    const lleno = actual.length >= op.palabrasPorBloque;
    const corteNatural = FIN_FRASE.test(p.texto) || (PAUSA.test(p.texto) && actual.length >= Math.ceil(op.palabrasPorBloque * 0.5));
    const silencio = siguiente && siguiente.inicio_ms - p.fin_ms > 600;
    if (lleno || corteNatural || silencio || !siguiente) {
      grupos.push(actual);
      actual = [];
    }
  }
  if (actual.length) grupos.push(actual);

  // Un bloque que no alcanza a estar 0,8 s en pantalla (porque el siguiente empieza enseguida)
  // se une con el vecino si cabe en dos líneas.
  const cabe = (g: PalabraTiempo[]) => g.map((p) => p.texto).join(" ").length <= max * maxLineas && g.length <= op.palabrasPorBloque + 4;
  for (let i = 0; i < grupos.length; i++) {
    const g = grupos[i];
    const siguiente = grupos[i + 1];
    const fin = Math.min(Math.max(g[g.length - 1].fin_ms, g[0].inicio_ms + minDur), siguiente ? siguiente[0].inicio_ms : Infinity);
    if (fin - g[0].inicio_ms >= minDur) continue;
    if (siguiente && cabe([...g, ...siguiente])) {
      grupos.splice(i, 2, [...g, ...siguiente]);
      i--;
    } else if (i > 0 && cabe([...grupos[i - 1], ...g])) {
      grupos.splice(i - 1, 2, [...grupos[i - 1], ...g]);
      i -= 2;
    }
  }

  const aFrame = (ms: number) => Math.round((ms * op.fps) / 1000);
  const bloques = grupos.map((g) => ({ desde_ms: g[0].inicio_ms, hasta_ms: g[g.length - 1].fin_ms, g }));
  return bloques.map((b, i) => {
    const siguiente = bloques[i + 1];
    let hasta = Math.max(b.hasta_ms, b.desde_ms + minDur);
    // Si el siguiente empieza muy cerca, se encadena sin parpadeo; nunca se solapan.
    if (siguiente && siguiente.desde_ms - hasta < 300) hasta = siguiente.desde_ms;
    if (siguiente) hasta = Math.min(hasta, siguiente.desde_ms);
    const textos = b.g.map((p) => p.texto);
    return {
      desde: aFrame(b.desde_ms),
      hasta: Math.max(aFrame(hasta), aFrame(b.desde_ms) + 1),
      texto: textos.join(" "),
      lineas: partirLineas(textos, max, maxLineas),
      palabras: b.g.map((p, j) => ({
        texto: p.texto,
        desde: aFrame(p.inicio_ms),
        hasta: j < b.g.length - 1 ? aFrame(b.g[j + 1].inicio_ms) : Math.max(aFrame(hasta), aFrame(p.fin_ms)),
      })),
    };
  });
}

export function bloquesASrt(bloques: BloqueSubtitulo[], fps: number): string {
  const ms = (f: number) => (f * 1000) / fps;
  return bloques.map((b, i) => `${i + 1}\n${formatoSrt(ms(b.desde))} --> ${formatoSrt(ms(b.hasta))}\n${b.lineas.join("\n")}\n`).join("\n");
}
