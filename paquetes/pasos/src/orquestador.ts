import { ErrorGuion2Video, existe, NOMBRES_PASOS, redondear, type NombrePaso } from "@guion2video/nucleo";
import type { ContextoPaso } from "./contexto.ts";
import { refrescar } from "./contexto.ts";
import type { Estimacion, Paso } from "./paso.ts";
import { pasoGuion } from "./guion.ts";
import { pasoEscenas } from "./escenas.ts";
import { pasoVoz } from "./voz.ts";
import { pasoAlineacion } from "./alineacion.ts";
import { pasoImagenes } from "./imagenes.ts";
import { pasoAudioAmbiente } from "./audio-ambiente.ts";
import { pasoComposicion } from "./composicion.ts";
import { pasoRender } from "./render.ts";
import { pasoPublicacion } from "./publicacion.ts";

export const PASOS: Paso[] = [pasoGuion, pasoEscenas, pasoVoz, pasoAlineacion, pasoImagenes, pasoAudioAmbiente, pasoComposicion, pasoRender, pasoPublicacion];

export const obtenerPaso = (nombre: string): Paso => {
  const p = PASOS.find((x) => x.nombre === nombre);
  if (!p) throw new ErrorGuion2Video(`Paso desconocido "${nombre}". Pasos: ${NOMBRES_PASOS.join(", ")}`, "validacion");
  return p;
};

export type Estado = "pendiente" | "al_dia" | "obsoleto" | "revision" | "error" | "bloqueado";

