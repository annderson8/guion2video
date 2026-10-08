import { join } from "node:path";
import sharp from "sharp";
import {
  conReintentos,
  enParalelo,
  ErrorGuion2Video,
  escribirArchivo,
  escribirJson,
  existe,
  huella,
  huellaArchivo,
  leerJsonSiExiste,
  sha256,
  type Escena,
  type ImagenEscena,
} from "@guion2video/nucleo";
import { esReintentable } from "@guion2video/proveedores";
import type { ContextoPaso } from "./contexto.ts";
import type { Paso } from "./paso.ts";
import { conCache, registrarCosto } from "./cache.ts";
import { leerEscenas } from "./escenas.ts";

const VERSION = 1;

export interface MetaImagen {
  id: string;
  escena: string;
  huella: string;
  archivo: string;
  archivo_huella: string;
  origen: "ia" | "usuario";
  prompt?: string;
  prompt_final?: string;
  proveedor?: string;
  modelo?: string;
  calidad?: string;
  fuente?: string;
  costo_usd: number;
  cache: boolean;
  fecha: string;
  ancho: number;
  alto: number;
  ancho_original: number;
  alto_original: number;
  aprobada?: { archivo_huella: string; fecha: string };
  meta_proveedor?: Record<string, unknown>;
}

export const rutaImagen = (id: string) => `imagenes/${id}.jpg`;
export const rutaMetaImagen = (ctx: ContextoPaso, id: string) => ctx.espacio.ruta("imagenes", `${id}.meta.json`);
export const leerMetaImagen = (ctx: ContextoPaso, id: string) => leerJsonSiExiste<MetaImagen>(rutaMetaImagen(ctx, id));
export const estaAprobada = (m?: MetaImagen) => !!m && m.aprobada?.archivo_huella === m.archivo_huella;

/** El prompt de la escena + el estilo fijo del canal. */
export function componerPrompt(imagen: ImagenEscena, estiloPrompt: string): string {
  return `${imagen.prompt.trim().replace(/\.?$/, ".")}\n\nEstilo visual: ${estiloPrompt}. Encuadre horizontal 16:9.`;
}

interface UnidadImagen {
  escena: Escena;
  imagen: ImagenEscena;
  huella: string;
  proveedor: string;
  promptFinal: string;
  archivo: string;
}

async function referencias(ctx: ContextoPaso) {
  const rutas = ctx.estilo.estilo.imagen.imagenes_referencia.map(ctx.estilo.resolver);
  const validas: string[] = [];
  for (const r of rutas) {
    if (await existe(r)) validas.push(r);
    else ctx.log.aviso(`No encuentro la imagen de referencia ${r}; se omite`);
  }
  return { rutas: validas, huellas: await Promise.all(validas.map(huellaArchivo)) };
}

async function unidades(ctx: ContextoPaso): Promise<{ lista: UnidadImagen[]; archivo: Escena[]; refs: string[] }> {
  const { escenas } = await leerEscenas(ctx);
  const { imagen: cfg } = ctx.estilo.estilo;
  const salida = ctx.proveedores.config.imagenes;
  const refs = await referencias(ctx);
  const lista: UnidadImagen[] = [];
  for (const escena of escenas.filter((e) => e.tipo_visual === "imagen_ia")) {
    for (const imagen of escena.imagenes) {
      const proveedor = ctx.proveedores.imagen(imagen.calidad === "premium" ? cfg.proveedor_premium : cfg.proveedor_principal);
      const promptFinal = componerPrompt(imagen, cfg.estilo_prompt);
      lista.push({
        escena,
        imagen,
        proveedor: proveedor.id,
        promptFinal,
        archivo: ctx.espacio.ruta(rutaImagen(imagen.id)),
        huella: huella("imagen", VERSION, promptFinal, cfg.negativo, refs.huellas, proveedor.id, proveedor.modelo, imagen.calidad, cfg.relacion_aspecto, salida.ancho_salida, salida.alto_salida),
      });
    }
  }
  return { lista, archivo: escenas.filter((e) => e.tipo_visual === "archivo"), refs: refs.rutas };
}

/** Recorta a 16:9 y escala con lanczos a la resolución de trabajo (2x para que el zoom no pierda calidad). */
export async function procesarImagen(datos: Buffer, ancho: number, alto: number) {
  const original = await sharp(datos).metadata();
  const salida = await sharp(datos)
    .rotate()
    .resize(ancho, alto, { fit: "cover", position: "attention", kernel: "lanczos3" })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
  return { salida, anchoOriginal: original.width ?? 0, altoOriginal: original.height ?? 0 };
}

