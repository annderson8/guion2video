import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import { conservar, ejecutarHasta, estadoProyecto, leerEscenas, leerMetaVoz } from "@guion2video/pasos";
import { ejecutarAprobando, proyectoDePrueba } from "./utilidades.ts";

const estados = async (p: Awaited<ReturnType<typeof proyectoDePrueba>>) => Object.fromEntries((await estadoProyecto(p.ctx)).map((e) => [e.nombre, e.estado]));

describe("conservar lo ya generado (simulado)", () => {
  let p: Awaited<ReturnType<typeof proyectoDePrueba>>;

  beforeAll(async () => {
    p = await proyectoDePrueba();
    await ejecutarAprobando(p.ctx, "alineacion");
  }, 600_000);
  afterAll(() => p?.limpiar());

  it("un ajuste de voz deja el paso obsoleto, pero conservar lo deja al día sin regenerar ni gastar", async () => {
    const gastoAntes = await p.ctx.costos.total();
    const { escenas } = await leerEscenas(p.ctx);
    const primera = escenas.find((e) => e.texto_narracion)!;
    const fechaAntes = (await leerMetaVoz(p.ctx, primera.id))!.fecha;

    p.ctx.estilo.estilo.voz.velocidad += 0.05;
    expect((await estados(p)).voz).toBe("obsoleto");

    const r = await conservar(p.ctx, "alineacion");
    expect(r.detenido).toBeUndefined();
    expect(r.conservados.map((x) => x.nombre)).toContain("voz");

    const despues = await estados(p);
    expect(despues.voz).toBe("al_dia");
    expect(despues.alineacion).toBe("al_dia");
    expect((await ejecutarHasta(p.ctx, "alineacion")).ejecutados).toEqual([]);
    expect(await p.ctx.costos.total()).toBe(gastoAntes);
    expect((await leerMetaVoz(p.ctx, primera.id))!.fecha).toBe(fechaAntes);
  });

  it("no adopta un paso al que le faltan archivos: se detiene y lo deja obsoleto", async () => {
    const { escenas } = await leerEscenas(p.ctx);
    const primera = escenas.find((e) => e.texto_narracion)!;
    p.ctx.estilo.estilo.voz.velocidad += 0.05;
    await rm(p.ctx.espacio.ruta("audio", `${primera.id}.wav`));

    const r = await conservar(p.ctx, "alineacion");
    expect(r.detenido?.paso).toBe("voz");
    expect(r.detenido?.mensaje).toContain("faltan 1 archivo");
    expect((await estados(p)).voz).toBe("obsoleto");
  });
});
