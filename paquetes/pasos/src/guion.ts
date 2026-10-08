import { readFile } from "node:fs/promises";
import {
  contarPalabras,
  dividirOraciones,
  escribirArchivo,
  escribirJson,
  GuionEstructurado,
  huella,
  huellaArchivo,
  leerJson,
  palabras,
  type ParteGuion,
} from "@guion2video/nucleo";
import type { Paso } from "./paso.ts";

const VERSION = 4;
const SECCION_FUENTES = /^(fuentes|referencias|bibliograf[ií]a|fuentes consultadas|notas y fuentes)\b/i;

/** Quita el formato Markdown en línea y deja el texto que se narra. */
function limpiarEnLinea(texto: string): string {
  return texto
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // imágenes
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // enlaces → texto
    .replace(/`([^`]+)`/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(^|[\s(«"“])[*_]([^*_\n]+)[*_](?=[\s.,;:!?)»"”]|$)/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

interface ParrafoCrudo {
  texto: string;
  /** Notas visuales con la posición (en palabras) donde aparecían. */
  notas: { indicePalabra: number; texto: string }[];
}

/** Extrae las notas [entre corchetes] (que no son enlaces) y recuerda dónde estaban. */
function extraerNotas(linea: string): ParrafoCrudo {
  const notas: ParrafoCrudo["notas"] = [];
  let resultado = "";
  let resto = linea;
  const re = /\[([^\]]+)\](?!\()/;
  for (let m = re.exec(resto); m; m = re.exec(resto)) {
    resultado += resto.slice(0, m.index);
    notas.push({ indicePalabra: contarPalabras(limpiarEnLinea(resultado)), texto: m[1].trim() });
    resto = resto.slice(m.index + m[0].length);
  }
  resultado += resto;
  return { texto: limpiarEnLinea(resultado), notas };
}

const esLineaEnCursiva = (l: string) => /^\s*([*_])(?!\1)[^*_].*[^*_]\1\s*$/.test(l) || /^\s*\([^)]*\)\s*$/.test(l);

/**
 * Convierte el guion en Markdown en partes y oraciones numeradas.
 * - `# Título` es el título del video; `##`/`###` abren una parte.
 * - La sección de fuentes se guarda aparte (no se narra).
 * - `[notas]`, líneas en cursiva y citas en bloque (`> …`) se quitan del texto y se guardan como notas visuales.
 */
export function analizarGuion(markdown: string, tituloPorDefecto: string): GuionEstructurado {
  const lineas = markdown.replace(/\r\n/g, "\n").replace(/<!--[\s\S]*?-->/g, "").split("\n");
  let titulo = "";
  const partes: { titulo: string; parrafos: ParrafoCrudo[] }[] = [];
  const fuentes: string[] = [];
  let enFuentes = false;
  let pendientes: string[] = []; // notas sueltas que se pegan a la siguiente oración
  let bufer: string[] = [];

  const parteActual = () => {
    if (!partes.length) partes.push({ titulo: "Inicio", parrafos: [] });
    return partes[partes.length - 1];
  };
  const cerrarParrafo = () => {
    if (!bufer.length) return;
    const crudo = bufer.join(" ");
    bufer = [];
    if (enFuentes) {
      const f = limpiarEnLinea(crudo.replace(/^[-*+]\s+|^\d+[.)]\s+/, ""));
      if (f) fuentes.push(f);
      return;
    }
    const p = extraerNotas(crudo);
    if (pendientes.length) {
      p.notas.unshift(...pendientes.map((texto) => ({ indicePalabra: 0, texto })));
      pendientes = [];
    }
    if (p.texto) parteActual().parrafos.push(p);
    else pendientes.push(...p.notas.map((n) => n.texto));
  };

  for (const original of lineas) {
    const linea = original.trimEnd();
    const encabezado = linea.match(/^(#{1,6})\s+(.*)$/);
    if (encabezado) {
      cerrarParrafo();
      pendientes = []; // una nota suelta antes de un encabezado no pasa a la parte siguiente
      const texto = limpiarEnLinea(encabezado[2]);
      if (encabezado[1].length === 1 && !titulo) {
        titulo = texto;
        continue;
      }
      enFuentes = SECCION_FUENTES.test(texto);
      if (!enFuentes) partes.push({ titulo: texto, parrafos: [] });
      continue;
    }
    if (!linea.trim() || /^(-{3,}|\*{3,}|_{3,})$/.test(linea.trim())) {
      cerrarParrafo();
      continue;
    }
    if (enFuentes) {
      // En fuentes, cada elemento de lista es una fuente.
      if (/^\s*([-*+]|\d+[.)])\s+/.test(linea)) cerrarParrafo();
      bufer.push(linea.trim());
      continue;
    }
    // Las citas en bloque (> …) son notas del guionista, no se narran.
    if (/^\s*>/.test(linea)) {
      cerrarParrafo();
      const nota = limpiarEnLinea(linea.replace(/^\s*>\s?/, ""));
      if (nota) pendientes.push(nota);
      continue;
    }
    if (esLineaEnCursiva(linea)) {
      cerrarParrafo();
      pendientes.push(limpiarEnLinea(linea.trim().replace(/^[*_(]|[*_)]$/g, "")));
      continue;
    }
    bufer.push(linea.replace(/^\s*([-*+]|\d+[.)])\s+/, "").trim());
  }
  cerrarParrafo();

  let n = 0;
  const estructuradas: ParteGuion[] = partes
    .filter((p) => p.parrafos.length)
    .map((p, i) => ({
      id: `parte-${String(i + 1).padStart(2, "0")}`,
      titulo: p.titulo,
      oraciones: p.parrafos.flatMap((par) => {
        const oraciones = dividirOraciones(par.texto);
        // Fin (en palabras) de cada oración, para ubicar cada nota en la oración donde aparecía.
        const fines: number[] = [];
        oraciones.reduce((acc, o) => (fines.push(acc + contarPalabras(o)), acc + contarPalabras(o)), 0);
        const notasPorOracion = oraciones.map(() => [] as string[]);
        for (const nota of par.notas) {
          const i = fines.findIndex((fin) => nota.indicePalabra < fin);
          notasPorOracion[i < 0 ? oraciones.length - 1 : i].push(nota.texto);
        }
        return oraciones.map((texto, i) => ({ id: `o-${String(++n).padStart(4, "0")}`, texto, notas: notasPorOracion[i] }));
      }),
    }));

  return {
    titulo: titulo || tituloPorDefecto,
    partes: estructuradas,
    fuentes,
    palabras: estructuradas.reduce((s, p) => s + p.oraciones.reduce((a, o) => a + palabras(o.texto).length, 0), 0),
  };
}

