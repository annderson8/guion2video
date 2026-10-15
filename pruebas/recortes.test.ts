import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { escribirJson, existe, leerJson } from "@guion2video/nucleo";
import { duracionMs, ejecutarComando } from "@guion2video/proveedores";
import { framesContenido, segmentosRecorte, type Timeline } from "@guion2video/render";
import {
  agregarRecorte,
  ajustarAPalabras,
  estadoRecortes,
  leerRecortes,
  quitarRecorte,
  renderizarRecortes,
  rutaVideoRecorte,
  validarRecorte,
} from "@guion2video/pasos";
import { ejecutarAprobando, proyectoDePrueba } from "./utilidades.ts";

const item = (id: string, tipo: string, desde: number, duracion: number) => ({ id, escena: id, tipo, desde, duracion, transicion: "corte" });
/** Timeline mínimo: 0–300 imágenes, 300–540 llamado, 540–900 imágenes (30 fps). */
const timelineConLlamado = { fps: 30, duracion_frames: 900, pistas: { video: [item("a", "imagen_ia", 0, 300), item("llamado", "llamado", 300, 240), item("b", "imagen_ia", 540, 360)], subtitulos: [] } } as unknown as Timeline;

describe("segmentosRecorte", () => {
  it("un recorte sin llamado es un solo tramo", () => {
    expect(segmentosRecorte(timelineConLlamado, 30, 200)).toEqual([{ desde: 30, hasta: 200, salida: 0 }]);
  });

  it("saca el llamado y corre lo que sigue para no dejar un hueco", () => {
    const s = segmentosRecorte(timelineConLlamado, 150, 700);
    expect(s).toEqual([
      { desde: 150, hasta: 300, salida: 0 },
      { desde: 540, hasta: 700, salida: 150 },
    ]);
    expect(framesContenido(s)).toBe(310);
  });

  it("un recorte que empieza o termina dentro del llamado conserva solo lo que está fuera", () => {
    expect(segmentosRecorte(timelineConLlamado, 400, 700)).toEqual([{ desde: 540, hasta: 700, salida: 0 }]);
    expect(segmentosRecorte(timelineConLlamado, 100, 400)).toEqual([{ desde: 100, hasta: 300, salida: 0 }]);
    expect(segmentosRecorte(timelineConLlamado, 320, 500)).toEqual([]);
  });
});

describe("ajustarAPalabras", () => {
  const palabras = [
    { texto: "uno", inicio_s: 1, fin_s: 1.4 },
    { texto: "dos", inicio_s: 1.5, fin_s: 2 },
    { texto: "tres", inicio_s: 2.2, fin_s: 3 },
  ];
  it("lleva el inicio a donde empieza la palabra más cercana y el final a donde termina la más cercana", () => {
    expect(ajustarAPalabras(palabras, 1.6, 2.9)).toEqual({ desde_s: 1.5, hasta_s: 3 });
    expect(ajustarAPalabras(palabras, 2.1, 2.1)).toEqual({ desde_s: 2.2, hasta_s: 2 });
  });
  it("sin palabras deja los segundos como están", () => {
    expect(ajustarAPalabras([], 3, 9)).toEqual({ desde_s: 3, hasta_s: 9 });
  });
});

describe("validarRecorte", () => {
  const r = (extra: object) => ({ id: "x", tipo: "short" as const, desde_s: 1, hasta_s: 10, ...extra });
  it("rechaza rangos al revés, fuera del video o demasiado cortos", () => {
    expect(validarRecorte(timelineConLlamado, r({ desde_s: 10, hasta_s: 5 })).errores[0]).toContain("mayor que el inicio");
    expect(validarRecorte(timelineConLlamado, r({ hasta_s: 99 })).errores[0]).toContain("dura 30.0 s");
    expect(validarRecorte(timelineConLlamado, r({ hasta_s: 2 })).errores[0]).toContain("muy corto");
  });
  it("avisa, sin bloquear, cuando un Reel pasa de lo recomendado", () => {
    const largo = { ...timelineConLlamado, duracion_frames: 30 * 300, pistas: { video: [], subtitulos: [] } } as unknown as Timeline;
    const v = validarRecorte(largo, r({ tipo: "reel", hasta_s: 120 }));
    expect(v.errores).toEqual([]);
    expect(v.avisos[0]).toContain("Reels");
  });
});

