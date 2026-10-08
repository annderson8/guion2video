import {
  Alineacion,
  enParalelo,
  ErrorGuion2Video,
  escribirJson,
  huella,
  leerJsonSiExiste,
  normalizarPalabra,
  palabras,
  type PalabraAlineada,
  type TokenHabla,
} from "@guion2video/nucleo";
import type { ContextoPaso } from "./contexto.ts";
import type { Paso } from "./paso.ts";
import { registrarCosto } from "./cache.ts";
import { leerEscenas } from "./escenas.ts";
import { leerMetaVoz, type MetaVoz } from "./voz.ts";

const VERSION = 1;

/**
 * Alinea la secuencia esperada de palabras con las palabras que trae el proveedor o la transcripción
 * (programación dinámica tipo Needleman-Wunsch). Tolera palabras de más, de menos o mal transcritas.
 * Devuelve, para cada palabra esperada, sus tiempos (interpolados si no tuvo pareja).
 */
export function alinearSecuencias(esperadas: string[], obtenidas: PalabraAlineada[], duracionMs: number): { inicio_ms: number; fin_ms: number }[] {
  const a = esperadas.map(normalizarPalabra);
  const b = obtenidas.map((o) => normalizarPalabra(o.palabra));
  const n = a.length;
  const m = b.length;
  const costo = (x: string, y: string) => (x === y ? 0 : x && y && (x.startsWith(y) || y.startsWith(x)) ? 0.5 : 1.2);
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 1; i <= n; i++) dp[i][0] = i;
  for (let j = 1; j <= m; j++) dp[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = Math.min(dp[i - 1][j - 1] + costo(a[i - 1], b[j - 1]), dp[i - 1][j] + 1, dp[i][j - 1] + 1);
    }
  }
  const pareja = new Array<number>(n).fill(-1);
  for (let i = n, j = m; i > 0 && j > 0; ) {
    if (dp[i][j] === dp[i - 1][j - 1] + costo(a[i - 1], b[j - 1])) {
      if (costo(a[i - 1], b[j - 1]) < 1.2) pareja[i - 1] = j - 1;
      i--;
      j--;
    } else if (dp[i][j] === dp[i - 1][j] + 1) i--;
    else j--;
  }
  const tiempos: ({ inicio_ms: number; fin_ms: number } | undefined)[] = pareja.map((j) => (j >= 0 ? { inicio_ms: obtenidas[j].inicio_ms, fin_ms: obtenidas[j].fin_ms } : undefined));
  // Interpola las palabras sin pareja entre sus vecinas.
  for (let i = 0; i < n; i++) {
    if (tiempos[i]) continue;
    let k = i;
    while (k < n && !tiempos[k]) k++;
    const desde = i > 0 ? tiempos[i - 1]!.fin_ms : 0;
    const hasta = k < n ? tiempos[k]!.inicio_ms : duracionMs;
    const paso = (hasta - desde) / (k - i);
    for (let x = i; x < k; x++) tiempos[x] = { inicio_ms: Math.round(desde + paso * (x - i)), fin_ms: Math.round(desde + paso * (x - i + 1)) };
    i = k - 1;
  }
  return tiempos as { inicio_ms: number; fin_ms: number }[];
}

/** De tiempos sobre el texto hablado ("de eme ge") a tiempos sobre el texto escrito ("DMG"). */
export function aPalabrasEscritas(tokens: TokenHabla[], habladas: { inicio_ms: number; fin_ms: number }[]): PalabraAlineada[] {
  return tokens.map((t) => {
    const inicio = habladas[t.desde]?.inicio_ms ?? habladas[habladas.length - 1]?.fin_ms ?? 0;
    const fin = habladas[Math.max(t.desde, t.hasta - 1)]?.fin_ms ?? inicio;
    return { palabra: t.escrito, inicio_ms: inicio, fin_ms: Math.max(fin, inicio + 1) };
  });
}

export const rutaAlineacion = (ctx: ContextoPaso, id: string) => ctx.espacio.ruta("audio", `${id}.alineacion.json`);
export const leerAlineacion = (ctx: ContextoPaso, id: string) => leerJsonSiExiste(rutaAlineacion(ctx, id), Alineacion);

