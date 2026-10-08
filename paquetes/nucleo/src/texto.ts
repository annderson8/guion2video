import type { Pronunciacion } from "./esquemas.ts";

/** "¡Árbol," → "arbol". Para comparar palabras sin importar tildes, mayúsculas ni puntuación. */
export function normalizarPalabra(p: string): string {
  return p
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ]/g, "");
}

export function palabras(texto: string): string[] {
  return texto.split(/\s+/).filter(Boolean);
}

export const contarPalabras = (texto: string) => palabras(texto).length;

const ABREVIATURAS = new Set([
  "sr", "sra", "srta", "dr", "dra", "lic", "ing", "gral", "cnel", "tte", "sto", "sta", "av", "art", "núm", "num",
  "pág", "pag", "etc", "ee", "uu", "ud", "uds", "vs", "aprox", "dpto", "depto", "cía", "cia", "s.a", "jr",
]);

/**
 * Divide un párrafo en oraciones. Respeta abreviaturas ("Sr.", "EE. UU.") y números con
 * puntos de miles ("400.000"), que en español no terminan una oración.
 */
export function dividirOraciones(texto: string): string[] {
  const limpio = texto.replace(/\s+/g, " ").trim();
  if (!limpio) return [];
  const oraciones: string[] = [];
  let inicio = 0;
  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];
    if (c !== "." && c !== "?" && c !== "!" && c !== "…") continue;
    // Avanza sobre cierres pegados: ?», .", !)
    let fin = i + 1;
    while (fin < limpio.length && /[.?!…»"”')\]]/.test(limpio[fin])) fin++;
    if (fin >= limpio.length) break;
    if (limpio[fin] !== " ") continue;
    const siguiente = limpio[fin + 1] ?? "";
    if (!/[A-ZÁÉÍÓÚÑÜ¿¡«"“0-9]/.test(siguiente)) continue;
    if (c === ".") {
      const palabraPrevia = limpio.slice(inicio, i).split(" ").pop() ?? "";
      if (ABREVIATURAS.has(palabraPrevia.toLowerCase().replace(/^[(«"“]/, ""))) continue;
      if (/^[A-ZÁÉÍÓÚÑ]$/.test(palabraPrevia)) continue; // iniciales: "J. Pérez"
    }
    oraciones.push(limpio.slice(inicio, fin).trim());
    inicio = fin + 1;
    i = fin;
  }
  const resto = limpio.slice(inicio).trim();
  if (resto) oraciones.push(resto);
  return oraciones;
}

// ───────────────────────── Números a palabras (español) ─────────────────────────

const UNIDADES = [
  "cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce",
  "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve", "veinte", "veintiuno",
  "veintidós", "veintitrés", "veinticuatro", "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve",
];
const DECENAS = ["", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
const CENTENAS = [
  "", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos",
  "ochocientos", "novecientos",
];

function menorQueMil(n: number): string {
  if (n === 100) return "cien";
  const c = Math.floor(n / 100);
  const r = n % 100;
  const partes: string[] = [];
  if (c) partes.push(CENTENAS[c]);
  if (r) {
    if (r < 30) partes.push(UNIDADES[r]);
    else {
      const d = Math.floor(r / 10);
      const u = r % 10;
      partes.push(u ? `${DECENAS[d]} y ${UNIDADES[u]}` : DECENAS[d]);
    }
  }
  return partes.join(" ");
}

/** "uno" → "un" delante de sustantivos (mil, millones): "veintiún mil", "un millón". */
const apocopar = (t: string) => t.replace(/veintiuno$/, "veintiún").replace(/uno$/, "un");

function menorQueMillon(n: number): string {
  const miles = Math.floor(n / 1000);
  const resto = n % 1000;
  const partes: string[] = [];
  if (miles === 1) partes.push("mil");
  else if (miles > 1) partes.push(`${apocopar(menorQueMil(miles))} mil`);
  if (resto) partes.push(menorQueMil(resto));
  return partes.join(" ");
}

/** Escala larga (la de Colombia y España): millón = 10^6, billón = 10^12. */
export function numeroATexto(n: number): string {
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return String(n);
  if (n === 0) return "cero";
  const billones = Math.floor(n / 1e12);
  const millones = Math.floor((n % 1e12) / 1e6);
  const resto = n % 1e6;
  const partes: string[] = [];
  if (billones) partes.push(billones === 1 ? "un billón" : `${apocopar(menorQueMillon(billones))} billones`);
  if (millones) partes.push(millones === 1 ? "un millón" : `${apocopar(menorQueMillon(millones))} millones`);
  if (resto) partes.push(menorQueMillon(resto));
  return partes.join(" ");
}

// ───────────────────────── Texto para la voz ─────────────────────────

export interface TokenHabla {
  /** Palabra tal como aparece en el guion (lo que muestran los subtítulos). */
  escrito: string;
  /** Rango de palabras en el texto hablado [desde, hasta). */
  desde: number;
  hasta: number;
}

export interface TextoHablado {
  hablado: string;
  tokens: TokenHabla[];
}

const NUMERO = /^(\d{1,3}(?:\.\d{3})+|\d+)$/;

/**
 * Convierte el texto escrito en texto para la voz (pronunciación + números),
 * guardando qué palabras habladas corresponden a cada palabra escrita.
 * Así los subtítulos muestran "DMG" aunque la voz diga "de eme ge".
 */
export function prepararHabla(
  texto: string,
  diccionario: Pronunciacion,
  op: { normalizarNumeros?: boolean } = {},
): TextoHablado {
  const escritas = palabras(texto);
  const claves = Object.entries(diccionario)
    .map(([k, v]) => ({ k: palabras(k).map(normalizarPalabra), v }))
    .filter((c) => c.k.length > 0 && c.k.every(Boolean))
    .sort((a, b) => b.k.length - a.k.length);
  const hablado: string[] = [];
  const tokens: TokenHabla[] = [];
  let i = 0;
  while (i < escritas.length) {
    const coincidencia = claves.find((c) =>
      c.k.every((parte, j) => i + j < escritas.length && normalizarPalabra(escritas[i + j]) === parte),
    );
    if (coincidencia) {
      const ultimo = escritas[i + coincidencia.k.length - 1];
      const primero = escritas[i];
      const abre = primero.match(/^[¿¡«"“(]+/)?.[0] ?? "";
      const cierra = ultimo.match(/[.,;:!?…»"”)]+$/)?.[0] ?? "";
      const reemplazo = palabras(coincidencia.v);
      const desde = hablado.length;
      reemplazo.forEach((p, j) =>
        hablado.push((j === 0 ? abre : "") + p + (j === reemplazo.length - 1 ? cierra : "")),
      );
      // Si la clave abarca varias palabras escritas, todas comparten el mismo rango hablado.
      for (let j = 0; j < coincidencia.k.length; j++) {
        tokens.push({ escrito: escritas[i + j], desde, hasta: hablado.length });
      }
      i += coincidencia.k.length;
      continue;
    }
    const palabra = escritas[i];
    const nucleo = palabra.replace(/^[¿¡«"“(]+/, "").replace(/[.,;:!?…»"”)%]+$/, "");
    const desde = hablado.length;
    if (op.normalizarNumeros && NUMERO.test(nucleo)) {
      const abre = palabra.slice(0, palabra.indexOf(nucleo));
      let cierra = palabra.slice(palabra.indexOf(nucleo) + nucleo.length);
      const enPalabras = palabras(numeroATexto(Number(nucleo.replace(/\./g, ""))));
      const porCiento = cierra.startsWith("%");
      if (porCiento) {
        cierra = cierra.slice(1);
        enPalabras.push("por", "ciento");
      }
      enPalabras.forEach((p, j) => hablado.push((j === 0 ? abre : "") + p + (j === enPalabras.length - 1 ? cierra : "")));
    } else {
      hablado.push(palabra);
    }
    tokens.push({ escrito: palabra, desde, hasta: hablado.length });
    i++;
  }
  return { hablado: hablado.join(" "), tokens };
}
