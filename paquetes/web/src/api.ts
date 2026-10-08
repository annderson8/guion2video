export class ErrorApi extends Error {
  constructor(mensaje: string, readonly estado: number) {
    super(mensaje);
  }
}

async function pedir<T>(metodo: string, ruta: string, cuerpo?: unknown): Promise<T> {
  const init: RequestInit = { method: metodo, headers: {} };
  if (cuerpo instanceof FormData) init.body = cuerpo;
  else if (cuerpo !== undefined) {
    init.body = JSON.stringify(cuerpo);
    (init.headers as Record<string, string>)["content-type"] = "application/json";
  }
  const r = await fetch(`/api${ruta}`, init);
  const texto = await r.text();
  const datos = texto ? JSON.parse(texto) : null;
  if (!r.ok) throw new ErrorApi(datos?.error ?? `HTTP ${r.status}`, r.status);
  return datos as T;
}

export const api = {
  get: <T>(ruta: string) => pedir<T>("GET", ruta),
  post: <T>(ruta: string, cuerpo?: unknown) => pedir<T>("POST", ruta, cuerpo ?? {}),
  patch: <T>(ruta: string, cuerpo: unknown) => pedir<T>("PATCH", ruta, cuerpo),
  put: <T>(ruta: string, cuerpo: unknown) => pedir<T>("PUT", ruta, cuerpo),
};

export const archivo = (slug: string, ruta: string, version?: string) =>
  `/api/proyectos/${slug}/archivos/${ruta}${version ? `?v=${version}` : ""}`;

export const usd = (n: number | undefined) => (n === undefined ? "—" : `$${n.toFixed(n > 0 && n < 1 ? 3 : 2)}`);

export type Estado = "pendiente" | "al_dia" | "obsoleto" | "revision" | "error" | "bloqueado";

export interface EstadoPaso {
  nombre: string;
  titulo: string;
  estado: Estado;
  revision: boolean;
  aprobado: boolean;
  ejecutado?: string;
  costo_usd?: number;
  error?: string;
  avisos?: string[];
  resumen?: string;
  motivo?: string;
}

export interface Trabajo {
  id: string;
  tipo: string;
  estado: "en_curso" | "ok" | "detenido" | "error";
  inicio: string;
  fin?: string;
  eventos: { t: string; nivel: string; msg: string }[];
  progreso?: { paso: string; hechos: number; total: number; msg?: string };
  error?: string;
  motivo?: "revision" | "presupuesto" | "error";
}

export interface DetalleProyecto {
  proyecto: { slug: string; titulo?: string; estilo: string; presupuesto_usd?: number };
  estilo: { colores: Record<string, string>; voz: { proveedor: string }; imagen: { proveedor_principal: string; proveedor_premium: string } };
  estados: EstadoPaso[];
  costos: { acumulado: number; presupuesto: number; estimado_restante: number; siguiente: { paso: string; titulo: string; costo_usd: number } | null };
  estimacion: { nombre: string; titulo: string; costo_usd: number; unidades: number; pendientes: number; detalle?: string; estado: Estado }[];
  trabajo: Trabajo | null;
}
