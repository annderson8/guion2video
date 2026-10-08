import { describe, expect, it } from "vitest";
import { dividirOraciones, huella, jsonEstable, numeroATexto, prepararHabla } from "@guion2video/nucleo";

describe("huellas", () => {
  it("no dependen del orden de las claves", () => {
    expect(jsonEstable({ b: 1, a: { d: 2, c: 3 } })).toBe(jsonEstable({ a: { c: 3, d: 2 }, b: 1 }));
    expect(huella({ x: 1, y: 2 })).toBe(huella({ y: 2, x: 1 }));
  });
  it("cambian si cambia cualquier entrada", () => {
    expect(huella("voz", "hola")).not.toBe(huella("voz", "hola."));
  });
});

describe("dividirOraciones", () => {
  it("respeta números con puntos de miles y abreviaturas", () => {
    expect(dividirOraciones("Unas 400.000 personas invirtieron. El Sr. Pérez no. ¿Quién sabía? Nadie.")).toEqual([
      "Unas 400.000 personas invirtieron.",
      "El Sr. Pérez no.",
      "¿Quién sabía?",
      "Nadie.",
    ]);
  });
  it("corta antes de comillas y signos de apertura", () => {
    expect(dividirOraciones("Dijo que sí. «Mañana pago», prometió.")).toEqual(["Dijo que sí.", "«Mañana pago», prometió."]);
  });
});

describe("numeroATexto", () => {
  it("lee números en español (escala larga)", () => {
    expect(numeroATexto(62)).toBe("sesenta y dos");
    expect(numeroATexto(2008)).toBe("dos mil ocho");
    expect(numeroATexto(400000)).toBe("cuatrocientos mil");
    expect(numeroATexto(21000)).toBe("veintiún mil");
    expect(numeroATexto(1_041_000_000_000)).toBe("un billón cuarenta y un mil millones");
    expect(numeroATexto(100)).toBe("cien");
  });
});

describe("prepararHabla", () => {
  it("aplica el diccionario de pronunciación y conserva el mapa a palabras escritas", () => {
    const r = prepararHabla("La empresa DMG cayó.", { DMG: "de eme ge" });
    expect(r.hablado).toBe("La empresa de eme ge cayó.");
    expect(r.tokens[2]).toEqual({ escrito: "DMG", desde: 2, hasta: 5 });
    expect(r.tokens[3]).toEqual({ escrito: "cayó.", desde: 5, hasta: 6 });
  });
  it("conserva la puntuación pegada y admite claves de varias palabras", () => {
    const r = prepararHabla("Según Telexfree, «1.041 billones».", { Telexfree: "télex fri", "1.041 billones": "un billón cuarenta y un mil millones" });
    expect(r.hablado).toBe("Según télex fri, «un billón cuarenta y un mil millones».");
    expect(r.tokens.map((t) => t.escrito)).toEqual(["Según", "Telexfree,", "«1.041", "billones»."]);
  });
  it("normaliza números solo si se pide", () => {
    expect(prepararHabla("En 62 municipios", {}).hablado).toBe("En 62 municipios");
    expect(prepararHabla("En 62 municipios y 30%", {}, { normalizarNumeros: true }).hablado).toBe("En sesenta y dos municipios y treinta por ciento");
  });
});
