import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  conReintentos,
  enParalelo,
  ErrorGuion2Video,
  escribirJson,
  existe,
  huella,
  leerJsonSiExiste,
  prepararHabla,
  type Escena,
  type PalabraAlineada,
  type TokenHabla,
} from "@guion2video/nucleo";
import { conTemporal, duracionMs, esReintentable, normalizarSonoridad } from "@guion2video/proveedores";
import type { ContextoPaso } from "./contexto.ts";
import type { Paso } from "./paso.ts";
import { conCache, registrarCosto } from "./cache.ts";
import { leerEscenas } from "./escenas.ts";

const VERSION = 1;

export interface MetaVoz {
  escena: string;
  huella: string;
  archivo: string;
  archivo_huella: string;
  proveedor: string;
  modelo: string;
  duracion_ms: number;
  texto: string;
  texto_hablado: string;
  tokens: TokenHabla[];
  alineacion_proveedor?: PalabraAlineada[];
  costo_usd: number;
  cache: boolean;
  fecha: string;
}

interface UnidadVoz {
  escena: Escena;
  huella: string;
  hablado: ReturnType<typeof prepararHabla>;
  archivo: string;
  meta: string;
}

export const rutaAudio = (id: string) => `audio/${id}.wav`;
export const rutaMetaVoz = (ctx: ContextoPaso, id: string) => ctx.espacio.ruta("audio", `${id}.meta.json`);
export const leerMetaVoz = (ctx: ContextoPaso, id: string) => leerJsonSiExiste<MetaVoz>(rutaMetaVoz(ctx, id));

async function unidades(ctx: ContextoPaso): Promise<UnidadVoz[]> {
  const { escenas } = await leerEscenas(ctx);
  const { estilo, pronunciacion } = ctx.estilo;
  const v = estilo.voz;
  const prov = ctx.proveedores.voz(v.proveedor);
  return escenas
    .filter((e) => e.texto_narracion.trim())
    .map((escena) => {
      const hablado = prepararHabla(escena.texto_narracion, pronunciacion, { normalizarNumeros: v.normalizar_numeros });
      return {
        escena,
        hablado,
        huella: huella("voz", VERSION, hablado.hablado, prov.id, prov.modelo, v.voz_id, v.velocidad, v.estabilidad, v.similitud, v.lufs),
        archivo: ctx.espacio.ruta(rutaAudio(escena.id)),
        meta: rutaMetaVoz(ctx, escena.id),
      };
    });
}

async function alDia(u: UnidadVoz): Promise<boolean> {
  const meta = await leerJsonSiExiste<MetaVoz>(u.meta);
  return !!meta && meta.huella === u.huella && (await existe(u.archivo));
}

