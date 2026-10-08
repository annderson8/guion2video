import { existe, escribirJson, normalizarPalabra, TIPOS_GRAFICOS } from "@guion2video/nucleo";
import { detectarSilencios, medirAudio } from "@guion2video/proveedores";
import type { ContextoPaso } from "./contexto.ts";
import { leerEscenas, proporcionGraficos } from "./escenas.ts";
import { estaAprobada, inventarioImagenes } from "./imagenes.ts";
import { leerTimeline } from "./composicion.ts";
import { leerGuion } from "./guion.ts";
import type { Credito } from "./audio-ambiente.ts";
import { leerJsonSiExiste } from "@guion2video/nucleo";

export interface ResultadoValidacion {
  errores: string[];
  avisos: string[];
  datos: Record<string, unknown>;
}

const PALABRAS_REALISTAS = /\b(retrato|foto|fotograf[ií]a|realista|fotorrealista|hiperrealista|rostro|cara de|primer plano del rostro)\b/i;

/** Busca nombres de personas reales junto a palabras que piden un rostro realista. */
export function promptsRiesgosos(prompts: { id: string; prompt: string }[], personas: string[]): string[] {
  const nombres = personas.flatMap((p) => {
    const partes = p.split(/\s+/).filter((x) => x.length > 3);
    return [p, ...(partes.length > 1 ? [partes[partes.length - 1]] : [])];
  });
  return prompts
    .filter(({ prompt }) => {
      const normal = prompt.split(/\s+/).map(normalizarPalabra).join(" ");
      const tieneNombre = nombres.some((n) => normal.includes(n.split(/\s+/).map(normalizarPalabra).join(" ")));
      return tieneNombre && PALABRAS_REALISTAS.test(prompt);
    })
    .map((p) => p.id);
}

/** Revisiones automáticas antes del render final (sección 13 de la especificación). */
export async function validarProyecto(ctx: ContextoPaso, op: { audio?: boolean } = {}): Promise<ResultadoValidacion> {
  const errores: string[] = [];
  const avisos: string[] = [];
  const datos: Record<string, unknown> = {};
  const { escenas, biblia } = await leerEscenas(ctx);
  const estilo = ctx.estilo.estilo;

  // Imágenes
  const inv = await inventarioImagenes(ctx);
  const sinAprobar = inv.filter((x) => !estaAprobada(x.meta)).map((x) => x.id);
  if (sinAprobar.length) errores.push(`${sinAprobar.length} imagen(es) sin aprobar: ${sinAprobar.slice(0, 8).join(", ")}${sinAprobar.length > 8 ? "…" : ""}`);
  const pequenas = inv.filter((x) => x.meta && x.meta.ancho_original > 0 && x.meta.ancho_original < 1280).map((x) => `${x.id} (${x.meta!.ancho_original}px)`);
  if (pequenas.length) avisos.push(`Imágenes con menos de 1280 px de ancho original: ${pequenas.join(", ")}`);

  // Prompts con personas reales
  const prompts = escenas.flatMap((e) => e.imagenes.map((i) => ({ id: i.id, prompt: i.prompt })));
  const riesgo = promptsRiesgosos(prompts, biblia?.personas_reales ?? []);
  if (riesgo.length) errores.push(`Prompts que podrían pedir el rostro realista de una persona real: ${riesgo.join(", ")}`);

  // Ritmo visual
  const pct = proporcionGraficos(escenas);
  datos.porcentaje_graficos = Math.round(pct);
  if (pct < estilo.ritmo.porcentaje_minimo_graficos) avisos.push(`Solo ${pct.toFixed(0)} % de escenas son gráficos animados (mínimo ${estilo.ritmo.porcentaje_minimo_graficos} %)`);

  // Créditos
  const creditos = (await leerJsonSiExiste<Credito[]>(ctx.espacio.ruta("ambiente", "creditos.json"))) ?? [];
  const sinAtribucion = creditos.filter((c) => !c.autor || !c.licencia).map((c) => c.titulo);
  if (sinAtribucion.length) avisos.push(`Falta autor o licencia en: ${sinAtribucion.join(", ")}`);

  // Fuentes del guion
  const guion = await leerGuion(ctx);
  if (!guion.fuentes.length) avisos.push("El guion no tiene fuentes: añade la sección antes de publicar");

  // Timeline: duración, subtítulos, imágenes seguidas
  if (await existe(ctx.espacio.rutas.timeline)) {
    const t = await leerTimeline(ctx);
    const minutos = t.duracion_frames / t.fps / 60;
    datos.duracion_min = Math.round(minutos * 10) / 10;
    if (minutos < 18 || minutos > 28) avisos.push(`Duración total ${minutos.toFixed(1)} min (fuera del rango 18–28 min)`);
    const largos = t.pistas.subtitulos.filter((b) => b.lineas.length > 2).length;
    const cortos = t.pistas.subtitulos.filter((b) => ((b.hasta - b.desde) * 1000) / t.fps < 800).length;
    if (largos) avisos.push(`${largos} subtítulos de más de 2 líneas`);
    if (cortos) avisos.push(`${cortos} subtítulos duran menos de 0,8 s`);
    let racha = 0;
    let peor = 0;
    for (const item of t.pistas.video) {
      if (item.tipo === "imagen_ia" || item.tipo === "archivo") racha++;
      else if (TIPOS_GRAFICOS.includes(item.tipo as never)) racha = 0;
      peor = Math.max(peor, racha);
    }
    if (peor > estilo.ritmo.max_imagenes_seguidas) avisos.push(`Hay ${peor} imágenes seguidas sin un gráfico (máximo ${estilo.ritmo.max_imagenes_seguidas})`);

    const mezcla = ctx.espacio.ruta("audio", "mezcla.wav");
    if (op.audio !== false && (await existe(mezcla))) {
      const m = await medirAudio(mezcla);
      datos.lufs = m.lufsIntegrado;
      datos.pico_dbtp = m.picoVerdaderoDb;
      if (m.picoVerdaderoDb > -1) avisos.push(`Pico de audio de ${m.picoVerdaderoDb.toFixed(1)} dBTP (máximo -1 dBTP)`);
      const silencios = await detectarSilencios(mezcla, 2);
      if (silencios.length) avisos.push(`${silencios.length} silencio(s) de más de 2 s, p. ej. en ${(silencios[0].inicio_ms / 1000).toFixed(1)} s`);
    }
  } else {
    avisos.push("Aún no hay timeline.json (ejecuta composicion)");
  }

  const r = { errores, avisos, datos };
  await escribirJson(ctx.espacio.ruta("salida", "validacion.json"), { ...r, fecha: new Date().toISOString() });
  return r;
}