export function guionAMarkdown(g: GuionEstructurado): string {
  const cuerpo = g.partes
    .map((p) => `## ${p.titulo}\n\n${p.oraciones.map((o) => o.texto + (o.notas.length ? ` [${o.notas.join(" · ")}]` : "")).join(" ")}`)
    .join("\n\n");
  const fuentes = g.fuentes.length ? `\n\n## Fuentes\n\n${g.fuentes.map((f) => `- ${f}`).join("\n")}` : "";
  return `# ${g.titulo}\n\n${cuerpo}${fuentes}\n`;
}

export const pasoGuion: Paso = {
  nombre: "guion",
  titulo: "Guion",
  depende: [],
  revision: true,
  huella: async (ctx) => huella("guion", VERSION, await huellaArchivo(ctx.espacio.rutas.guionFuente)),
  huellaAprobacion: async (ctx) => huellaArchivo(ctx.espacio.rutas.guionJson),
  salidas: (ctx) => [ctx.espacio.rutas.guion, ctx.espacio.rutas.guionJson],
  estimar: async () => ({ costo_usd: 0, unidades: 1, pendientes: 1 }),
  async ejecutar(ctx) {
    const md = await readFile(ctx.espacio.rutas.guionFuente, "utf8");
    const g = analizarGuion(md, ctx.proyecto.titulo ?? ctx.proyecto.slug);
    const avisos: string[] = [];
    if (!g.fuentes.length) avisos.push("El guion no tiene sección de fuentes: es obligatoria antes de publicar (riesgo legal).");
    if (g.partes.length < 3) avisos.push(`El guion tiene ${g.partes.length} parte(s): YouTube necesita al menos 3 capítulos.`);
    const minutos = g.palabras / 150;
    if (minutos < 15 || minutos > 30) avisos.push(`${g.palabras} palabras ≈ ${minutos.toFixed(1)} min de narración (meta: 18–25 min).`);
    await escribirJson(ctx.espacio.rutas.guionJson, g);
    await escribirArchivo(ctx.espacio.rutas.guion, guionAMarkdown(g));
    if (!ctx.proyecto.titulo) await ctx.espacio.modificar((p) => void (p.titulo = g.titulo));
    const oraciones = g.partes.reduce((s, p) => s + p.oraciones.length, 0);
    return {
      costo_usd: 0,
      resumen: `${g.partes.length} partes, ${oraciones} oraciones, ${g.palabras} palabras (≈${minutos.toFixed(1)} min), ${g.fuentes.length} fuentes`,
      avisos,
    };
  },
};

export const leerGuion = (ctx: { espacio: { rutas: { guionJson: string } } }) => leerJson(ctx.espacio.rutas.guionJson, GuionEstructurado);
