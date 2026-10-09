import { describe, expect, it } from "vitest";
import type { Escena } from "@guion2video/nucleo";
import { tiempoSuperposicion, validarSuperposiciones } from "@guion2video/pasos";

const escena = {
  id: "escena-003",
  parte: "Parte 1: La promesa",
  texto_narracion: "Todo empezó con un local pequeño. La empresa prometía rendimientos imposibles.",
  tipo_visual: "imagen_ia",
  imagenes: [],
  ambiente: { musica: "neutral", efectos: [] },
} as unknown as Escena;

describe("validarSuperposiciones", () => {
  it("acepta una etiqueta y una palabra clave ancladas a la narración", () => {
    const errores = validarSuperposiciones([escena], {
      escenas: [
        {
          id: "escena-003",
          superposiciones: [
            { tipo: "etiqueta", texto: "Putumayo · 2003", icono: "lugar" },
            { tipo: "palabra_clave", texto: "Rendimientos imposibles", icono: "alerta", palabra: "imposibles" },
          ],
        },
      ],
    });
    expect(errores).toEqual([]);
  });

  it("rechaza palabras que no se narran, datos sin valor y escenas que faltan", () => {
    const errores = validarSuperposiciones([escena, { ...escena, id: "escena-005" }], {
      escenas: [{ id: "escena-003", superposiciones: [{ tipo: "dato", texto: "personas", palabra: "millones" }] }],
    });
    expect(errores.join("\n")).toMatch(/necesita "valor"/);
    expect(errores.join("\n")).toMatch(/"millones" no está en la narración/);
    expect(errores.join("\n")).toMatch(/Faltan escenas: escena-005/);
  });

  it("no permite dos tarjetas en la misma escena", () => {
    const errores = validarSuperposiciones([escena], {
      escenas: [
        {
          id: "escena-003",
          superposiciones: [
            { tipo: "palabra_clave", texto: "Local pequeño", palabra: "local" },
            { tipo: "sello", texto: "ESTAFA", palabra: "imposibles" },
          ],
        },
      ],
    });
    expect(errores.join("\n")).toMatch(/máximo una entre/);
  });
});

describe("tiempoSuperposicion", () => {
  const dichas = [
    { palabra: "La", inicio_ms: 0 },
    { palabra: "empresa", inicio_ms: 300 },
    { palabra: "imposibles.", inicio_ms: 2000 },
  ];
  const tramo = { inicio: 10_000, finVoz: 13_000, fin: 13_400 };

  it("entra justo antes de que la voz diga la palabra ancla (sin importar tildes ni puntuación)", () => {
    const t = tiempoSuperposicion({ tipo: "palabra_clave", palabra: "Imposibles" }, dichas, tramo);
    expect(t.desde).toBe(10_000 + 2000 - 120);
    expect(t.hasta).toBeGreaterThanOrEqual(t.desde + 1000);
    expect(t.hasta).toBeLessThanOrEqual(tramo.fin);
    expect(t.aviso).toBeUndefined();
  });

  it("si no encuentra la palabra, entra a mitad de escena y avisa", () => {
    const t = tiempoSuperposicion({ tipo: "dato", palabra: "millones" }, dichas, tramo);
    expect(t.desde).toBe(10_000 + 3000 * 0.4);
    expect(t.aviso).toMatch(/millones/);
  });

  it("la etiqueta entra al inicio de la escena", () => {
    const t = tiempoSuperposicion({ tipo: "etiqueta" }, dichas, tramo);
    expect(t.desde).toBe(10_300);
  });
});
