import { copyFile } from "node:fs/promises";
import { extname } from "node:path";
import {
  asegurarCarpeta,
  ErrorGuion2Video,
  escribirJson,
  existe,
  huella,
  huellaArchivo,
  leerJson,
  leerJsonSiExiste,
} from "@guion2video/nucleo";
import { duracionMs } from "@guion2video/proveedores";
import { FRAMES_TRANSICION, type BloqueSubtitulo, type ItemAudio, type ItemSuperposicion, type ItemVideo, type Timeline } from "@guion2video/render";
import type { ContextoPaso } from "./contexto.ts";
import type { Paso } from "./paso.ts";
import { leerEscenas } from "./escenas.ts";
import { leerMetaVoz } from "./voz.ts";
import { leerAlineacion } from "./alineacion.ts";
import { leerMetaImagen } from "./imagenes.ts";
import type { ArchivoEfectos, ArchivoMusica } from "./audio-ambiente.ts";
import { construirBloques } from "./subtitulos.ts";
import { compilarAnimacion, leerSuperposiciones } from "./superposiciones.ts";
import { DURACION_SEPARADOR_MS, estiloVisual, pausaTrasMs } from "./tiempos.ts";
import { mezclar, type EntradaMezcla } from "./mezcla.ts";
import { clicsLlamado, llamadoVigente, rutaVozLlamado, estadoLlamado } from "./llamado.ts";
import { leerGuion } from "./guion.ts";

const VERSION = 3;
/** Silencio antes de que empiece a hablar el llamado y después de que termina, para que respire. */
const LLAMADO_ANTES_MS = 600;
const LLAMADO_DESPUES_MS = 900;
const MAX_EFECTO_MS = 8000;
export const LUFS_FINAL = -14;

/** Copia un recurso del estilo al proyecto. `medir: false` para imágenes (el logo no tiene duración). */
async function recurso(ctx: ContextoPaso, ruta: string | undefined, nombre: string, medir = true) {
  if (!ruta) return undefined;
  const origen = ctx.estilo.resolver(ruta);
  if (!(await existe(origen))) {
    ctx.log.aviso(`No encuentro ${origen} (${nombre}); se omite`);
    return undefined;
  }
  const destino = `recursos/${nombre}${extname(origen)}`;
  await asegurarCarpeta(ctx.espacio.ruta("recursos"));
  await copyFile(origen, ctx.espacio.ruta(destino));
  return { src: destino, duracion_ms: medir ? await duracionMs(origen) : 0 };
}

async function entradas(ctx: ContextoPaso) {
  const archivo = await leerEscenas(ctx);
  const voces = Object.fromEntries(await Promise.all(archivo.escenas.map(async (e) => [e.id, await leerMetaVoz(ctx, e.id)] as const)));
  const alineaciones = Object.fromEntries(await Promise.all(archivo.escenas.map(async (e) => [e.id, await leerAlineacion(ctx, e.id)] as const)));
  const imagenes = Object.fromEntries(
    await Promise.all(archivo.escenas.flatMap((e) => e.imagenes.map(async (i) => [i.id, await leerMetaImagen(ctx, i.id)] as const))),
  );
  const musica = await leerJsonSiExiste<ArchivoMusica>(ctx.espacio.ruta("ambiente", "musica.json"));
  const efectos = await leerJsonSiExiste<ArchivoEfectos>(ctx.espacio.ruta("ambiente", "efectos.json"));
  const superposiciones = await leerSuperposiciones(ctx);
  const llamado = await llamadoVigente(ctx.estilo, ctx.proveedores);
  return { archivo, voces, alineaciones, imagenes, musica, efectos, superposiciones, llamado };
}

