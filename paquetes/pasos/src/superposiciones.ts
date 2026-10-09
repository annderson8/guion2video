import { z } from "zod";
import { enParalelo, ErrorGuion2Video, escribirJson, existe, huella, huellaArchivo, leerJsonSiExiste, normalizarPalabra, palabras, type Escena } from "@guion2video/nucleo";
import { NOMBRES_ICONOS } from "@guion2video/render";
import type { Paso } from "./paso.ts";
import type { ContextoPaso } from "./contexto.ts";
import { leerGuion } from "./guion.ts";
import { leerEscenas } from "./escenas.ts";
import { llmConCache, registrarCosto } from "./cache.ts";
import { mensajeSuperposiciones, sistemaSuperposiciones } from "./prompts.ts";

const VERSION = 1;

export const Superposicion = z.object({
  tipo: z.enum(["palabra_clave", "etiqueta", "dato", "sello"]),
  texto: z.string().trim().min(1).max(48),
  valor: z.string().trim().max(18).optional(),
  // Un ícono desconocido no invalida la respuesta: se queda sin ícono.
  icono: z.string().transform((i) => ((NOMBRES_ICONOS as string[]).includes(i) ? i : undefined)).optional(),
  palabra: z.string().trim().optional(),
});
export type Superposicion = z.infer<typeof Superposicion>;

export const ArchivoSuperposiciones = z.object({
  escenas: z.record(z.string(), z.array(Superposicion)),
});
export type ArchivoSuperposiciones = z.infer<typeof ArchivoSuperposiciones>;

const RespuestaParte = z.object({
  escenas: z.array(z.object({ id: z.string(), superposiciones: z.array(Superposicion).default([]) })),
});
type RespuestaParte = z.infer<typeof RespuestaParte>;

export const rutaSuperposiciones = (ctx: ContextoPaso) => ctx.espacio.ruta("superposiciones.json");
export const leerSuperposiciones = (ctx: ContextoPaso) => leerJsonSiExiste(rutaSuperposiciones(ctx), ArchivoSuperposiciones);

/** Escenas sobre las que se puede superponer algo: las que tienen ilustración y narración. */
const conIlustracion = (escenas: Escena[]) => escenas.filter((e) => (e.tipo_visual === "imagen_ia" || e.tipo_visual === "archivo") && e.texto_narracion.trim());

const contiene = (texto: string, palabra: string) => {
  const buscada = normalizarPalabra(palabras(palabra)[0] ?? "");
  return !!buscada && palabras(texto).some((p) => normalizarPalabra(p) === buscada);
};

export function validarSuperposiciones(escenas: Escena[], r: RespuestaParte): string[] {
  const errores: string[] = [];
  const porId = new Map(escenas.map((e) => [e.id, e]));
  for (const e of r.escenas) {
    const escena = porId.get(e.id);
    if (!escena) {
      errores.push(`"${e.id}" no es una de las escenas recibidas`);
      continue;
    }
    if (e.superposiciones.length > 2) errores.push(`${e.id}: máximo 2 superposiciones`);
    if (e.superposiciones.filter((s) => s.tipo === "etiqueta").length > 1) errores.push(`${e.id}: máximo una "etiqueta"`);
    if (e.superposiciones.filter((s) => s.tipo !== "etiqueta").length > 1) errores.push(`${e.id}: máximo una entre "palabra_clave", "dato" y "sello"`);
    for (const s of e.superposiciones) {
      if (s.tipo === "dato" && !s.valor) errores.push(`${e.id}: el "dato" necesita "valor"`);
      if (s.tipo === "palabra_clave" && palabras(s.texto).length > 4) errores.push(`${e.id}: "${s.texto}" tiene más de 4 palabras`);
      if (s.tipo === "sello" && palabras(s.texto).length > 2) errores.push(`${e.id}: el sello "${s.texto}" tiene más de 2 palabras`);
      if (s.tipo !== "etiqueta" && !s.palabra) errores.push(`${e.id}: "${s.texto}" necesita "palabra"`);
      if (s.palabra && !contiene(escena.texto_narracion, s.palabra)) errores.push(`${e.id}: la palabra "${s.palabra}" no está en la narración`);
    }
  }
  const faltan = escenas.filter((e) => !r.escenas.some((x) => x.id === e.id)).map((e) => e.id);
  if (faltan.length) errores.push(`Faltan escenas: ${faltan.join(", ")}`);
  return errores;
}

/** Respuesta determinista para el modo simulado. */
function simular(escenas: Escena[]): RespuestaParte {
  return {
    escenas: escenas.map((e, i) => {
      const ps = palabras(e.texto_narracion).map((p) => p.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""));
      const anio = ps.find((p) => /^(19|20)\d{2}$/.test(p));
      const cifra = ps.find((p) => /^\d{1,3}(\.\d{3})+$/.test(p));
      const larga = [...ps].sort((a, b) => b.length - a.length)[0];
      const superposiciones: Superposicion[] = [];
      if (anio) superposiciones.push({ tipo: "etiqueta", texto: anio, icono: "fecha" });
      if (cifra) superposiciones.push({ tipo: "dato", valor: cifra, texto: "dato", icono: "personas", palabra: cifra });
      else if (i % 2 === 0 && larga) superposiciones.push({ tipo: "palabra_clave", texto: larga, icono: "alerta", palabra: larga });
      return { id: e.id, superposiciones };
    }),
  };
}

