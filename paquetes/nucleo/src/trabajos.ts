export interface OpcionesReintento {
  reintentos?: number;
  esperaBaseMs?: number;
  /** Devuelve false para errores que no tiene sentido reintentar (400, contenido rechazado...). */
  reintentable?: (error: unknown) => boolean;
  alReintentar?: (error: unknown, intento: number, esperaMs: number) => void;
}

export const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Reintenta con espera exponencial y algo de azar para no golpear la API al mismo tiempo. */
export async function conReintentos<T>(fn: (intento: number) => Promise<T>, op: OpcionesReintento = {}): Promise<T> {
  const reintentos = op.reintentos ?? 3;
  const base = op.esperaBaseMs ?? 1000;
  let ultimo: unknown;
  for (let intento = 0; intento <= reintentos; intento++) {
    try {
      return await fn(intento);
    } catch (e) {
      ultimo = e;
      if (intento === reintentos || (op.reintentable && !op.reintentable(e))) break;
      const espera = Math.round(base * 2 ** intento * (0.75 + Math.random() * 0.5));
      op.alReintentar?.(e, intento + 1, espera);
      await esperar(espera);
    }
  }
  throw ultimo;
}

export interface ResultadoLote<E, R> {
  ok: { item: E; resultado: R }[];
  fallidos: { item: E; error: unknown }[];
}

/**
 * Cola de trabajos en memoria con límite de concurrencia.
 * Un fallo no detiene el lote: se reporta al final para poder reintentar solo lo que falló.
 */
export async function enParalelo<E, R>(
  items: E[],
  limite: number,
  fn: (item: E, indice: number) => Promise<R>,
): Promise<ResultadoLote<E, R>> {
  const resultado: ResultadoLote<E, R> = { ok: [], fallidos: [] };
  let siguiente = 0;
  const trabajador = async () => {
    while (siguiente < items.length) {
      const i = siguiente++;
      const item = items[i];
      try {
        resultado.ok.push({ item, resultado: await fn(item, i) });
      } catch (error) {
        resultado.fallidos.push({ item, error });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limite, items.length)) }, trabajador));
  return resultado;
}