export const pasoVoz: Paso = {
  nombre: "voz",
  titulo: "Voz",
  depende: ["escenas"],
  revision: true,
  huella: async (ctx) => huella("voz", VERSION, (await unidades(ctx)).map((u) => [u.escena.id, u.huella])),
  async huellaAprobacion(ctx) {
    // Se aprueba lo que se escuchó: si se regenera una escena, hay que volver a escucharla.
    const us = await unidades(ctx);
    const metas = await Promise.all(us.map((u) => leerJsonSiExiste<MetaVoz>(u.meta)));
    return huella("voz-aprobacion", metas.map((m) => m?.archivo_huella ?? "falta"));
  },
  salidas: () => [],
  async estimar(ctx) {
    const us = await unidades(ctx);
    const prov = ctx.proveedores.voz(ctx.estilo.estilo.voz.proveedor);
    let costo = 0;
    let pendientes = 0;
    for (const u of us) {
      if (!ctx.forzar.has(u.escena.id) && ((await alDia(u)) || (await existe(join(ctx.espacio.rutas.cache, "voz", `${u.huella}.wav`))))) continue;
      pendientes++;
      costo += prov.estimarCosto(u.hablado.hablado);
    }
    const caracteres = us.reduce((s, u) => s + u.hablado.hablado.length, 0);
    return { costo_usd: costo, unidades: us.length, pendientes, detalle: `${caracteres.toLocaleString("es-CO")} caracteres con ${prov.id}` };
  },
  async ejecutar(ctx) {
    const us = await unidades(ctx);
    const v = ctx.estilo.estilo.voz;
    const prov = ctx.proveedores.voz(v.proveedor);
    let costo = 0;
    let generadas = 0;
    let hechas = 0;
    const lote = await enParalelo(us, 3, async (u) => {
      const forzar = ctx.forzar.has(u.escena.id);
      if (!forzar && (await alDia(u))) {
        ctx.log.progreso("voz", ++hechas, us.length);
        return;
      }
      const r = await conCache(ctx, {
        tipo: "voz",
        huella: u.huella,
        ext: "wav",
        destino: u.archivo,
        forzar,
        generar: async () => {
          const sintesis = await conReintentos(
            () => prov.sintetizar({ texto: u.hablado.hablado, vozId: v.voz_id, opciones: { velocidad: v.velocidad, estabilidad: v.estabilidad, similitud: v.similitud, idioma: ctx.estilo.estilo.idioma } }),
            { reintentable: esReintentable, alReintentar: (e, n) => ctx.log.aviso(`voz ${u.escena.id}: reintento ${n} (${(e as Error).message.slice(0, 120)})`) },
          );
          // Cada escena se normaliza a la misma sonoridad (-16 LUFS por defecto).
          const datos = await conTemporal(async (dir) => {
            const crudo = join(dir, `crudo.${sintesis.formato}`);
            const salida = join(dir, "norm.wav");
            await writeFile(crudo, sintesis.audio);
            await normalizarSonoridad(crudo, salida, { lufs: v.lufs, frecuencia: 48000, canales: 1, codec: ["-c:a", "pcm_s16le"] });
            return readFile(salida);
          });
          return { datos, costo_usd: sintesis.costoUsd, meta: { alineacion: sintesis.alineacion } };
        },
      });
      if (!r.desde_cache) generadas++;
      costo += r.desde_cache ? 0 : r.costo_usd;
      await registrarCosto(ctx, { paso: "voz", escena: u.escena.id, proveedor: prov.id, modelo: prov.modelo, costo_usd: r.costo_usd, cache: r.desde_cache, detalle: { caracteres: u.hablado.hablado.length } });
      const meta: MetaVoz = {
        escena: u.escena.id,
        huella: u.huella,
        archivo: rutaAudio(u.escena.id),
        archivo_huella: r.archivo_huella,
        proveedor: prov.id,
        modelo: prov.modelo,
        duracion_ms: await duracionMs(u.archivo),
        texto: u.escena.texto_narracion,
        texto_hablado: u.hablado.hablado,
        tokens: u.hablado.tokens,
        alineacion_proveedor: r.meta.alineacion as PalabraAlineada[] | undefined,
        costo_usd: r.desde_cache ? 0 : r.costo_usd,
        cache: r.desde_cache,
        fecha: new Date().toISOString(),
      };
      await escribirJson(u.meta, meta);
      ctx.log.progreso("voz", ++hechas, us.length, u.escena.id);
    });
    if (lote.fallidos.length) {
      throw new ErrorGuion2Video(
        `No se pudo generar la voz de ${lote.fallidos.length} escena(s) (las demás quedaron guardadas):\n${lote.fallidos.map((f) => `  • ${f.item.escena.id}: ${(f.error as Error).message}`).join("\n")}`,
        "proveedor",
      );
    }
    const total = (await Promise.all(us.map((u) => leerJsonSiExiste<MetaVoz>(u.meta)))).reduce((s, m) => s + (m?.duracion_ms ?? 0), 0);
    return {
      costo_usd: costo,
      resumen: `${us.length} escenas narradas (${generadas} nuevas, ${us.length - generadas} desde caché), ${(total / 60000).toFixed(1)} min de voz`,
      avisos: [],
    };
  },
};
