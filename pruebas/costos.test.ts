import { describe, expect, it } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CalculadoraCostos, conReintentos, enParalelo, RegistroCostos } from "@guion2video/nucleo";
import { TARIFAS_PRUEBA } from "./utilidades.ts";

describe("costos", () => {
  it("calcula con las tarifas configuradas", () => {
    const c = new CalculadoraCostos(TARIFAS_PRUEBA);
    expect(c.voz("simulado", 5000)).toBe(1);
    expect(c.imagen("simulado", "premium")).toBe(0.2);
    expect(c.llm("simulado", 1_000_000, 100_000)).toBe(4.5);
  });
  it("una tarifa faltante cuenta $0 y avisa una sola vez", () => {
    const avisos: string[] = [];
    const c = new CalculadoraCostos(TARIFAS_PRUEBA, (m) => avisos.push(m));
    c.imagen("desconocido", "estandar");
    c.imagen("desconocido", "estandar");
    expect(avisos).toHaveLength(1);
  });
  it("el registro soporta escrituras en paralelo sin perder entradas", async () => {
    const r = new RegistroCostos(join(await mkdtemp(join(tmpdir(), "costos-")), "costos.json"));
    await Promise.all(Array.from({ length: 25 }, (_, i) => r.registrar({ paso: "imagenes", proveedor: "x", costo_usd: 0.01, fecha: String(i), cache: false })));
    expect((await r.leer()).length).toBe(25);
    expect(await r.total()).toBe(0.25);
  });
});

describe("cola de trabajos", () => {
  it("respeta el límite de concurrencia y reporta fallos sin detener el lote", async () => {
    let activos = 0;
    let maximo = 0;
    const r = await enParalelo([1, 2, 3, 4, 5, 6], 2, async (n) => {
      activos++;
      maximo = Math.max(maximo, activos);
      await new Promise((ok) => setTimeout(ok, 10));
      activos--;
      if (n === 3) throw new Error("falla");
      return n * 2;
    });
    expect(maximo).toBe(2);
    expect(r.ok).toHaveLength(5);
    expect(r.fallidos.map((f) => f.item)).toEqual([3]);
  });
  it("reintenta con espera exponencial y para en errores no reintentables", async () => {
    let intentos = 0;
    await expect(conReintentos(async () => { intentos++; throw new Error("x"); }, { reintentos: 2, esperaBaseMs: 1 })).rejects.toThrow("x");
    expect(intentos).toBe(3);
    intentos = 0;
    await expect(conReintentos(async () => { intentos++; throw new Error("400"); }, { reintentos: 5, esperaBaseMs: 1, reintentable: () => false })).rejects.toThrow();
    expect(intentos).toBe(1);
  });
});