async function unidades(ctx: ContextoPaso) {
  const { escenas } = await leerEscenas(ctx);
  const trans = ctx.proveedores.transcripcion();
  const narradas = escenas.filter((e) => e.texto_narracion.trim());
  return Promise.all(
    narradas.map(async (e) => {
      const voz = await leerMetaVoz(ctx, e.id);
      if (!voz) throw new ErrorGuion2Video(`Falta la voz de ${e.id}: ejecuta el paso voz`, "dependencia");
      const fuente = voz.alineacion_proveedor?.length ? "proveedor" : trans.id;
      return { escena: e.id, voz, huella: huella("alineacion", VERSION, voz.archivo_huella, voz.tokens, fuente, trans.modelo) };
    }),
  );
}

export const pasoAlineacion: Paso = {
  nombre: "alineacion",
  titulo: "Alineación",
  depende: ["voz"],
  revision: false,
  huella: async (ctx) => huella("alineacion", VERSION, (await unidades(ctx)).map((u) => [u.escena, u.huella])),
  salidas: () => [],
  async estimar(ctx) {
    const us = await unidades(ctx);
    const trans = ctx.proveedores.transcripcion();
    let costo = 0;
    let pendientes = 0;
    for (const u of us) {
      const previa = await leerJsonSiExiste<{ huella?: string }>(rutaAlineacion(ctx, u.escena));
      if (previa?.huella === u.huella) continue;
      pendientes++;
      if (!u.voz.alineacion_proveedor?.length) costo += trans.estimarCosto(u.voz.duracion_ms / 1000);
    }
    return { costo_usd: costo, unidades: us.length, pendientes };
  },
  async ejecutar(ctx) {
    const us = await unidades(ctx);
    const trans = ctx.proveedores.transcripcion();
    let costo = 0;
    const fuentes: Record<string, number> = {};
    const lote = await enParalelo(us, 4, async (u) => {
      const ruta = rutaAlineacion(ctx, u.escena);
      const previa = await leerJsonSiExiste<{ huella?: string; fuente?: string }>(ruta);
      if (previa?.huella === u.huella && !ctx.forzar.has(u.escena)) {
        fuentes[previa.fuente ?? "?"] = (fuentes[previa.fuente ?? "?"] ?? 0) + 1;
        return;
      }
      const resultado = await alinear(ctx, u.voz, trans);
      costo += resultado.costo;
      if (resultado.costo || resultado.fuente === "transcripcion") {
        await registrarCosto(ctx, { paso: "alineacion", escena: u.escena, proveedor: trans.id, modelo: trans.modelo, costo_usd: resultado.costo, cache: false });
      }
      fuentes[resultado.fuente] = (fuentes[resultado.fuente] ?? 0) + 1;
      await escribirJson(ruta, { ...resultado.alineacion, huella: u.huella });
    });
    if (lote.fallidos.length) {
      throw new ErrorGuion2Video(`Falló la alineación de ${lote.fallidos.length} escena(s):\n${lote.fallidos.map((f) => `  • ${f.item.escena}: ${(f.error as Error).message}`).join("\n")}`, "proveedor");
    }
    return { costo_usd: costo, resumen: `${us.length} escenas alineadas (${Object.entries(fuentes).map(([k, v]) => `${v} ${k}`).join(", ")})`, avisos: [] };
  },
};

async function alinear(ctx: ContextoPaso, voz: MetaVoz, trans: ReturnType<ContextoPaso["proveedores"]["transcripcion"]>) {
  const habladas = palabras(voz.texto_hablado);
  let obtenidas: PalabraAlineada[];
  let fuente: Alineacion["fuente"];
  let costo = 0;
  if (voz.alineacion_proveedor?.length) {
    obtenidas = voz.alineacion_proveedor;
    fuente = "proveedor";
  } else {
    const r = await trans.transcribir({ archivo: ctx.espacio.ruta(voz.archivo), idioma: ctx.estilo.estilo.idioma, texto: voz.texto_hablado });
    obtenidas = r.palabras;
    costo = r.costoUsd;
    fuente = trans.id === "openai-whisper" ? "transcripcion" : "estimada";
  }
  const tiempos = alinearSecuencias(habladas, obtenidas, voz.duracion_ms);
  const alineacion: Alineacion = {
    escena: voz.escena,
    fuente,
    duracion_ms: voz.duracion_ms,
    palabras: aPalabrasEscritas(voz.tokens, tiempos),
  };
  return { alineacion, fuente, costo };
}
