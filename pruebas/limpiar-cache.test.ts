import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readdir } from "node:fs/promises";
import { escribirArchivo, existe } from "@guion2video/nucleo";
import { borrarVideoFinal, ejecutarHasta, estadoProyecto, leerEscenas, limpiarCache, resumenCache, resumenVideoFinal } from "@guion2video/pasos";
import { ejecutarAprobando, proyectoDePrueba } from "./utilidades.ts";

describe("limpiar la caché del proyecto (simulado)", () => {
  let p: Awaited<ReturnType<typeof proyectoDePrueba>>;
  beforeAll(async () => {
    p = await proyectoDePrueba();
    await ejecutarAprobando(p.ctx, "alineacion");
  }, 600_000);
  afterAll(() => p?.limpiar());

  it("mide la caché y solo cuenta como liberable lo que no sigue en uso en audio/ e imagenes/", async () => {
    const r = await resumenCache(p.ctx);
    expect(r.archivos).toBeGreaterThan(0);
    expect(Object.keys(r.por_tipo)).toContain("voz");
    expect(r.liberable_bytes).toBeLessThan(r.bytes); // los .wav de la voz son enlaces duros a audio/
    expect(r.liberable_bytes).toBeGreaterThan(0); // los .json de la caché sí se liberan
  });

  it("borra la caché sin tocar los archivos del proyecto ni dejar pasos obsoletos", async () => {
    const { escenas } = await leerEscenas(p.ctx);
    const narrada = escenas.find((e) => e.texto_narracion)!;
    await limpiarCache(p.ctx);
    expect((await resumenCache(p.ctx)).archivos).toBe(0);
    expect(await readdir(p.ctx.espacio.rutas.cache)).toEqual([]);
    expect(await existe(p.ctx.espacio.ruta("audio", `${narrada.id}.wav`))).toBe(true);
    expect((await estadoProyecto(p.ctx)).filter((e) => ["voz", "alineacion"].includes(e.nombre)).map((e) => e.estado)).toEqual(["al_dia", "al_dia"]);
    expect((await ejecutarHasta(p.ctx, "alineacion")).ejecutados).toEqual([]);
  });

  it("limpiar una caché vacía no falla", async () => {
    expect((await limpiarCache(p.ctx)).archivos).toBe(0);
  });
});

describe("borrar el video final (simulado)", () => {
  let p: Awaited<ReturnType<typeof proyectoDePrueba>>;
  beforeAll(async () => {
    p = await proyectoDePrueba();
  });
  afterAll(() => p?.limpiar());

  it("borra video.mp4 y preview.mp4, y conserva subtítulos, miniatura y descripción", async () => {
    expect((await resumenVideoFinal(p.ctx)).archivos).toEqual([]);
    for (const [f, n] of [["video.mp4", 2000], ["preview.mp4", 500], ["subtitulos.srt", 10], ["miniatura.png", 10], ["descripcion.txt", 10]] as const) {
      await escribirArchivo(p.ctx.espacio.ruta("salida", f), Buffer.alloc(n));
    }
    const r = await resumenVideoFinal(p.ctx);
    expect(r.archivos.map((a) => a.nombre)).toEqual(["video.mp4", "preview.mp4"]);
    expect(r.bytes).toBe(2500);

    expect((await borrarVideoFinal(p.ctx)).bytes).toBe(2500);
    expect(await existe(p.ctx.espacio.ruta("salida", "video.mp4"))).toBe(false);
    expect(await existe(p.ctx.espacio.ruta("salida", "preview.mp4"))).toBe(false);
    for (const f of ["subtitulos.srt", "miniatura.png", "descripcion.txt"]) expect(await existe(p.ctx.espacio.ruta("salida", f)), f).toBe(true);
    expect((await borrarVideoFinal(p.ctx)).bytes).toBe(0);
  });
});
