import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { existe, leerJson, type RegistroCosto } from "@guion2video/nucleo";
import { duracionMs } from "@guion2video/proveedores";
import { editarEscena, ejecutarHasta, estadoProyecto, estimarProyecto, leerEscenas, leerMetaImagen, leerMetaVoz } from "@guion2video/pasos";
import { ejecutarAprobando, proyectoDePrueba } from "./utilidades.ts";

/**
 * Integración en modo simulado: un proyecto corto recorre todo el pipeline hasta el MP4
 * sin llamar a ninguna API de pago.
 */
describe("pipeline completo (simulado)", () => {
  let p: Awaited<ReturnType<typeof proyectoDePrueba>>;

  beforeAll(async () => {
    p = await proyectoDePrueba();
    await ejecutarAprobando(p.ctx, "publicacion");
  }, 600_000);
  afterAll(() => p?.limpiar());

  it("produce el video, los subtítulos, las miniaturas y la descripción", async () => {
    const salida = (f: string) => p.ctx.espacio.ruta("salida", f);
    for (const f of ["video.mp4", "subtitulos.srt", "miniatura.png", "miniatura-1.png", "miniatura-2.png", "miniatura-3.png", "descripcion.txt"]) {
      expect(await existe(salida(f)), f).toBe(true);
    }
    const dur = await duracionMs(salida("video.mp4"));
    const timeline = await leerJson<{ duracion_frames: number; fps: number }>(p.ctx.espacio.rutas.timeline);
    expect(Math.abs(dur - (timeline.duracion_frames / timeline.fps) * 1000)).toBeLessThan(200);
    const { escenas } = await leerEscenas(p.ctx);
    expect(escenas.length).toBeGreaterThanOrEqual(5);
    const estados = await estadoProyecto(p.ctx);
    expect(estados.filter((e) => e.estado !== "al_dia").map((e) => e.nombre)).toEqual([]);
  });

  it("la segunda ejecución sale toda de la caché y cuesta $0", async () => {
    const antes = await p.ctx.costos.total();
    expect(antes).toBeGreaterThan(0); // las tarifas de prueba cobran al proveedor simulado
    const r = await ejecutarHasta(p.ctx, "publicacion");
    expect(r.ejecutados).toEqual([]);
    expect(r.costo_usd).toBe(0);
    expect(await p.ctx.costos.total()).toBe(antes);
    const est = await estimarProyecto(p.ctx);
    expect(est.total).toBe(0);
  });

  it("cambiar el texto de una escena solo regenera su voz y su alineación", async () => {
    const { escenas } = await leerEscenas(p.ctx);
    const narradas = escenas.filter((e) => e.texto_narracion);
    const objetivo = narradas[1];
    const otras = narradas.filter((e) => e.id !== objetivo.id);
    const vozAntes = Object.fromEntries(await Promise.all(otras.map(async (e) => [e.id, (await leerMetaVoz(p.ctx, e.id))!.fecha])));
    const imagenesAntes = Object.fromEntries(
      await Promise.all(escenas.flatMap((e) => e.imagenes).map(async (i) => [i.id, (await leerMetaImagen(p.ctx, i.id))!.archivo_huella])),
    );
    const registrosAntes = (await leerJson<RegistroCosto[]>(p.ctx.espacio.rutas.costos)).length;

    await editarEscena(p.ctx, objetivo.id, { texto_narracion: `${objetivo.texto_narracion} Y nadie lo vio venir.` });
    const estados = Object.fromEntries((await estadoProyecto(p.ctx)).map((e) => [e.nombre, e.estado]));
    expect(estados.escenas).toBe("al_dia"); // la edición manual cuenta como revisión
    expect(estados.imagenes).toBe("al_dia");
    expect(estados.voz).toBe("obsoleto");

    await ejecutarAprobando(p.ctx, "composicion");

    const nuevos = (await leerJson<RegistroCosto[]>(p.ctx.espacio.rutas.costos)).slice(registrosAntes);
    const pagados = nuevos.filter((r) => !r.cache);
    expect(pagados.map((r) => [r.paso, r.escena])).toEqual([["voz", objetivo.id]]);
    for (const e of otras) expect((await leerMetaVoz(p.ctx, e.id))!.fecha).toBe(vozAntes[e.id]);
    for (const [id, h] of Object.entries(imagenesAntes)) expect((await leerMetaImagen(p.ctx, id))!.archivo_huella).toBe(h);
    expect((await estadoProyecto(p.ctx)).find((e) => e.nombre === "render")!.estado).toBe("obsoleto");
  });
});

describe("render de componentes", () => {
  it("renderiza la demo de 30 s con todos los componentes", async () => {
    const { renderizarDemo } = await import("@guion2video/render/renderizar");
    const salida = join(tmpdir(), `guion2video-demo-${Date.now()}.mp4`);
    await renderizarDemo(salida, { escala: 0.25 });
    expect(Math.round((await duracionMs(salida)) / 1000)).toBe(30);
  }, 300_000);
});