async function necesitaGenerar(ctx: ContextoPaso, u: UnidadImagen): Promise<"al_dia" | "usuario" | "generar"> {
  const meta = await leerMetaImagen(ctx, u.imagen.id);
  if (ctx.forzar.has(u.imagen.id) || ctx.forzar.has(u.escena.id)) return "generar";
  if (meta?.origen === "usuario" && (await existe(u.archivo))) return "usuario";
  if (meta?.huella === u.huella && (await existe(u.archivo))) return "al_dia";
  return "generar";
}

/** Todas las imágenes que el video necesita (generadas o de archivo), con su meta si existe. */
export async function inventarioImagenes(ctx: ContextoPaso) {
  const { lista, archivo } = await unidades(ctx);
  const ids = [...lista.map((u) => ({ id: u.imagen.id, escena: u.escena.id, tipo: "imagen_ia" as const })), ...archivo.flatMap((e) => e.imagenes.map((i) => ({ id: i.id, escena: e.id, tipo: "archivo" as const })))];
  return Promise.all(ids.map(async (x) => ({ ...x, meta: await leerMetaImagen(ctx, x.id) })));
}

export const pasoImagenes: Paso = {
  nombre: "imagenes",
  titulo: "Imágenes",
  depende: ["escenas"],
  revision: true,
  huella: async (ctx) => {
    const { lista, archivo } = await unidades(ctx);
    return huella("imagenes", VERSION, lista.map((u) => [u.imagen.id, u.huella]), archivo.map((e) => e.imagenes.map((i) => i.id)));
  },
  async huellaAprobacion(ctx) {
    const inv = await inventarioImagenes(ctx);
    return huella("imagenes-aprobacion", inv.map((x) => x.meta?.archivo_huella ?? "falta"));
  },
  salidas: () => [],
  async estimar(ctx) {
    const { lista } = await unidades(ctx);
    let costo = 0;
    let pendientes = 0;
    const porProveedor: Record<string, number> = {};
    for (const u of lista) {
      if ((await necesitaGenerar(ctx, u)) !== "generar") continue;
      if (!ctx.forzar.has(u.imagen.id) && (await existe(join(ctx.espacio.rutas.cache, "imagenes", `${u.huella}.jpg`)))) continue;
      pendientes++;
      porProveedor[u.proveedor] = (porProveedor[u.proveedor] ?? 0) + 1;
      costo += ctx.proveedores.imagen(u.proveedor).estimarCosto({ calidad: u.imagen.calidad });
    }
    return {
      costo_usd: costo,
      unidades: lista.length,
      pendientes,
      detalle: Object.entries(porProveedor).map(([p, n]) => `${n} con ${p}`).join(", ") || "todo en caché",
    };
  },
  async ejecutar(ctx) {
    const { lista, archivo, refs } = await unidades(ctx);
    const cfg = ctx.estilo.estilo.imagen;
    const salida = ctx.proveedores.config.imagenes;
    const paralelo = ctx.config.paraleloImagenes || salida.paralelo;
    let costo = 0;
    let generadas = 0;
    let hechas = 0;
    const avisos: string[] = [];
    const lote = await enParalelo(lista, paralelo, async (u) => {
      const accion = await necesitaGenerar(ctx, u);
      if (accion !== "generar") {
        ctx.log.progreso("imágenes", ++hechas, lista.length);
        return;
      }
      const prov = ctx.proveedores.imagen(u.proveedor);
      const r = await conCache(ctx, {
        tipo: "imagenes",
        huella: u.huella,
        ext: "jpg",
        destino: u.archivo,
        forzar: ctx.forzar.has(u.imagen.id) || ctx.forzar.has(u.escena.id),
        generar: async () => {
          const g = await conReintentos(
            () => prov.generar({ prompt: u.promptFinal, negativo: cfg.negativo, referencias: refs, relacionAspecto: cfg.relacion_aspecto, calidad: u.imagen.calidad }),
            {
              reintentos: salida.reintentos,
              esperaBaseMs: 2000,
              reintentable: esReintentable,
              alReintentar: (e, n, ms) => ctx.log.aviso(`${u.imagen.id}: reintento ${n} en ${(ms / 1000).toFixed(1)} s (${(e as Error).message.slice(0, 140)})`),
            },
          );
          const p = await procesarImagen(g.imagen, salida.ancho_salida, salida.alto_salida);
          return { datos: p.salida, costo_usd: g.costoUsd, meta: { ...g.meta, ancho_original: p.anchoOriginal, alto_original: p.altoOriginal } };
        },
      });
      if (!r.desde_cache) generadas++;
      costo += r.desde_cache ? 0 : r.costo_usd;
      await registrarCosto(ctx, { paso: "imagenes", escena: u.escena.id, unidad: u.imagen.id, proveedor: prov.id, modelo: prov.modelo, costo_usd: r.costo_usd, cache: r.desde_cache });
      const meta: MetaImagen = {
        id: u.imagen.id,
        escena: u.escena.id,
        huella: u.huella,
        archivo: rutaImagen(u.imagen.id),
        archivo_huella: r.archivo_huella,
        origen: "ia",
        prompt: u.imagen.prompt,
        prompt_final: u.promptFinal,
        proveedor: prov.id,
        modelo: prov.modelo,
        calidad: u.imagen.calidad,
        costo_usd: r.desde_cache ? 0 : r.costo_usd,
        cache: r.desde_cache,
        fecha: new Date().toISOString(),
        ancho: salida.ancho_salida,
        alto: salida.alto_salida,
        ancho_original: Number(r.meta.ancho_original ?? 0),
        alto_original: Number(r.meta.alto_original ?? 0),
        meta_proveedor: r.meta,
      };
      await escribirJson(rutaMetaImagen(ctx, u.imagen.id), meta);
      ctx.log.progreso("imágenes", ++hechas, lista.length, u.imagen.id);
    });
    for (const e of archivo) {
      for (const img of e.imagenes) {
        if (!(await leerMetaImagen(ctx, img.id))) avisos.push(`${img.id} (${e.id}) es material de archivo: súbelo con "guion2video subir-imagen" o desde la interfaz.`);
      }
    }
    if (lote.fallidos.length) {
      throw new ErrorGuion2Video(
        `Fallaron ${lote.fallidos.length} de ${lista.length} imágenes (las demás quedaron guardadas; vuelve a ejecutar para reintentar solo esas):\n${lote.fallidos.map((f) => `  • ${f.item.imagen.id}: ${(f.error as Error).message.slice(0, 200)}`).join("\n")}`,
        "proveedor",
      );
    }
    return { costo_usd: costo, resumen: `${lista.length} imágenes (${generadas} nuevas, ${lista.length - generadas} sin cambios o en caché)`, avisos };
  },
  async aprobar(ctx, { unidades: filtro }) {
    const inv = await inventarioImagenes(ctx);
    let n = 0;
    for (const x of inv) {
      if (filtro?.length && !filtro.includes(x.id) && !filtro.includes(x.escena)) continue;
      if (!x.meta) continue;
      x.meta.aprobada = { archivo_huella: x.meta.archivo_huella, fecha: new Date().toISOString() };
      await escribirJson(rutaMetaImagen(ctx, x.id), x.meta);
      n++;
    }
    return n;
  },
  async aprobado(ctx) {
    const inv = await inventarioImagenes(ctx);
    return inv.length > 0 ? inv.every((x) => estaAprobada(x.meta)) : true;
  },
};