const huellaEntradas = async (ctx: ContextoPaso) => {
  const llm = ctx.proveedores.llm();
  const { escenas } = await leerEscenas(ctx);
  return huella(
    "superposiciones",
    VERSION,
    llm.id,
    llm.modelo,
    ctx.estilo.estilo.superposiciones.activas,
    conIlustracion(escenas).map((e) => [e.id, e.parte, e.texto_narracion, e.nota_visual ?? null]),
  );
};

export const pasoSuperposiciones: Paso = {
  nombre: "superposiciones",
  titulo: "Textos e íconos",
  depende: ["escenas"],
  revision: false,
  huella: huellaEntradas,
  salidas: (ctx) => [rutaSuperposiciones(ctx)],
  async estimar(ctx) {
    if (!ctx.estilo.estilo.superposiciones.activas) return { costo_usd: 0, unidades: 0, pendientes: 0, detalle: "desactivadas en el estilo" };
    const { escenas } = await leerEscenas(ctx);
    const llm = ctx.proveedores.llm();
    const partes = new Set(conIlustracion(escenas).map((e) => e.parte)).size;
    const palabrasNarradas = conIlustracion(escenas).reduce((s, e) => s + palabras(e.texto_narracion).length, 0);
    return { costo_usd: llm.estimarCosto(palabrasNarradas * 1.6 + 1500 * partes, 120 * conIlustracion(escenas).length + 1500 * partes), unidades: partes, pendientes: partes, detalle: `${partes} partes (${llm.modelo})` };
  },
  async ejecutar(ctx) {
    const ruta = rutaSuperposiciones(ctx);
    const estado = ctx.proyecto.pasos.superposiciones;
    if (!ctx.forzarSobrescritura && estado?.huella_salida && (await existe(ruta)) && (await huellaArchivo(ruta)) !== estado.huella_salida) {
      throw new ErrorGuion2Video(
        "superposiciones.json tiene ediciones manuales y las escenas cambiaron. Para regenerarlo y perder esas ediciones usa --forzar.",
        "validacion",
      );
    }
    const { estilo } = ctx.estilo;
    const escenas = conIlustracion((await leerEscenas(ctx)).escenas);
    if (!estilo.superposiciones.activas) {
      await escribirJson(ruta, { escenas: {} });
      return { costo_usd: 0, resumen: "desactivadas en el estilo", avisos: [], huella_salida: await huellaArchivo(ruta) };
    }

    const g = await leerGuion(ctx);
    const llm = ctx.proveedores.llm();
    const sistema = sistemaSuperposiciones(estilo, NOMBRES_ICONOS);
    const partes = [...new Set(escenas.map((e) => e.parte))].map((parte) => ({ parte, escenas: escenas.filter((e) => e.parte === parte) }));
    const forzar = ctx.forzar.has("superposiciones");
    let hechas = 0;
    ctx.log.progreso("superposiciones", 0, partes.length);
    const lote = await enParalelo(partes, 3, async (p) => {
      const mensaje = mensajeSuperposiciones(g, p.parte, p.escenas);
      const r = await llmConCache(ctx, {
        huella: huella("superposiciones-parte", VERSION, llm.id, llm.modelo, sistema, mensaje),
        forzar,
        llamar: () =>
          llm.generarJson({
            etiqueta: `textos e íconos de "${p.parte}"`,
            sistema,
            mensaje,
            esquema: RespuestaParte,
            validar: (d) => validarSuperposiciones(p.escenas, d),
            simulacion: () => simular(p.escenas),
          }),
      });
      const datos = RespuestaParte.parse(r.datos);
      await registrarCosto(ctx, { paso: "superposiciones", unidad: p.parte, proveedor: llm.id, modelo: r.modelo, costo_usd: r.costoUsd, cache: r.desde_cache });
      ctx.log.progreso("superposiciones", ++hechas, partes.length, p.parte);
      return { ...r, datos };
    });
    if (lote.fallidos.length) {
      throw new ErrorGuion2Video(`Fallaron ${lote.fallidos.length} parte(s):\n${lote.fallidos.map((f) => `  • ${f.item.parte}: ${(f.error as Error).message}`).join("\n")}`, "proveedor");
    }

    const archivo: ArchivoSuperposiciones = { escenas: {} };
    for (const { resultado } of lote.ok) {
      for (const e of resultado.datos.escenas) if (e.superposiciones.length) archivo.escenas[e.id] = e.superposiciones;
    }
    await escribirJson(ruta, archivo);
    const total = Object.values(archivo.escenas).reduce((s, l) => s + l.length, 0);
    const conAlgo = Object.keys(archivo.escenas).length;
    return {
      costo_usd: lote.ok.reduce((s, x) => s + x.resultado.costoUsd, 0),
      resumen: `${total} textos e íconos en ${conAlgo} de ${escenas.length} escenas con ilustración`,
      avisos: [],
      huella_salida: await huellaArchivo(ruta),
    };
  },
};