export const pasoComposicion: Paso = {
  nombre: "composicion",
  titulo: "Composición",
  depende: ["alineacion", "imagenes", "superposiciones", "audio_ambiente"],
  revision: false,
  async huella(ctx) {
    const x = await entradas(ctx);
    const e = ctx.estilo.estilo;
    return huella(
      "composicion",
      VERSION,
      FRAMES_TRANSICION,
      await huellaArchivo(ctx.espacio.rutas.escenas),
      Object.values(x.voces).map((v) => v?.archivo_huella ?? null),
      Object.values(x.alineaciones).map((a) => (a as { huella?: string } | undefined)?.huella ?? null),
      Object.values(x.imagenes).map((i) => i?.archivo_huella ?? null),
      x.musica,
      x.efectos,
      x.superposiciones ?? null,
      e.formato,
      e.voz.pausa_escena_s,
      e.voz.pausa_parte_s,
      e.subtitulos,
      e.colores,
      e.tipografia,
      e.marca,
      e.musica,
      e.intro_outro,
      e.llamado,
      x.llamado?.huella ?? null,
    );
  },
  salidas: (ctx) => [ctx.espacio.rutas.timeline, ctx.espacio.ruta("audio", "mezcla.wav")],
  estimar: async () => ({ costo_usd: 0, unidades: 1, pendientes: 1, detalle: "local (ffmpeg)" }),
  async ejecutar(ctx) {
    const x = await entradas(ctx);
    const estilo = ctx.estilo.estilo;
    const fps = estilo.formato.fps;
    const aFrame = (ms: number) => Math.round((ms * fps) / 1000);
    const escenas = x.archivo.escenas;
    const avisos: string[] = [];

    const video: ItemVideo[] = [];
    const voz: ItemAudio[] = [];
    const efectos: ItemAudio[] = [];
    const subtitulos: BloqueSubtitulo[] = [];
    const superposiciones: ItemSuperposicion[] = [];
    const partes: Timeline["partes"] = [];
    const tramosPartes = new Map<string, { desde: number; hasta: number }>();
    const voces: EntradaMezcla[] = [];
    const efectosMezcla: EntradaMezcla[] = [];
    const extras: EntradaMezcla[] = [];
    let cursor = 0;

    const logo = await recurso(ctx, estilo.marca.logo, "logo", false);
    const intro = await recurso(ctx, estilo.intro_outro.intro, "intro");
    if (intro) {
      video.push({ id: "intro", escena: "intro", desde: 0, duracion: aFrame(intro.duracion_ms), tipo: "video", src: intro.src, transicion: "corte" });
      extras.push({ src: ctx.espacio.ruta(intro.src), desde_ms: 0 });
      partes.push({ titulo: "Intro", desde: 0 });
      cursor = intro.duracion_ms;
    }

    let cambiosDeParte = 0;
    let llamadoInsertado = false;
    for (let i = 0; i < escenas.length; i++) {
      const e = escenas[i];
      if (i > 0 && e.parte !== escenas[i - 1].parte) {
        cambiosDeParte++;
        // Llamado a suscribirse: al terminar la parte N, antes del separador de la siguiente.
        if (x.llamado && !llamadoInsertado && cambiosDeParte === estilo.llamado.despues_de_parte) {
          llamadoInsertado = true;
          const lm = x.llamado;
          const vozLlamado = await recurso(ctx, rutaVozLlamado(ctx.estilo), "llamado");
          const inicio = cursor;
          const fin = inicio + LLAMADO_ANTES_MS + lm.duracion_ms + LLAMADO_DESPUES_MS;
          const guion = await leerGuion(ctx).catch(() => undefined);
          video.push({
            id: "llamado",
            escena: "llamado",
            desde: aFrame(inicio),
            duracion: aFrame(fin) - aFrame(inicio),
            tipo: "llamado",
            transicion: "fundido",
            props: {
              canal: estilo.llamado.canal ?? estilo.marca.texto ?? estilo.nombre,
              titulo: ctx.proyecto.titulo ?? guion?.titulo,
              logo: logo?.src,
              suscriptores: estilo.llamado.suscriptores,
              clics: clicsLlamado(lm.palabras, fps, LLAMADO_ANTES_MS),
            },
          });
          if (vozLlamado) {
            voz.push({ desde: aFrame(inicio + LLAMADO_ANTES_MS), duracion: aFrame(lm.duracion_ms), src: vozLlamado.src, etiqueta: "llamado" });
            voces.push({ src: ctx.espacio.ruta(vozLlamado.src), desde_ms: inicio + LLAMADO_ANTES_MS, duracion_ms: lm.duracion_ms });
          }
          subtitulos.push(
            ...construirBloques(
              lm.palabras.map((p) => ({ texto: p.palabra, inicio_ms: inicio + LLAMADO_ANTES_MS + p.inicio_ms, fin_ms: inicio + LLAMADO_ANTES_MS + p.fin_ms })),
              { fps, palabrasPorBloque: estilo.subtitulos.palabras_por_bloque },
            ),
          );
          // Cuenta como parte del capítulo anterior: la música de esa parte sigue sonando.
          const previa = tramosPartes.get(escenas[i - 1].parte);
          if (previa) previa.hasta = fin;
          cursor = fin;
        }
      }
      const narrada = !!e.texto_narracion.trim();
      const vozMeta = x.voces[e.id];
      const alineacion = x.alineaciones[e.id];
      if (narrada && (!vozMeta || !alineacion)) throw new ErrorGuion2Video(`Falta la voz o la alineación de ${e.id}`, "dependencia");
      const audioMs = narrada ? alineacion!.duracion_ms : DURACION_SEPARADOR_MS;
      const pausaMs = pausaTrasMs(escenas, i, estilo);
      const inicio = cursor;
      const fin = cursor + audioMs + pausaMs;
      cursor = fin;

      if (!partes.length || partes[partes.length - 1].titulo !== e.parte) partes.push({ titulo: e.parte, desde: aFrame(inicio) });
      const tramo = tramosPartes.get(e.parte) ?? { desde: inicio, hasta: fin };
      tramo.hasta = fin;
      tramosPartes.set(e.parte, tramo);

      // Visual: los frames se calculan desde milisegundos absolutos para no acumular redondeos.
      const desdeF = aFrame(inicio);
      const hastaF = aFrame(fin);
      const transicionBase = e.transicion ?? (e.tipo_visual === "titulo_parte" ? "negro" : "fundido");
      if (e.tipo_visual === "imagen_ia" || e.tipo_visual === "archivo") {
        const n = e.imagenes.length;
        e.imagenes.forEach((img, j) => {
          const meta = x.imagenes[img.id];
          if (!meta) throw new ErrorGuion2Video(`Falta la imagen ${img.id} de ${e.id}`, "dependencia");
          const a = desdeF + Math.round(((hastaF - desdeF) * j) / n);
          const b = desdeF + Math.round(((hastaF - desdeF) * (j + 1)) / n);
          video.push({ id: img.id, escena: e.id, desde: a, duracion: b - a, tipo: e.tipo_visual, src: meta.archivo, huella: meta.archivo_huella, movimiento: img.movimiento, transicion: j === 0 ? transicionBase : "fundido" });
        });
      } else {
        const { tipo: _tipo, ...props } = e.grafico!;
        video.push({ id: e.id, escena: e.id, desde: desdeF, duracion: hastaF - desdeF, tipo: e.tipo_visual, props, transicion: transicionBase });
      }

      if (narrada) {
        const animacion = x.superposiciones?.escenas[e.id];
        if (animacion) {
          const c = compilarAnimacion(animacion.codigo);
          if ("error" in c) avisos.push(`${e.id}: la animación no compila y se omite (${c.error})`);
          else
            superposiciones.push({
              id: `${e.id}-animacion`,
              escena: e.id,
              desde: desdeF,
              duracion: hastaF - desdeF,
              codigo: c.js,
              palabras: alineacion!.palabras.map((p) => ({ texto: p.palabra, desde: aFrame(p.inicio_ms), hasta: aFrame(p.fin_ms) })),
            });
        }
        voz.push({ desde: desdeF, duracion: aFrame(vozMeta!.duracion_ms), src: vozMeta!.archivo, huella: vozMeta!.archivo_huella, etiqueta: e.id });
        voces.push({ src: ctx.espacio.ruta(vozMeta!.archivo), desde_ms: inicio, duracion_ms: vozMeta!.duracion_ms });
        subtitulos.push(
          ...construirBloques(
            alineacion!.palabras.map((p) => ({ texto: p.palabra, inicio_ms: inicio + p.inicio_ms, fin_ms: inicio + p.fin_ms })),
            { fps, palabrasPorBloque: estilo.subtitulos.palabras_por_bloque },
          ),
        );
      }

      for (const ef of x.efectos?.escenas[e.id] ?? []) {
        const pista = x.efectos?.efectos[ef];
        if (!pista) continue;
        const dur = Math.min(fin - inicio, MAX_EFECTO_MS, await duracionMs(ctx.espacio.ruta(pista.archivo)));
        efectos.push({ desde: desdeF, duracion: aFrame(dur), src: pista.archivo, volumen_db: estilo.musica.efectos_volumen_db, etiqueta: ef });
        efectosMezcla.push({ src: ctx.espacio.ruta(pista.archivo), desde_ms: inicio, duracion_ms: dur, volumen_db: estilo.musica.efectos_volumen_db });
      }
    }

    if (estilo.llamado.activo && !llamadoInsertado) {
      const est = await estadoLlamado(ctx.estilo, ctx.proveedores);
      if (est.estado !== "al_dia") avisos.push(`El llamado a suscribirse no está listo (${est.estado === "obsoleto" ? "cambió el texto o la voz" : "falta generarlo"}): pnpm guion2video llamado generar --estilo ${ctx.estilo.estilo.id}`);
      else avisos.push(`El llamado a suscribirse se omitió: el guion necesita al menos ${estilo.llamado.despues_de_parte + 1} partes`);
    }

    const outro = await recurso(ctx, estilo.intro_outro.outro, "outro");
    if (outro) {
      video.push({ id: "outro", escena: "outro", desde: aFrame(cursor), duracion: aFrame(outro.duracion_ms), tipo: "video", src: outro.src, transicion: "fundido" });
      extras.push({ src: ctx.espacio.ruta(outro.src), desde_ms: cursor });
      cursor += outro.duracion_ms;
    }

    // Música: una pista por parte, del inicio al final de la parte.
    const musica: ItemAudio[] = [];
    const musicaMezcla: EntradaMezcla[] = [];
    const titulosPartes = [...new Set(escenas.map((e) => e.parte))];
    titulosPartes.forEach((titulo, i) => {
      const pista = x.musica?.partes[`parte-${String(i + 1).padStart(2, "0")}`];
      const tramo = tramosPartes.get(titulo);
      if (!pista || !tramo) return;
      musica.push({ desde: aFrame(tramo.desde), duracion: aFrame(tramo.hasta - tramo.desde), src: pista.archivo, volumen_db: estilo.musica.volumen_db, etiqueta: pista.etiqueta });
      musicaMezcla.push({ src: ctx.espacio.ruta(pista.archivo), desde_ms: tramo.desde, duracion_ms: tramo.hasta - tramo.desde, volumen_db: estilo.musica.volumen_db });
    });
    if (!musica.length) avisos.push("El video no tiene música de fondo");

    // Mezcla final: solo se rehace si cambió alguna entrada.
    const rutaMezcla = ctx.espacio.ruta("audio", "mezcla.wav");
    const metaMezclaRuta = ctx.espacio.ruta("audio", "mezcla.meta.json");
    const huellaMezcla = huella("mezcla", VERSION, cursor, voces, musicaMezcla, efectosMezcla, extras, estilo.musica.ducking_db, LUFS_FINAL);
    const metaMezcla = await leerJsonSiExiste<{ huella: string }>(metaMezclaRuta);
    if (metaMezcla?.huella !== huellaMezcla || !(await existe(rutaMezcla))) {
      ctx.log.info(`Mezclando audio (${voces.length} voces, ${musicaMezcla.length} pistas de música, ${efectosMezcla.length} efectos)…`);
      await mezclar({ salida: rutaMezcla, duracionMs: Math.round(cursor), voces, musica: musicaMezcla, efectos: efectosMezcla, extras, duckingDb: estilo.musica.ducking_db, lufs: LUFS_FINAL });
      await escribirJson(metaMezclaRuta, { huella: huellaMezcla, fecha: new Date().toISOString() });
    }

    const timeline: Timeline = {
      version: 1,
      titulo: ctx.proyecto.titulo ?? ctx.proyecto.slug,
      fps,
      ancho: estilo.formato.ancho,
      alto: estilo.formato.alto,
      duracion_frames: aFrame(cursor),
      estilo: { ...estiloVisual(estilo), marca: { texto: estilo.marca.texto, logo: logo?.src } },
      pistas: { video, voz, musica, efectos, superposiciones, mezcla: { desde: 0, src: "audio/mezcla.wav", huella: (await huellaArchivo(rutaMezcla)).slice(0, 12) }, subtitulos },
      partes,
    };
    await escribirJson(ctx.espacio.rutas.timeline, timeline);
    const minutos = cursor / 60000;
    return {
      costo_usd: 0,
      resumen: `timeline de ${minutos.toFixed(1)} min${llamadoInsertado ? " (con llamado a suscribirse)" : ""}: ${video.length} elementos visuales, ${superposiciones.length} animaciones, ${subtitulos.length} bloques de subtítulos`,
      avisos,
    };
  },
};

export const leerTimeline = (ctx: ContextoPaso) => leerJson<Timeline>(ctx.espacio.rutas.timeline);
