/** Error de un proveedor externo. `reintentable` decide si la cola de trabajos vuelve a intentar. */
export class ErrorProveedor extends Error {
  constructor(
    readonly proveedor: string,
    mensaje: string,
    readonly estado?: number,
    readonly reintentable = estado === undefined || estado === 408 || estado === 409 || estado === 429 || estado >= 500,
  ) {
    super(`[${proveedor}] ${mensaje}`);
    this.name = "ErrorProveedor";
  }
}

export const esReintentable = (e: unknown) => !(e instanceof ErrorProveedor) || e.reintentable;

export function exigirClave(proveedor: string, nombre: string, valor: string | undefined): string {
  if (!valor) throw new ErrorProveedor(proveedor, `Falta ${nombre} en .env`, 401, false);
  return valor;
}

export async function pedir(
  proveedor: string,
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), init.timeoutMs ?? 180_000);
  let r: Response;
  try {
    r = await fetch(url, { ...init, signal: control.signal });
  } catch (e) {
    throw new ErrorProveedor(proveedor, `Error de red: ${(e as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
  if (!r.ok) {
    let cuerpo = "";
    try {
      cuerpo = (await r.text()).slice(0, 600);
    } catch {}
    throw new ErrorProveedor(proveedor, `HTTP ${r.status}: ${cuerpo}`, r.status);
  }
  return r;
}

export async function pedirJson<T = any>(proveedor: string, url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const r = await pedir(proveedor, url, init);
  return (await r.json()) as T;
}

export async function descargar(proveedor: string, url: string): Promise<Buffer> {
  const r = await pedir(proveedor, url);
  return Buffer.from(await r.arrayBuffer());
}
