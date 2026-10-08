import { rename } from "node:fs/promises";
import { ErrorGuion2Video, escribirArchivo, huella, huellaArchivo } from "@guion2video/nucleo";
import { huellaFuentes, renderizarMiniatura, renderizarVideo } from "@guion2video/render/renderizar";
import type { ContextoPaso } from "./contexto.ts";
import type { Paso } from "./paso.ts";
import { leerTimeline } from "./composicion.ts";
import { bloquesASrt } from "./subtitulos.ts";
import { validarProyecto } from "./validaciones.ts";

const VERSION = 1;

async function renderizar(ctx: ContextoPaso, calidad: "preview" | "final", salida: string) {
  const timeline = await leerTimeline(ctx);
  const tmp = `${salida}.parcial.mp4`;
  let ultimo = -1;
  const inicio = Date.now();
  await renderizarVideo({
    timeline,
    dirProyecto: ctx.espacio.dir,
    salida: tmp,
    calidad,
    alProgreso: (p, etapa) => {
      const pct = Math.floor(p * 100);
      if (pct !== ultimo) {
        ultimo = pct;
        ctx.log.progreso(`render ${calidad}`, pct, 100, etapa);
      }
    },
  });
  await rename(tmp, salida);
  return { timeline, segundos: (Date.now() - inicio) / 1000 };
}

/** Vista previa a 540p: para revisar ritmo y sincronía sin esperar el render final. */
export async function renderizarPreview(ctx: ContextoPaso): Promise<string> {
  const salida = ctx.espacio.ruta("salida", "preview.mp4");
  const r = await renderizar(ctx, "preview", salida);
  ctx.log.info(`Vista previa lista en ${r.segundos.toFixed(0)} s: ${salida}`);
  return salida;
}

/** Imagen clave para miniaturas: la primera imagen aprobada del video si no se indica otra. */
export function primeraImagen(timeline: Awaited<ReturnType<typeof leerTimeline>>, excluir: string[] = []): string | undefined {
  return timeline.pistas.video.find((v) => (v.tipo === "imagen_ia" || v.tipo === "archivo") && v.src && !excluir.includes(v.id))?.src;
}

export const pasoRender: Paso = {
  nombre: "render",
  titulo: "Render final",
  depende: ["composicion"],
  revision: true,
  huella: async (ctx) => huella("render", VERSION, await huellaArchivo(ctx.espacio.rutas.timeline), await huellaFuentes()),
  salidas: (ctx) => [ctx.espacio.ruta("salida", "video.mp4"), ctx.espacio.ruta("salida", "subtitulos.srt")],
  estimar: async () => ({ costo_usd: 0, unidades: 1, pendientes: 1, detalle: "render local con Remotion" }),
  async ejecutar(ctx) {
    const v = await validarProyecto(ctx);
    if (v.errores.length && !ctx.forzar.has("render")) {
      throw new ErrorGuion2Video(`El render final se detuvo por:\n${v.errores.map((e) => `  • ${e}`).join("\n")}\n(Corrige o usa --forzar para renderizar igual)`, "validacion");
    }
    const salida = ctx.espacio.ruta("salida", "video.mp4");
    const r = await renderizar(ctx, "final", salida);
    await escribirArchivo(ctx.espacio.ruta("salida", "subtitulos.srt"), bloquesASrt(r.timeline.pistas.subtitulos, r.timeline.fps));
    const miniatura = ctx.espacio.ruta("salida", "miniatura.png");
    await renderizarMiniatura({ props: { titulo: r.timeline.titulo, src: primeraImagen(r.timeline), estilo: r.timeline.estilo, variante: 0 }, dirProyecto: ctx.espacio.dir, salida: miniatura });
    return {
      costo_usd: 0,
      resumen: `video.mp4 (${(r.timeline.duracion_frames / r.timeline.fps / 60).toFixed(1)} min) renderizado en ${(r.segundos / 60).toFixed(1)} min + subtitulos.srt + miniatura.png`,
      avisos: v.avisos,
    };
  },
};
