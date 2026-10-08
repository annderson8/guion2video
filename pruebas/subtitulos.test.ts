import { describe, expect, it } from "vitest";
import { alinearSecuencias, aPalabrasEscritas, bloquesASrt, capitulos, construirBloques, expresionDucking, partirLineas, regionesConVoz } from "@guion2video/pasos";
import { prepararHabla } from "@guion2video/nucleo";

const palabras = (texto: string, msPorPalabra = 300) =>
  texto.split(" ").map((t, i) => ({ texto: t, inicio_ms: i * msPorPalabra, fin_ms: i * msPorPalabra + msPorPalabra - 40 }));

describe("subtítulos", () => {
  it("corta en final de frase y respeta el máximo de palabras", () => {
    const b = construirBloques(palabras("Noviembre de 2008. Es de madrugada en un pueblo del Putumayo y la fila da vuelta."), { fps: 30, palabrasPorBloque: 6 });
    expect(b[0].texto).toBe("Noviembre de 2008.");
    expect(b.every((x) => x.palabras.length <= 6 + 4)).toBe(true);
    expect(b.every((x) => x.lineas.length <= 2)).toBe(true);
    for (let i = 1; i < b.length; i++) expect(b[i].desde).toBeGreaterThanOrEqual(b[i - 1].hasta);
  });
  it("ningún bloque dura menos de 0,8 s si puede unirse a otro", () => {
    const b = construirBloques(palabras("Sí. No. Tal vez mañana lo sepamos.", 150), { fps: 30, palabrasPorBloque: 6 });
    expect(b.every((x) => ((x.hasta - x.desde) * 1000) / 30 >= 800 - 34)).toBe(true);
  });
  it("parte en dos líneas parejas", () => {
    expect(partirLineas("una frase bastante larga que no cabe en una sola línea".split(" "), 30)).toEqual(["una frase bastante larga que", "no cabe en una sola línea"]);
  });
  it("genera SRT válido", () => {
    const srt = bloquesASrt([{ desde: 30, hasta: 75, texto: "Hola", lineas: ["Hola"], palabras: [] }], 30);
    expect(srt).toBe("1\n00:00:01,000 --> 00:00:02,500\nHola\n");
  });
});

describe("alineación", () => {
  it("tolera palabras mal transcritas o de más y mapea al texto escrito", () => {
    const habla = prepararHabla("La empresa DMG cayó.", { DMG: "de eme ge" });
    const transcritas = [
      { palabra: "la", inicio_ms: 0, fin_ms: 100 },
      { palabra: "empresa", inicio_ms: 100, fin_ms: 500 },
      { palabra: "de", inicio_ms: 500, fin_ms: 600 },
      { palabra: "m", inicio_ms: 600, fin_ms: 700 },
      { palabra: "ge", inicio_ms: 700, fin_ms: 800 },
      { palabra: "eh", inicio_ms: 800, fin_ms: 850 },
      { palabra: "cayó", inicio_ms: 850, fin_ms: 1200 },
    ];
    const tiempos = alinearSecuencias(habla.hablado.split(" "), transcritas, 1300);
    const escritas = aPalabrasEscritas(habla.tokens, tiempos);
    expect(escritas.map((p) => p.palabra)).toEqual(["La", "empresa", "DMG", "cayó."]);
    expect(escritas[2].inicio_ms).toBe(500);
    expect(escritas[2].fin_ms).toBe(800);
    expect(escritas[3]).toMatchObject({ inicio_ms: 850, fin_ms: 1200 });
  });
});

describe("mezcla", () => {
  it("une regiones de voz cercanas y genera la expresión de ducking", () => {
    const r = regionesConVoz([{ desde_ms: 0, duracion_ms: 5000 }, { desde_ms: 5400, duracion_ms: 3000 }, { desde_ms: 15000, duracion_ms: 1000 }]);
    expect(r).toEqual([[0, 8400], [15000, 16000]]);
    expect(expresionDucking(r, -8)).toMatch(/^pow\(10,-8\*max\(clip/);
    expect(expresionDucking([], -8)).toBe("1");
  });
});

describe("capítulos de YouTube", () => {
  it("empiezan en 0:00, fusionan partes de menos de 10 s y exigen 3", () => {
    const t = { fps: 30, duracion_frames: 30 * 600, partes: [{ titulo: "Gancho", desde: 15 }, { titulo: "Corta", desde: 30 * 60 }, { titulo: "Parte 1", desde: 30 * 65 }, { titulo: "Parte 2", desde: 30 * 300 }] };
    expect(capitulos(t)).toEqual([
      { inicio_ms: 0, titulo: "Gancho" },
      { inicio_ms: 65000, titulo: "Parte 1" },
      { inicio_ms: 300000, titulo: "Parte 2" },
    ]);
    expect(capitulos({ ...t, partes: t.partes.slice(0, 2) })).toEqual([]);
  });
});
