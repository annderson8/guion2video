import { join } from "node:path";
import { RegistroCosto, Tarifas } from "./esquemas.ts";
import { escribirJson, leerJson, leerJsonSiExiste } from "./archivos.ts";
import { conCerrojo } from "./cerrojo.ts";
import { z } from "zod";

export class RegistroCostos {
  constructor(readonly archivo: string) {}

  async leer(): Promise<RegistroCosto[]> {
    return (await leerJsonSiExiste(this.archivo, z.array(RegistroCosto))) ?? [];
  }

  registrar(r: RegistroCosto): Promise<void> {
    return conCerrojo(this.archivo, async () => {
      const todos = await this.leer();
      todos.push(r);
      await escribirJson(this.archivo, todos);
    });
  }

  async total(): Promise<number> {
    return redondear((await this.leer()).reduce((s, r) => s + r.costo_usd, 0));
  }

  async resumen() {
    const registros = await this.leer();
    const porPaso: Record<string, { costo_usd: number; llamadas: number; cache: number }> = {};
    const porProveedor: Record<string, number> = {};
    for (const r of registros) {
      const p = (porPaso[r.paso] ??= { costo_usd: 0, llamadas: 0, cache: 0 });
      p.costo_usd = redondear(p.costo_usd + r.costo_usd);
      if (r.cache) p.cache++;
      else p.llamadas++;
      porProveedor[r.proveedor] = redondear((porProveedor[r.proveedor] ?? 0) + r.costo_usd);
    }
    return { total: redondear(registros.reduce((s, r) => s + r.costo_usd, 0)), porPaso, porProveedor, registros };
  }
}

export const redondear = (n: number) => Math.round(n * 10000) / 10000;

export class CalculadoraCostos {
  constructor(
    readonly tarifas: Tarifas,
    private avisar: (msg: string) => void = () => {},
  ) {}

  static async cargar(raiz: string, avisar?: (msg: string) => void) {
    return new CalculadoraCostos(await leerJson(join(raiz, "tarifas.json"), Tarifas), avisar);
  }

  private faltante = new Set<string>();
  private sinTarifa(clave: string): number {
    if (!this.faltante.has(clave)) {
      this.faltante.add(clave);
      this.avisar(`No hay tarifa para "${clave}" en tarifas.json; se cuenta como $0`);
    }
    return 0;
  }

  llm(modelo: string, tokensEntrada: number, tokensSalida: number): number {
    const t = this.tarifas.llm[modelo];
    if (!t) return this.sinTarifa(`llm.${modelo}`);
    return redondear((tokensEntrada * t.entrada_por_millon + tokensSalida * t.salida_por_millon) / 1_000_000);
  }

  voz(proveedor: string, caracteres: number): number {
    const t = this.tarifas.voz[proveedor];
    if (!t) return this.sinTarifa(`voz.${proveedor}`);
    return redondear((caracteres / 1000) * t.por_mil_caracteres);
  }

  imagen(proveedor: string, calidad: "estandar" | "premium"): number {
    const t = this.tarifas.imagen[proveedor];
    if (!t) return this.sinTarifa(`imagen.${proveedor}`);
    return redondear(calidad === "premium" ? (t.premium ?? t.estandar) : t.estandar);
  }

  transcripcion(proveedor: string, segundos: number): number {
    const t = this.tarifas.transcripcion[proveedor];
    if (!t) return this.sinTarifa(`transcripcion.${proveedor}`);
    return redondear((segundos / 60) * t.por_minuto);
  }

  audio(proveedor: string, pistas: number): number {
    const t = this.tarifas.audio[proveedor];
    if (!t) return 0;
    return redondear(pistas * t.por_pista);
  }
}
