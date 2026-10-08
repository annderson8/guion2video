import { ArchivoEscenas, ErrorGuion2Video, escribirJson, Escena, formatearErrorZod, huellaArchivo } from "@guion2video/nucleo";
import type { ContextoPaso } from "./contexto.ts";
import { refrescar } from "./contexto.ts";
import { leerEscenas } from "./escenas.ts";

/**
 * Guarda escenas.json editado por una persona. Como la edición es en sí una revisión,
 * si las escenas estaban aprobadas siguen aprobadas con el contenido nuevo.
 */
async function guardarEdicion(ctx: ContextoPaso, archivo: ArchivoEscenas) {
  const validado = ArchivoEscenas.safeParse(archivo);
  if (!validado.success) throw new ErrorGuion2Video(`La edición no es válida:\n${formatearErrorZod(validado.error)}`, "validacion");
  const ruta = ctx.espacio.rutas.escenas;
  const antes = await huellaArchivo(ruta);
  const aprobado = ctx.proyecto.pasos.escenas?.aprobado;
  await escribirJson(ruta, validado.data);
  if (aprobado?.huella === antes) {
    await ctx.espacio.actualizarPaso("escenas", { aprobado: { ...aprobado, huella: await huellaArchivo(ruta), fecha: new Date().toISOString() } });
  }
  await refrescar(ctx);
}

export async function editarEscena(ctx: ContextoPaso, escenaId: string, cambios: Partial<Escena>) {
  await refrescar(ctx);
  const archivo = await leerEscenas(ctx);
  const i = archivo.escenas.findIndex((e) => e.id === escenaId);
  if (i < 0) throw new ErrorGuion2Video(`No existe ${escenaId}`, "no_encontrado");
  const { id: _id, ...resto } = cambios;
  const nueva = Escena.safeParse({ ...archivo.escenas[i], ...resto });
  if (!nueva.success) throw new ErrorGuion2Video(`La escena no es válida:\n${formatearErrorZod(nueva.error)}`, "validacion");
  archivo.escenas[i] = nueva.data;
  await guardarEdicion(ctx, archivo);
  return nueva.data;
}

export async function editarPromptImagen(ctx: ContextoPaso, imagenId: string, cambios: { prompt?: string; calidad?: "estandar" | "premium"; movimiento?: Escena["imagenes"][number]["movimiento"] }) {
  await refrescar(ctx);
  const archivo = await leerEscenas(ctx);
  const escena = archivo.escenas.find((e) => e.imagenes.some((i) => i.id === imagenId));
  if (!escena) throw new ErrorGuion2Video(`No existe la imagen ${imagenId}`, "no_encontrado");
  const img = escena.imagenes.find((i) => i.id === imagenId)!;
  if (cambios.prompt !== undefined) img.prompt = cambios.prompt.trim();
  if (cambios.calidad) img.calidad = cambios.calidad;
  if (cambios.movimiento) img.movimiento = cambios.movimiento;
  await guardarEdicion(ctx, archivo);
  return img;
}