/** "Subir mi propia imagen": reemplaza la generada (o llena una escena de archivo). Queda aprobada. */
export async function subirImagenPropia(ctx: ContextoPaso, imagenId: string, datos: Buffer, op: { fuente?: string } = {}): Promise<MetaImagen> {
  const { escenas } = await leerEscenas(ctx);
  const escena = escenas.find((e) => e.imagenes.some((i) => i.id === imagenId));
  if (!escena) throw new ErrorGuion2Video(`No existe la imagen ${imagenId} en escenas.json`, "no_encontrado");
  const imagen = escena.imagenes.find((i) => i.id === imagenId)!;
  const salida = ctx.proveedores.config.imagenes;
  const p = await procesarImagen(datos, salida.ancho_salida, salida.alto_salida);
  if (p.anchoOriginal < 1280) ctx.log.aviso(`${imagenId}: la imagen original mide ${p.anchoOriginal}px de ancho (mínimo recomendado 1280px)`);
  const archivo = ctx.espacio.ruta(rutaImagen(imagenId));
  await escribirArchivo(archivo, p.salida);
  const archivo_huella = sha256(p.salida).slice(0, 24);
  const meta: MetaImagen = {
    id: imagenId,
    escena: escena.id,
    huella: `usuario-${archivo_huella}`,
    archivo: rutaImagen(imagenId),
    archivo_huella,
    origen: "usuario",
    prompt: imagen.prompt,
    fuente: op.fuente ?? imagen.fuente,
    costo_usd: 0,
    cache: false,
    fecha: new Date().toISOString(),
    ancho: salida.ancho_salida,
    alto: salida.alto_salida,
    ancho_original: p.anchoOriginal,
    alto_original: p.altoOriginal,
    aprobada: { archivo_huella, fecha: new Date().toISOString() },
  };
  await escribirJson(rutaMetaImagen(ctx, imagenId), meta);
  return meta;
}