describe("recortes de un proyecto (simulado)", () => {
  let p: Awaited<ReturnType<typeof proyectoDePrueba>>;
  beforeAll(async () => {
    p = await proyectoDePrueba();
    await ejecutarAprobando(p.ctx, "composicion");
  }, 600_000);
  afterAll(() => p?.limpiar());

  it("agrega un recorte ajustado a palabras, lo renderiza en 1080×1920 con su cierre y no repite si está al día", async () => {
    const r = await agregarRecorte(p.ctx, { tipo: "short", desde_s: 0.3, hasta_s: 4.1, titulo: "Prueba" });
    expect(r.recorte.id).toBe("short-1");
    expect(r.recorte.huella_timeline).toBeTruthy();
    expect((await estadoRecortes(p.ctx))[0].estado).toBe("pendiente");

    const x = await renderizarRecortes(p.ctx);
    expect(x.hechos.map((h) => h.id)).toEqual(["short-1"]);
    const archivo = rutaVideoRecorte(p.ctx, "short-1");
    expect(await existe(archivo)).toBe(true);
    const esperado = r.duracion_s + p.ctx.estilo.estilo.recortes.cierre_s;
    expect(Math.abs((await duracionMs(archivo)) / 1000 - esperado)).toBeLessThan(0.4);
    const sonda = await ejecutarComando("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", archivo]);
    expect(sonda.stdout.trim()).toMatch(/^1080,1920/);

    expect((await estadoRecortes(p.ctx))[0].estado).toBe("al_dia");
    const otra = await renderizarRecortes(p.ctx);
    expect(otra.hechos).toEqual([]);
    expect(otra.omitidos).toEqual(["short-1"]);
  }, 300_000);

  it("cambiar el texto de cierre deja el recorte obsoleto", async () => {
    p.ctx.estilo.estilo.recortes.texto_short = "Otro texto de cierre";
    expect((await estadoRecortes(p.ctx))[0].estado).toBe("obsoleto");
  });

  it("avisa si el video cambió desde que se definió el recorte", async () => {
    expect((await estadoRecortes(p.ctx))[0].desfasado).toBe(false);
    const timeline = await leerJson<Timeline>(p.ctx.espacio.rutas.timeline);
    await escribirJson(p.ctx.espacio.rutas.timeline, { ...timeline, titulo: `${timeline.titulo} (editado)` });
    expect((await estadoRecortes(p.ctx))[0].desfasado).toBe(true);
    await escribirJson(p.ctx.espacio.rutas.timeline, timeline);
  });

  it("usa ids consecutivos por tipo y permite quitar", async () => {
    const reel = await agregarRecorte(p.ctx, { tipo: "reel", desde_s: 0.3, hasta_s: 4.1 });
    expect(reel.recorte.id).toBe("reel-1");
    const otro = await agregarRecorte(p.ctx, { tipo: "short", desde_s: 0.3, hasta_s: 4.1 });
    expect(otro.recorte.id).toBe("short-2");
    await quitarRecorte(p.ctx, "short-2");
    expect((await leerRecortes(p.ctx)).recortes.map((x) => x.id)).toEqual(["short-1", "reel-1"]);
    await expect(quitarRecorte(p.ctx, "no-existe")).rejects.toThrow("No existe");
  });

  it("no acepta un recorte fuera del video", async () => {
    await expect(agregarRecorte(p.ctx, { tipo: "short", desde_s: 0, hasta_s: 9999, sinAjuste: true })).rejects.toThrow("no es válido");
  });
});