export interface EstadoCalculado {
  nombre: NombrePaso;
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

/** Pasos necesarios para llegar a `hasta`, en orden de ejecución. */
export function cierre(hasta: NombrePaso): Paso[] {
  const necesarios = new Set<NombrePaso>();
  const visitar = (n: NombrePaso) => {
    if (necesarios.has(n)) return;
    necesarios.add(n);
    obtenerPaso(n).depende.forEach(visitar);
  };
  visitar(hasta);
  return PASOS.filter((p) => necesarios.has(p.nombre));
}

async function estaAprobado(ctx: ContextoPaso, paso: Paso): Promise<boolean> {
  if (!paso.revision) return true;
  if (paso.aprobado) return paso.aprobado(ctx);
  const a = ctx.proyecto.pasos[paso.nombre]?.aprobado;
  if (!a) return false;
  const actual = paso.huellaAprobacion ? await paso.huellaAprobacion(ctx) : await paso.huella(ctx);
  return a.huella === actual;
}

/** Estado de un paso comparando la huella guardada con la de sus entradas actuales. */
export async function calcularEstado(ctx: ContextoPaso, paso: Paso, cacheEstados = new Map<NombrePaso, EstadoCalculado>()): Promise<EstadoCalculado> {
  const previo = cacheEstados.get(paso.nombre);
  if (previo) return previo;
  const guardado = ctx.proyecto.pasos[paso.nombre] ?? {};
  const base = { nombre: paso.nombre, titulo: paso.titulo, revision: paso.revision, ejecutado: guardado.ejecutado, costo_usd: guardado.costo_usd, error: guardado.error, avisos: guardado.avisos, resumen: guardado.resumen };
  let resultado: EstadoCalculado;
  const deps = await Promise.all(paso.depende.map((d) => calcularEstado(ctx, obtenerPaso(d), cacheEstados)));
  const depMal = deps.find((d) => d.estado !== "al_dia");
  if (depMal && !guardado.huella) {
    resultado = { ...base, estado: "bloqueado", aprobado: false, motivo: `espera a ${depMal.titulo.toLowerCase()}` };
  } else {
    let huellaActual: string | undefined;
    try {
      huellaActual = await paso.huella(ctx);
    } catch (e) {
      resultado = { ...base, estado: depMal ? "bloqueado" : "pendiente", aprobado: false, motivo: (e as Error).message.split("\n")[0] };
      cacheEstados.set(paso.nombre, resultado);
      return resultado;
    }
    const salidasOk = (await Promise.all(paso.salidas(ctx).map(existe))).every(Boolean);
    const aprobado = guardado.huella ? await estaAprobado(ctx, paso).catch(() => false) : false;
    let estado: Estado;
    if (guardado.error) estado = "error";
    else if (!guardado.huella) estado = "pendiente";
    else if (guardado.huella !== huellaActual || !salidasOk) estado = "obsoleto";
    else if (paso.revision && !aprobado) estado = "revision";
    else estado = "al_dia";
    if ((estado === "al_dia" || estado === "revision") && depMal) estado = "obsoleto";
    resultado = { ...base, estado, aprobado, motivo: estado === "obsoleto" ? (depMal ? `cambió ${depMal.titulo.toLowerCase()}` : "cambiaron sus entradas") : undefined };
  }
  cacheEstados.set(paso.nombre, resultado);
  return resultado;
}

export async function estadoProyecto(ctx: ContextoPaso): Promise<EstadoCalculado[]> {
  await refrescar(ctx);
  const cache = new Map<NombrePaso, EstadoCalculado>();
  const lista: EstadoCalculado[] = [];
  for (const p of PASOS) lista.push(await calcularEstado(ctx, p, cache));
  return lista;
}

export interface EstimacionPaso extends Estimacion {
  nombre: NombrePaso;
  titulo: string;
  estado: Estado;
}

/** Costo estimado de lo que falta (lo que está en caché o al día no cuenta). */
export async function estimarProyecto(ctx: ContextoPaso, op: { hasta?: NombrePaso } = {}) {
  const estados = await estadoProyecto(ctx);
  const pasos: EstimacionPaso[] = [];
  for (const p of op.hasta ? cierre(op.hasta) : PASOS) {
    const e = estados.find((x) => x.nombre === p.nombre)!;
    if (e.estado === "al_dia" || e.estado === "revision") {
      pasos.push({ nombre: p.nombre, titulo: p.titulo, estado: e.estado, costo_usd: 0, unidades: 0, pendientes: 0, detalle: "al día" });
      continue;
    }
    try {
      pasos.push({ nombre: p.nombre, titulo: p.titulo, estado: e.estado, ...(await p.estimar(ctx)) });
    } catch (err) {
      pasos.push({ nombre: p.nombre, titulo: p.titulo, estado: e.estado, costo_usd: 0, unidades: 0, pendientes: 0, detalle: "se calcula al terminar los pasos anteriores" });
    }
  }
  const acumulado = await ctx.costos.total();
  const presupuesto = ctx.proyecto.presupuesto_usd ?? ctx.config.presupuestoMaxUsd;
  return { pasos, total: redondear(pasos.reduce((s, p) => s + p.costo_usd, 0)), acumulado, presupuesto };
}

export interface OpcionesEjecucion {
  /** Pregunta antes de pasarse del presupuesto. Sin callback, se detiene. */
  confirmar?: (mensaje: string) => Promise<boolean>;
  /** Ejecuta aunque esté al día (con `forzar` en el contexto se ignora la caché de esas unidades). */
  reejecutar?: NombrePaso[];
}

export interface ResultadoEjecucion {
  ejecutados: { nombre: NombrePaso; resumen: string; costo_usd: number; avisos: string[] }[];
  detenido?: { paso: NombrePaso; motivo: "revision" | "presupuesto" | "error"; mensaje: string };
  costo_usd: number;
}

/** Ejecuta un paso concreto (sus dependencias deben estar al día y aprobadas). */
export async function ejecutarPaso(ctx: ContextoPaso, paso: Paso, op: OpcionesEjecucion = {}) {
  await refrescar(ctx);
  for (const d of paso.depende) {
    const e = await calcularEstado(ctx, obtenerPaso(d));
    if (e.estado === "revision") {
      throw new ErrorGuion2Video(`Falta tu revisión en "${e.titulo}". Revisa y aprueba:  pnpm guion2video aprobar ${ctx.proyecto.slug} --paso ${d}`, "revision_pendiente");
    }
    if (e.estado !== "al_dia") throw new ErrorGuion2Video(`"${paso.titulo}" necesita que "${e.titulo}" esté al día (estado: ${e.estado})`, "dependencia");
  }
  const est = await paso.estimar(ctx);
  const acumulado = await ctx.costos.total();
  const presupuesto = ctx.proyecto.presupuesto_usd ?? ctx.config.presupuestoMaxUsd;
  if (est.costo_usd > 0) ctx.log.info(`${paso.titulo}: costo estimado $${est.costo_usd.toFixed(2)} (${est.pendientes}/${est.unidades} por generar${est.detalle ? `; ${est.detalle}` : ""})`);
  if (acumulado + est.costo_usd > presupuesto) {
    const msg = `${paso.titulo} cuesta ≈$${est.costo_usd.toFixed(2)} y el video ya lleva $${acumulado.toFixed(2)} de un presupuesto de $${presupuesto.toFixed(2)}.`;
    if (!op.confirmar || !(await op.confirmar(`${msg} ¿Continuar?`))) throw new ErrorGuion2Video(`${msg} Detenido por presupuesto.`, "presupuesto");
  }
  const huellaEntradas = await paso.huella(ctx);
  const inicio = Date.now();
  try {
    const r = await paso.ejecutar(ctx);
    await ctx.espacio.actualizarPaso(paso.nombre, (e) => ({
      ...e,
      huella: huellaEntradas,
      ejecutado: new Date().toISOString(),
      duracion_ms: Date.now() - inicio,
      costo_usd: redondear((e.costo_usd ?? 0) + r.costo_usd),
      error: undefined,
      avisos: r.avisos.length ? r.avisos : undefined,
      resumen: r.resumen,
      huella_salida: r.huella_salida ?? e.huella_salida,
    }));
    await refrescar(ctx);
    return r;
  } catch (err) {
    await ctx.espacio.actualizarPaso(paso.nombre, (e) => ({ ...e, error: (err as Error).message, ejecutado: new Date().toISOString() }));
    await refrescar(ctx);
    throw err;
  }
}

/**
 * Ejecuta todo lo necesario para llegar a `hasta`: salta lo que está al día (caché por huella)
 * y se detiene en cada paso que espera revisión humana.
 */
export async function ejecutarHasta(ctx: ContextoPaso, hasta: NombrePaso, op: OpcionesEjecucion = {}): Promise<ResultadoEjecucion> {
  const resultado: ResultadoEjecucion = { ejecutados: [], costo_usd: 0 };
  for (const paso of cierre(hasta)) {
    await refrescar(ctx);
    const e = await calcularEstado(ctx, paso);
    const forzado = op.reejecutar?.includes(paso.nombre);
    if (e.estado === "al_dia" && !forzado) {
      ctx.log.detalle(`${paso.titulo}: al día`);
      continue;
    }
    if (e.estado === "revision" && !forzado) {
      resultado.detenido = { paso: paso.nombre, motivo: "revision", mensaje: `Falta tu revisión en ${paso.titulo}: pnpm guion2video aprobar ${ctx.proyecto.slug} --paso ${paso.nombre}` };
      return resultado;
    }
    ctx.log.info(`▶ ${paso.titulo}`);
    try {
      const r = await ejecutarPaso(ctx, paso, op);
      resultado.ejecutados.push({ nombre: paso.nombre, resumen: r.resumen, costo_usd: r.costo_usd, avisos: r.avisos });
      resultado.costo_usd = redondear(resultado.costo_usd + r.costo_usd);
      ctx.log.info(`✓ ${paso.titulo}: ${r.resumen}${r.costo_usd ? ` · $${r.costo_usd.toFixed(3)}` : ""}`);
      for (const a of r.avisos) ctx.log.aviso(a);
    } catch (err) {
      const codigo = err instanceof ErrorGuion2Video ? err.codigo : "error";
      resultado.detenido = { paso: paso.nombre, motivo: codigo === "presupuesto" ? "presupuesto" : codigo === "revision_pendiente" ? "revision" : "error", mensaje: (err as Error).message };
      return resultado;
    }
    if (paso.revision && paso.nombre !== hasta) {
      const tras = await calcularEstado(ctx, paso);
      if (tras.estado === "revision") {
        resultado.detenido = { paso: paso.nombre, motivo: "revision", mensaje: `Listo para revisar: ${paso.titulo}. Cuando esté bien: pnpm guion2video aprobar ${ctx.proyecto.slug} --paso ${paso.nombre}` };
        return resultado;
      }
    }
  }
  return resultado;
}

/** Aprueba un paso (o algunas unidades, en imágenes). La aprobación vale para el contenido actual. */
export async function aprobar(ctx: ContextoPaso, nombre: NombrePaso, op: { unidades?: string[]; por?: string } = {}): Promise<string> {
  const paso = obtenerPaso(nombre);
  if (!paso.revision) return `${paso.titulo} no necesita aprobación`;
  await refrescar(ctx);
  const e = await calcularEstado(ctx, paso);
  if (e.estado === "pendiente" || e.estado === "bloqueado") throw new ErrorGuion2Video(`${paso.titulo} aún no se ha ejecutado`, "dependencia");
  if (e.estado === "obsoleto" || e.estado === "error") throw new ErrorGuion2Video(`${paso.titulo} está ${e.estado}: vuelve a ejecutarlo antes de aprobar`, "dependencia");
  if (paso.aprobar) {
    const n = await paso.aprobar(ctx, op);
    const todo = paso.aprobado ? await paso.aprobado(ctx) : true;
    if (todo) await marcarAprobado(ctx, paso, op.por);
    return `${n} unidad(es) aprobadas${todo ? `; ${paso.titulo.toLowerCase()} aprobado completo` : ""}`;
  }
  await marcarAprobado(ctx, paso, op.por);
  return `${paso.titulo} aprobado`;
}

async function marcarAprobado(ctx: ContextoPaso, paso: Paso, por?: string) {
  const h = paso.huellaAprobacion ? await paso.huellaAprobacion(ctx) : await paso.huella(ctx);
  await ctx.espacio.actualizarPaso(paso.nombre, { aprobado: { huella: h, fecha: new Date().toISOString(), por } });
  await refrescar(ctx);
}

/** Regenera unidades concretas (escenas o imágenes) de un paso ignorando la caché. */
export async function regenerar(ctx: ContextoPaso, nombre: NombrePaso, unidades: string[], op: OpcionesEjecucion = {}) {
  const paso = obtenerPaso(nombre);
  unidades.forEach((u) => ctx.forzar.add(u));
  if (!unidades.length) ctx.forzar.add(nombre);
  try {
    return await ejecutarPaso(ctx, paso, op);
  } finally {
    unidades.forEach((u) => ctx.forzar.delete(u));
    ctx.forzar.delete(nombre);
  }
}

/** Siguiente paso que conviene ejecutar (para la interfaz). */
export async function siguientePaso(ctx: ContextoPaso): Promise<EstadoCalculado | undefined> {
  const estados = await estadoProyecto(ctx);
  return estados.find((e) => e.estado !== "al_dia");
}
