import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bitacoraSilenciosa, existe, leerJson } from "@guion2video/nucleo";
import { calcularEstado, clicsLlamado, ejecutarHasta, estadoLlamado, generarLlamado, obtenerPaso } from "@guion2video/pasos";
import type { Timeline } from "@guion2video/render";
import { ejecutarAprobando, proyectoDePrueba } from "./utilidades.ts";

describe("clicsLlamado", () => {
  const palabras = [
    { palabra: "Si", inicio_ms: 0, fin_ms: 200 },
    { palabra: "suscríbete", inicio_ms: 1000, fin_ms: 2000 },
    { palabra: "y", inicio_ms: 2000, fin_ms: 2100 },
    { palabra: "dale", inicio_ms: 2100, fin_ms: 2400 },
    { palabra: "me", inicio_ms: 2400, fin_ms: 2500 },
    { palabra: "gusta.", inicio_ms: 2500, fin_ms: 3000 },
  ];

  it("hace clic a mitad de «suscríbete» y de «gusta», contando el silencio previo a la voz", () => {
    const c = clicsLlamado(palabras, 30, 600);
    expect(c.suscribir).toBe(Math.round(((600 + 1000 + 1000 * 0.55) * 30) / 1000));
    expect(c.like).toBe(Math.round(((600 + 2500 + 500 * 0.55) * 30) / 1000));
    expect(c.suscribir!).toBeLessThan(c.like!);
  });

  it("deja sin definir el clic de una palabra que el texto no dice", () => {
    expect(clicsLlamado(palabras.slice(0, 1), 30, 0)).toEqual({ suscribir: undefined, like: undefined });
  });
});

describe("llamado a suscribirse (simulado)", () => {
  let p: Awaited<ReturnType<typeof proyectoDePrueba>>;
  let dirEstilo: string;
  const leerTimeline = () => leerJson<Timeline>(p.ctx.espacio.rutas.timeline);

  beforeAll(async () => {
    p = await proyectoDePrueba();
    // El audio del llamado se guarda junto al estilo: se redirige a una carpeta temporal para no ensuciar el repositorio.
    dirEstilo = await mkdtemp(join(tmpdir(), "guion2video-estilo-"));
    p.ctx.estilo = { ...p.ctx.estilo, dir: dirEstilo };
    p.ctx.estilo.estilo.llamado = { ...p.ctx.estilo.estilo.llamado, canal: "@RendimientoGarantizado" };
    await ejecutarAprobando(p.ctx, "composicion");
  }, 600_000);
  afterAll(async () => {
    await p?.limpiar();
    await rm(dirEstilo, { recursive: true, force: true });
  });

  it("sin el audio generado, el video sale sin llamado y la composición avisa cómo generarlo", async () => {
    expect((await estadoLlamado(p.ctx.estilo, p.ctx.proveedores)).estado).toBe("sin_generar");
    expect((await leerTimeline()).pistas.video.some((v) => v.tipo === "llamado")).toBe(false);
    const estado = await calcularEstado(p.ctx, obtenerPaso("composicion"));
    expect(estado.avisos?.join(" ")).toContain("llamado generar --estilo fraudes-latam");
  });

  it("genera la voz una sola vez por estilo y la segunda vez no cuesta nada", async () => {
    const r = await generarLlamado({ estilo: p.ctx.estilo, proveedores: p.ctx.proveedores, log: bitacoraSilenciosa });
    expect(r.generado).toBe(true);
    expect(r.meta.duracion_ms).toBeGreaterThan(500);
    expect(r.meta.palabras.length).toBeGreaterThan(5);
    expect(await existe(join(dirEstilo, "llamado", "voz.wav"))).toBe(true);
    expect((await generarLlamado({ estilo: p.ctx.estilo, proveedores: p.ctx.proveedores, log: bitacoraSilenciosa })).generado).toBe(false);
  });

  it("la composición lo inserta al terminar la primera parte, con su voz y subtítulos", async () => {
    const antes = await leerTimeline();
    expect((await calcularEstado(p.ctx, obtenerPaso("composicion"))).estado).toBe("obsoleto");
    const r = await ejecutarHasta(p.ctx, "composicion");
    expect(r.ejecutados.map((e) => e.nombre)).toContain("composicion");

    const t = await leerTimeline();
    const video = t.pistas.video;
    const i = video.findIndex((v) => v.tipo === "llamado");
    expect(i).toBeGreaterThan(0);
    const llamado = video[i];
    // Va justo antes del separador de la segunda parte y después de todo el Gancho.
    expect(video[i + 1].tipo).toBe("titulo_parte");
    expect(llamado.desde).toBe(video[i - 1].desde + video[i - 1].duracion);
    expect(llamado.props).toMatchObject({ canal: "@RendimientoGarantizado" });
    const { clics } = llamado.props as { clics: { suscribir: number; like: number } };
    expect(clics.suscribir).toBeGreaterThan(0);
    expect(clics.like).toBeGreaterThan(clics.suscribir);
    expect(clics.like).toBeLessThan(llamado.duracion);

    // Voz del llamado dentro del segmento y subtítulos en ese tramo.
    const voz = t.pistas.voz.find((v) => v.etiqueta === "llamado")!;
    expect(voz.desde).toBeGreaterThanOrEqual(llamado.desde);
    expect(voz.desde + (voz.duracion ?? 0)).toBeLessThanOrEqual(llamado.desde + llamado.duracion);
    expect(t.pistas.subtitulos.some((b) => b.desde >= llamado.desde && b.hasta <= llamado.desde + llamado.duracion)).toBe(true);

    // Todo lo posterior se corre exactamente lo que dura el segmento, y no aparece un capítulo nuevo.
    expect(t.duracion_frames - antes.duracion_frames).toBe(llamado.duracion);
    expect(t.partes.map((x) => x.titulo)).toEqual(antes.partes.map((x) => x.titulo));
    expect(t.partes[1].desde - antes.partes[1].desde).toBe(llamado.duracion);
  });

  it("al día: repetir no regenera nada y no gasta", async () => {
    const gasto = await p.ctx.costos.total();
    const r = await ejecutarHasta(p.ctx, "composicion");
    expect(r.ejecutados).toEqual([]);
    expect(await p.ctx.costos.total()).toBe(gasto);
  });

  it("si cambia el texto, queda obsoleto hasta regenerarlo y la composición lo omite con aviso", async () => {
    p.ctx.estilo.estilo.llamado.texto = "Suscríbete al canal y dale me gusta.";
    expect((await estadoLlamado(p.ctx.estilo, p.ctx.proveedores)).estado).toBe("obsoleto");
    await ejecutarHasta(p.ctx, "composicion", { reejecutar: ["composicion"] });
    expect((await leerTimeline()).pistas.video.some((v) => v.tipo === "llamado")).toBe(false);
  });

  it("desactivado en el estilo, no se inserta ni avisa", async () => {
    p.ctx.estilo.estilo.llamado.activo = false;
    await ejecutarHasta(p.ctx, "composicion", { reejecutar: ["composicion"] });
    expect((await leerTimeline()).pistas.video.some((v) => v.tipo === "llamado")).toBe(false);
    expect((await estadoLlamado(p.ctx.estilo, p.ctx.proveedores)).estado).toBe("desactivado");
  });
});
