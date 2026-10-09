import { z } from "zod";
import { contarPalabras, dividirOraciones, ErrorGuion2Video } from "@guion2video/nucleo";
import type { ProveedorLlm } from "@guion2video/proveedores";
import { mensajeEstructura, sistemaEstructura } from "./prompts.ts";

/** Una oración del texto con el párrafo al que pertenece (para rearmar los párrafos tal cual). */
export interface Fragmento {
  texto: string;
  parrafo: number;
}

const RespuestaEstructura = z.object({
  titulo: z.string().trim().min(1).max(120),
  partes: z.array(z.object({ titulo: z.string().trim().min(1).max(80), desde: z.number().int() })).min(1),
  fuentes_desde: z.number().int().nullable().default(null),
});
export type RespuestaEstructura = z.infer<typeof RespuestaEstructura>;

/** Párrafos separados por líneas en blanco; cada uno, en oraciones. */
export function fragmentar(texto: string): { fragmentos: Fragmento[]; parrafos: string[] } {
  const parrafos = texto
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const fragmentos = parrafos.flatMap((p, i) => dividirOraciones(p).map((texto) => ({ texto, parrafo: i })));
  return { fragmentos, parrafos };
}

export function validarEstructura(r: RespuestaEstructura, total: number): string[] {
  const errores: string[] = [];
  const fin = r.fuentes_desde ?? total;
  if (r.partes[0]?.desde !== 0) errores.push("La primera parte debe empezar en el fragmento 0");
  r.partes.forEach((p, i) => {
    if (i > 0 && p.desde <= r.partes[i - 1].desde) errores.push(`La parte "${p.titulo}" debe empezar después de la anterior`);
    if (p.desde < 0 || p.desde >= fin) errores.push(`La parte "${p.titulo}" empieza en ${p.desde}, fuera del texto narrado (0–${fin - 1})`);
  });
  if (r.fuentes_desde !== null && (r.fuentes_desde <= 0 || r.fuentes_desde >= total)) errores.push(`fuentes_desde (${r.fuentes_desde}) está fuera del texto`);
  return errores;
}

/**
 * Arma el Markdown con el texto original intacto: solo se añaden el título, los encabezados de
 * las partes y la sección de fuentes (que se copia tal cual, con sus saltos de línea).
 */
export function ensamblarEstructura(fragmentos: Fragmento[], parrafos: string[], r: RespuestaEstructura): string {
  const finNarrado = r.fuentes_desde ?? fragmentos.length;
  const bloques: string[] = [`# ${r.titulo}`];
  r.partes.forEach((p, i) => {
    const hasta = r.partes[i + 1]?.desde ?? finNarrado;
    const delTramo = fragmentos.slice(p.desde, hasta);
    const textos: string[] = [];
    delTramo.forEach((f, j) => {
      if (j > 0 && f.parrafo === delTramo[j - 1].parrafo) textos[textos.length - 1] += ` ${f.texto}`;
      else textos.push(f.texto);
    });
    bloques.push(`## ${p.titulo}`, ...textos);
  });
  if (r.fuentes_desde !== null) {
    // Las fuentes van desde el párrafo donde empiezan; si empiezan a mitad de párrafo, desde esa oración.
    const primero = fragmentos[r.fuentes_desde];
    const resto = fragmentos.filter((f, i) => i >= r.fuentes_desde! && f.parrafo === primero.parrafo).map((f) => f.texto).join(" ");
    const enteros = primero && fragmentos.findIndex((f) => f.parrafo === primero.parrafo) === r.fuentes_desde;
    bloques.push("## Fuentes", enteros ? parrafos[primero.parrafo] : resto, ...parrafos.slice(primero.parrafo + 1));
  }
  return `${bloques.join("\n\n")}\n`;
}

/** Simulación determinista: Gancho con el primer párrafo y el resto en dos partes. */
function simular(fragmentos: Fragmento[]): RespuestaEstructura {
  const n = fragmentos.length;
  const partes = [{ titulo: "Gancho", desde: 0 }];
  if (n >= 3) partes.push({ titulo: "Parte 1: El origen", desde: Math.max(1, Math.floor(n / 3)) }, { titulo: "Parte 2: El desenlace", desde: Math.max(2, Math.floor((2 * n) / 3)) });
  return { titulo: fragmentos[0]?.texto.split(/\s+/).slice(0, 5).join(" ").replace(/[.,;:]$/, "") || "Sin título", partes, fuentes_desde: null };
}

/** Propone título, partes y fuentes para un guion en texto plano, sin cambiar ninguna palabra narrada. */
export async function estructurarTexto(llm: ProveedorLlm, texto: string): Promise<{ markdown: string; titulo: string; partes: string[]; fuentes: boolean; costoUsd: number }> {
  if (/^#{1,2}\s+\S/m.test(texto)) throw new ErrorGuion2Video("El guion ya tiene encabezados de Markdown (# o ##): ya está estructurado.", "validacion");
  const { fragmentos, parrafos } = fragmentar(texto);
  if (!fragmentos.length) throw new ErrorGuion2Video("El guion está vacío", "validacion");
  const r = await llm.generarJson({
    etiqueta: "estructurar guion",
    sistema: sistemaEstructura(),
    mensaje: mensajeEstructura(fragmentos, contarPalabras(texto)),
    esquema: RespuestaEstructura,
    validar: (d) => validarEstructura(d, fragmentos.length),
    simulacion: () => simular(fragmentos),
  });
  const datos = RespuestaEstructura.parse(r.datos);
  return { markdown: ensamblarEstructura(fragmentos, parrafos, datos), titulo: datos.titulo, partes: datos.partes.map((p) => p.titulo), fuentes: datos.fuentes_desde !== null, costoUsd: r.costoUsd };
}
