import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { crearBitacora, type Bitacora, type Config } from "@guion2video/nucleo";
import { crearContexto, type ContextoPaso } from "@guion2video/pasos";

export interface EventoTrabajo {
  t: string;
  nivel: string;
  msg: string;
}

export interface Trabajo {
  id: string;
  slug: string;
  tipo: string;
  estado: "en_curso" | "ok" | "detenido" | "error";
  inicio: string;
  fin?: string;
  eventos: EventoTrabajo[];
  progreso?: { paso: string; hechos: number; total: number; msg?: string };
  resultado?: unknown;
  error?: string;
  /** Si se detuvo por presupuesto, la interfaz puede ofrecer "continuar de todos modos". */
  motivo?: "revision" | "presupuesto" | "error";
}

/** Un trabajo a la vez por proyecto; el estado vive en memoria y se consulta por sondeo. */
export class GestorTrabajos {
  private trabajos = new Map<string, Trabajo>();

  constructor(private config: () => Config) {}

  actual(slug: string): Trabajo | undefined {
    return this.trabajos.get(slug);
  }

  ocupado(slug: string): boolean {
    return this.trabajos.get(slug)?.estado === "en_curso";
  }

  iniciar(slug: string, tipo: string, fn: (ctx: ContextoPaso, t: Trabajo) => Promise<unknown>): Trabajo {
    if (this.ocupado(slug)) throw Object.assign(new Error("Ya hay un trabajo en curso en este proyecto"), { statusCode: 409 });
    const t: Trabajo = { id: randomUUID(), slug, tipo, estado: "en_curso", inicio: new Date().toISOString(), eventos: [] };
    this.trabajos.set(slug, t);
    const registrar = (nivel: string, msg: string) => {
      t.eventos.push({ t: new Date().toISOString(), nivel, msg });
      if (t.eventos.length > 400) t.eventos.splice(0, t.eventos.length - 400);
    };
    void (async () => {
      try {
        const log: Bitacora = crearBitacora({
          consola: false,
          archivo: join(this.config().proyectos, slug, "bitacora.log"),
          alEvento: (e) => {
            if (e.nivel === "progreso") t.progreso = { paso: e.paso!, hechos: e.hechos!, total: e.total!, msg: e.msg };
            else registrar(e.nivel, e.msg);
          },
        });
        const ctx = await crearContexto(slug, { config: this.config(), log });
        const r = (await fn(ctx, t)) as { detenido?: { motivo: Trabajo["motivo"]; mensaje: string } } | undefined;
        t.resultado = r;
        if (r?.detenido) {
          t.estado = r.detenido.motivo === "revision" ? "ok" : "detenido";
          t.motivo = r.detenido.motivo;
          registrar(r.detenido.motivo === "revision" ? "info" : "aviso", r.detenido.mensaje);
        } else t.estado = "ok";
      } catch (e) {
        t.estado = "error";
        t.error = (e as Error).message;
        registrar("error", t.error);
      } finally {
        t.fin = new Date().toISOString();
        t.progreso = undefined;
      }
    })();
    return t;
  }
}
