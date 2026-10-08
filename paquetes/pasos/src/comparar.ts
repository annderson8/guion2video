import { conReintentos, enParalelo, escribirArchivo, type ImagenEscena } from "@guion2video/nucleo";
import { esReintentable } from "@guion2video/proveedores";
import type { ContextoPaso } from "./contexto.ts";
import { leerEscenas } from "./escenas.ts";
import { componerPrompt, procesarImagen } from "./imagenes.ts";
import { registrarCosto } from "./cache.ts";

const escapar = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Fase 0: genera las mismas N escenas con varios proveedores y arma una hoja comparativa
 * (comparacion/index.html) con costo por imagen para elegir el proveedor principal.
 */
export async function compararProveedoresImagen(ctx: ContextoPaso, op: { n: number; proveedores: string[] }) {
  const { escenas } = await leerEscenas(ctx);
  const imagenes: { escena: string; imagen: ImagenEscena }[] = escenas
    .filter((e) => e.tipo_visual === "imagen_ia")
    .flatMap((e) => e.imagenes.slice(0, 1).map((imagen) => ({ escena: e.id, imagen })))
    .slice(0, op.n);
  const cfg = ctx.estilo.estilo.imagen;
  const salida = ctx.proveedores.config.imagenes;
  const refs = cfg.imagenes_referencia.map(ctx.estilo.resolver);
  const filas: Record<string, Record<string, { archivo?: string; costo: number; ms: number; error?: string }>> = {};
  const total: Record<string, number> = {};
  for (const id of op.proveedores) {
    const prov = ctx.proveedores.imagen(id);
    total[id] = 0;
    ctx.log.info(`Generando ${imagenes.length} imágenes con ${id} (${prov.modelo})…`);
    await enParalelo(imagenes, ctx.config.paraleloImagenes, async ({ escena, imagen }) => {
      const inicio = Date.now();
      (filas[imagen.id] ??= {})[id] = { costo: 0, ms: 0 };
      try {
        const g = await conReintentos(() => prov.generar({ prompt: componerPrompt(imagen, cfg.estilo_prompt), negativo: cfg.negativo, referencias: refs, relacionAspecto: cfg.relacion_aspecto, calidad: imagen.calidad }), { reintentable: esReintentable });
        const p = await procesarImagen(g.imagen, salida.ancho_salida / 2, salida.alto_salida / 2);
        const archivo = `comparacion/${id}/${imagen.id}.jpg`;
        await escribirArchivo(ctx.espacio.ruta(archivo), p.salida);
        filas[imagen.id][id] = { archivo, costo: g.costoUsd, ms: Date.now() - inicio };
        total[id] += g.costoUsd;
        await registrarCosto(ctx, { paso: "fase0", escena, unidad: imagen.id, proveedor: prov.id, modelo: prov.modelo, costo_usd: g.costoUsd, cache: false });
      } catch (e) {
        filas[imagen.id][id] = { costo: 0, ms: Date.now() - inicio, error: (e as Error).message.slice(0, 200) };
      }
    });
  }
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Comparación de proveedores</title>
<style>body{background:#0e1116;color:#f4f1ea;font:14px Inter,system-ui,sans-serif;margin:24px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #262e3a;padding:8px;vertical-align:top}th{background:#151a22}img{width:100%;display:block;border-radius:4px}.p{color:#a7adb8;font-size:12px;max-width:260px}.e{color:#ff8b78}.c{font-family:monospace;color:#e0a526}</style></head><body>
<h1>Fase 0 · comparación de proveedores de imagen</h1>
<p>Mismas ${imagenes.length} escenas, mismo estilo. Califica calidad, consistencia de estilo y costo por imagen útil.</p>
<table><tr><th>Escena / prompt</th>${op.proveedores.map((p) => `<th>${escapar(p)}<br><span class="c">total $${total[p].toFixed(3)} · $${(total[p] / Math.max(1, imagenes.length)).toFixed(3)}/img</span></th>`).join("")}</tr>
${imagenes
  .map(({ imagen }) => `<tr><td class="p"><b>${imagen.id}</b><br>${escapar(imagen.prompt)}</td>${op.proveedores
    .map((p) => {
      const c = filas[imagen.id]?.[p];
      return `<td>${c?.archivo ? `<img src="${escapar(c.archivo.replace("comparacion/", ""))}"><span class="c">$${c.costo.toFixed(3)} · ${(c.ms / 1000).toFixed(1)} s</span>` : `<span class="e">${escapar(c?.error ?? "—")}</span>`}</td>`;
    })
    .join("")}</tr>`)
  .join("\n")}
</table></body></html>`;
  const archivo = ctx.espacio.ruta("comparacion", "index.html");
  await escribirArchivo(archivo, html);
  return { archivo, total };
}
