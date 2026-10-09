import { describe, expect, it } from "vitest";
import { analizarGuion, ensamblarEstructura, fragmentar, validarEstructura } from "@guion2video/pasos";

const texto = `Noviembre de 2008. En un pueblo del Putumayo, la fila ya da la vuelta a la manzana.

Todo empezó en 2003 con un local pequeño. La empresa prometía rendimientos imposibles.
Nadie preguntaba de dónde salía la plata.

Según la Superintendencia, unas 400.000 personas entregaron sus ahorros. En 2008 la empresa fue intervenida.

- Informe de la Superintendencia, 2009.
- Sentencia del juzgado, 2012.`;

const narrado = (md: string) =>
  analizarGuion(md, "x")
    .partes.flatMap((p) => p.oraciones.map((o) => o.texto))
    .join(" ");

describe("estructurar un guion en texto plano", () => {
  const { fragmentos, parrafos } = fragmentar(texto);
  const respuesta = {
    titulo: "Las filas del Putumayo",
    partes: [
      { titulo: "Gancho", desde: 0 },
      { titulo: "Parte 1: La promesa", desde: 2 },
      { titulo: "Parte 2: La caída", desde: 5 },
    ],
    fuentes_desde: 7,
  };

  it("divide en oraciones sin romper cifras con punto de miles", () => {
    expect(fragmentos.map((f) => f.texto)).toContain("Según la Superintendencia, unas 400.000 personas entregaron sus ahorros.");
  });

  it("el texto narrado queda idéntico: solo se añaden título, partes y fuentes", () => {
    const md = ensamblarEstructura(fragmentos, parrafos, respuesta);
    const g = analizarGuion(md, "x");
    expect(g.titulo).toBe("Las filas del Putumayo");
    expect(g.partes.map((p) => p.titulo)).toEqual(["Gancho", "Parte 1: La promesa", "Parte 2: La caída"]);
    expect(g.fuentes).toEqual(["Informe de la Superintendencia, 2009.", "Sentencia del juzgado, 2012."]);
    expect(narrado(md)).toBe(narrado(texto.replace(/\n\n- [\s\S]*$/, "")));
  });

  it("rechaza estructuras que no empiezan en 0, retroceden o se salen del texto", () => {
    expect(validarEstructura(respuesta, fragmentos.length)).toEqual([]);
    const mala = { ...respuesta, partes: [{ titulo: "Gancho", desde: 1 }, { titulo: "Parte 1", desde: 1 }, { titulo: "Parte 2", desde: 9 }] };
    const errores = validarEstructura(mala, fragmentos.length).join("\n");
    expect(errores).toMatch(/empezar en el fragmento 0/);
    expect(errores).toMatch(/después de la anterior/);
    expect(errores).toMatch(/fuera del texto narrado/);
  });
});
