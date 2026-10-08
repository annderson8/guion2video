import { describe, expect, it } from "vitest";
import { analizarGuion } from "@guion2video/pasos";

const MD = `# DMG: la pirámide

> Nota para el editor: no se narra.

## Gancho

[Fila larga frente a un local]
Noviembre de 2008. Es de madrugada en un pueblo del Putumayo.

*Música: tensión*

Todos llevan **bolsas** con billetes, según [la prensa](https://ejemplo.com).

## Parte 1: El truco

La empresa vendía tarjetas prepago. [Primer plano de una tarjeta] Nadie preguntaba nada.

## Fuentes

- Fallo del Juzgado, 2012.
- Informe de la Superintendencia.
`;

describe("analizarGuion", () => {
  const g = analizarGuion(MD, "x");
  it("separa título, partes y fuentes", () => {
    expect(g.titulo).toBe("DMG: la pirámide");
    expect(g.partes.map((p) => p.titulo)).toEqual(["Gancho", "Parte 1: El truco"]);
    expect(g.fuentes).toEqual(["Fallo del Juzgado, 2012.", "Informe de la Superintendencia."]);
  });
  it("quita notas, cursivas, citas en bloque y formato del texto narrado", () => {
    const textos = g.partes.flatMap((p) => p.oraciones.map((o) => o.texto));
    expect(textos).toEqual([
      "Noviembre de 2008.",
      "Es de madrugada en un pueblo del Putumayo.",
      "Todos llevan bolsas con billetes, según la prensa.",
      "La empresa vendía tarjetas prepago.",
      "Nadie preguntaba nada.",
    ]);
    expect(textos.join(" ")).not.toMatch(/editor|Música|\[|\*/);
  });
  it("guarda las notas visuales en la oración donde aparecían", () => {
    const o = g.partes.flatMap((p) => p.oraciones);
    expect(o[0].notas).toEqual(["Fila larga frente a un local"]);
    expect(o[2].notas).toEqual(["Música: tensión"]);
    expect(o[4].notas).toEqual(["Primer plano de una tarjeta"]);
  });
});
