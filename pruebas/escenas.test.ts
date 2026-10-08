import { describe, expect, it } from "vitest";
import { Estilo } from "@guion2video/nucleo";
import { validarCobertura, promptsRiesgosos } from "@guion2video/pasos";
import estiloJson from "../estilos/fraudes-latam/estilo.json" with { type: "json" };

const estilo = Estilo.parse(estiloJson);
const parte = {
  id: "parte-01",
  titulo: "Gancho",
  oraciones: [
    { id: "o-0001", texto: "Uno dos tres cuatro.", notas: [] },
    { id: "o-0002", texto: "Cinco seis siete.", notas: [] },
    { id: "o-0003", texto: "Ocho nueve.", notas: [] },
  ],
};
const img = { prompt: "Plaza de un pueblo amazónico en 2008", movimiento: "estatico" as const, calidad: "estandar" as const };
const amb = { musica: "neutral" as const, efectos: [] };

describe("validarCobertura", () => {
  it("acepta rangos contiguos que cubren todo", () => {
    const r = { escenas: [{ desde: "o-0001", hasta: "o-0002", tipo_visual: "imagen_ia" as const, imagenes: [img], ambiente: amb }, { desde: "o-0003", hasta: "o-0003", tipo_visual: "cita" as const, imagenes: [], grafico: { tipo: "cita" as const, texto: "Ocho" }, ambiente: amb }] };
    expect(validarCobertura(parte, r, estilo)).toEqual([]);
  });
  it("detecta huecos, oraciones al final sin cubrir y gráficos sin datos", () => {
    const r = { escenas: [{ desde: "o-0002", hasta: "o-0002", tipo_visual: "cifra" as const, imagenes: [], ambiente: amb }] };
    const errores = validarCobertura(parte, r, estilo);
    expect(errores.some((e) => e.includes("debía empezar en o-0001"))).toBe(true);
    expect(errores.some((e) => e.includes("Faltan oraciones"))).toBe(true);
    expect(errores.some((e) => e.includes('no tiene "grafico"'))).toBe(true);
  });
});

describe("promptsRiesgosos", () => {
  it("marca nombres de personas reales junto a 'retrato' o 'realista'", () => {
    const r = promptsRiesgosos(
      [
        { id: "a", prompt: "Retrato realista de David Murcia en su oficina" },
        { id: "b", prompt: "Silueta de un hombre de traje visto de espaldas" },
        { id: "c", prompt: "Foto de Murcia sonriendo" },
      ],
      ["David Murcia"],
    );
    expect(r).toEqual(["a", "c"]);
  });
});
