/** Serializa operaciones asíncronas sobre un mismo recurso (p. ej. leer-modificar-escribir un JSON). */
const colas = new Map<string, Promise<unknown>>();

export function conCerrojo<T>(clave: string, fn: () => Promise<T>): Promise<T> {
  const previo = colas.get(clave) ?? Promise.resolve();
  const actual = previo.then(fn, fn);
  const cola = actual.catch(() => {});
  colas.set(clave, cola);
  cola.then(() => {
    if (colas.get(clave) === cola) colas.delete(clave);
  });
  return actual;
}
