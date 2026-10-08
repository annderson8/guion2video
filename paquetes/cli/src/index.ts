#!/usr/bin/env tsx
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  cargarConfig,
  cargarEnv,
  EspacioProyecto,
  ErrorGuion2Video,
  listarProyectos,
  NOMBRES_PASOS,
  NombrePaso,
  usd,
  type Config,
} from "@guion2video/nucleo";
import { probarClaves } from "@guion2video/proveedores";
import {
  aprobar,
  compararProveedoresImagen,
  crearContexto,
  editarPromptImagen,
  ejecutarHasta,
  estadoProyecto,
  estimarProyecto,
  leerGuion,
  regenerar,
  renderizarPreview,
  subirImagenPropia,
  validarProyecto,
  type ContextoPaso,
  type Estado,
  type ResultadoEjecucion,
} from "@guion2video/pasos";

const c = {
  gris: (s: string) => `\x1b[90m${s}\x1b[0m`,
  verde: (s: string) => `\x1b[32m${s}\x1b[0m`,
  amarillo: (s: string) => `\x1b[33m${s}\x1b[0m`,
  rojo: (s: string) => `\x1b[31m${s}\x1b[0m`,
  azul: (s: string) => `\x1b[36m${s}\x1b[0m`,
  negrita: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

const AYUDA = `${c.negrita("guion2video")} — guion → video documental narrado

Uso: pnpm guion2video <comando> [proyecto] [opciones]

  nuevo --estilo <id> --guion <archivo.md> --slug <slug> [--titulo "…"] [--presupuesto 15]
  proyectos                              lista los proyectos
  estado <slug>                          qué pasos están al día, obsoletos, por revisar o con error
  estimar <slug> [--hasta <paso>]        costo estimado de lo que falta (lo que está en caché no cuenta)
  ejecutar <slug> --hasta <paso> [--si]  ejecuta hasta ese paso y se detiene en cada revisión
  aprobar <slug> --paso <paso> [--escena id] [--imagen id]
  regenerar <slug> --paso <paso> --escena <id>[,<id>…] | --imagen <id>
  editar-prompt <slug> --imagen <id> --prompt "…" [--calidad premium]
  subir-imagen <slug> --imagen <id> --archivo <ruta> [--fuente "…"]
  validar <slug>                         revisiones automáticas antes del render
  preview <slug>                         render rápido a 540p
  render <slug> [--forzar]               render final 1080p (+ SRT y miniatura)
  publicar <slug>                        descripción, capítulos, títulos y miniaturas
  fuentes <slug>                         muestra las fuentes del guion
  costos <slug>                          gasto real por paso y proveedor
  comparar-imagenes <slug> [--n 10] [--proveedores a,b,c]   Fase 0: mismas escenas con varios modelos
  probar-claves                          verifica las claves de API sin gastar
  demo [--salida demo.mp4]               renderiza la demo de componentes (30 s)

Pasos: ${NOMBRES_PASOS.join(" → ")}
Opciones globales: --simular (no llama APIs de pago), --verbose, --si (acepta pasarse del presupuesto)`;

const ICONOS: Record<Estado, string> = {
  al_dia: c.verde("● al día"),
  revision: c.amarillo("◐ por revisar"),
  obsoleto: c.amarillo("○ obsoleto"),
  pendiente: c.gris("○ pendiente"),
  error: c.rojo("✗ error"),
  bloqueado: c.gris("· bloqueado"),
};

const lista = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []).flatMap((x) => x.split(",")).map((x) => x.trim()).filter(Boolean);

function exigir<T>(v: T | undefined, msg: string): T {
  if (v === undefined || v === "") throw new ErrorGuion2Video(msg, "validacion");
  return v;
}

function nombrePaso(v: string | undefined): NombrePaso {
  const r = NombrePaso.safeParse(v);
  if (!r.success) throw new ErrorGuion2Video(`Indica --paso: ${NOMBRES_PASOS.join(", ")}`, "validacion");
  return r.data;
}

function confirmador(si: boolean) {
  return async (mensaje: string) => {
    if (si) return true;
    if (!process.stdin.isTTY) return false;
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const r = await rl.question(`${c.amarillo("?")} ${mensaje} [s/N] `);
    rl.close();
    return /^s(i|í)?$/i.test(r.trim());
  };
}

function mostrarResultado(r: ResultadoEjecucion) {
  if (!r.ejecutados.length && !r.detenido) console.log(c.verde("Todo al día. No hubo nada que ejecutar (costo $0)."));
  if (r.costo_usd) console.log(c.gris(`Costo de esta ejecución: ${usd(r.costo_usd)}`));
  if (r.detenido) {
    const color = r.detenido.motivo === "revision" ? c.amarillo : c.rojo;
    console.log(`\n${color(r.detenido.motivo === "revision" ? "⏸  Revisión humana" : r.detenido.motivo === "presupuesto" ? "⛔ Presupuesto" : "✗ Error")} ${r.detenido.mensaje}`);
    if (r.detenido.motivo !== "revision") process.exitCode = 1;
  }
}

async function mostrarEstado(ctx: ContextoPaso) {
  const estados = await estadoProyecto(ctx);
  const total = await ctx.costos.total();
  console.log(`${c.negrita(ctx.proyecto.titulo ?? ctx.proyecto.slug)} ${c.gris(`(${ctx.proyecto.slug}, estilo ${ctx.proyecto.estilo})`)}\n`);
  for (const e of estados) {
    const extra = e.estado === "error" ? c.rojo(e.error?.split("\n")[0] ?? "") : e.motivo ? c.gris(e.motivo) : e.resumen ? c.gris(e.resumen) : "";
    console.log(`  ${e.titulo.padEnd(18)} ${ICONOS[e.estado].padEnd(24)} ${extra}`);
  }
  console.log(`\n  Gastado: ${c.negrita(usd(total))} de ${usd(ctx.proyecto.presupuesto_usd ?? ctx.config.presupuestoMaxUsd)}`);
}

async function principal() {
  cargarEnv();
  const { values: v, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      estilo: { type: "string" },
      guion: { type: "string" },
      slug: { type: "string" },
      titulo: { type: "string" },
      presupuesto: { type: "string" },
      hasta: { type: "string" },
      paso: { type: "string" },
      escena: { type: "string", multiple: true },
      imagen: { type: "string", multiple: true },
      prompt: { type: "string" },
      calidad: { type: "string" },
      archivo: { type: "string" },
      fuente: { type: "string" },
      salida: { type: "string" },
      n: { type: "string" },
      proveedores: { type: "string" },
      si: { type: "boolean", default: false },
      forzar: { type: "boolean", default: false },
      simular: { type: "boolean", default: false },
      verbose: { type: "boolean", short: "v", default: false },
      ayuda: { type: "boolean", short: "h", default: false },
    },
  });
  if (v.simular) process.env.GUION2VIDEO_SIMULAR = "1";
  const [comando, slugPos] = positionals;
  if (!comando || v.ayuda || comando === "ayuda") {
    console.log(AYUDA);
    return;
  }
  const config: Config = cargarConfig();
  if (config.simular) console.log(c.gris("(modo simulado: no se llama a ninguna API de pago)"));
  const slug = () => exigir(slugPos ?? v.slug, "Indica el proyecto: pnpm guion2video <comando> <slug>");
  const contexto = async () => {
    const ctx = await crearContexto(slug(), { config, bitacora: { verbose: v.verbose } });
    ctx.forzarSobrescritura = v.forzar;
    if (v.forzar) ctx.forzar.add("render");
    return ctx;
  };
  const confirmar = confirmador(v.si);

  switch (comando) {
    case "nuevo": {
      const espacio = await EspacioProyecto.crear(config, {
        slug: exigir(v.slug ?? slugPos, "Falta --slug"),
        estilo: exigir(v.estilo, "Falta --estilo"),
        guion: exigir(v.guion, "Falta --guion"),
        titulo: v.titulo,
        presupuestoUsd: v.presupuesto ? Number(v.presupuesto) : undefined,
      });
      console.log(c.verde(`✓ Proyecto creado en ${espacio.dir}`));
      console.log(c.gris(`  Siguiente: pnpm guion2video estimar ${espacio.slug}   ·   pnpm guion2video ejecutar ${espacio.slug} --hasta escenas`));
      return;
    }
    case "proyectos": {
      const slugs = await listarProyectos(config);
      if (!slugs.length) console.log(c.gris(`No hay proyectos en ${config.proyectos}`));
      for (const s of slugs) {
        const ctx = await crearContexto(s, { config, bitacora: { consola: false } });
        const estados = await estadoProyecto(ctx);
        const sig = estados.find((e) => e.estado !== "al_dia");
        console.log(`  ${s.padEnd(28)} ${usd(await ctx.costos.total()).padStart(8)}  ${sig ? `${sig.titulo}: ${ICONOS[sig.estado]}` : c.verde("terminado")}`);
      }
      return;
    }
    case "estado":
      return mostrarEstado(await contexto());
    case "estimar": {
      const ctx = await contexto();
      const e = await estimarProyecto(ctx, { hasta: v.hasta ? nombrePaso(v.hasta) : undefined });
      console.log(c.negrita("Costo estimado de lo que falta\n"));
      for (const p of e.pasos) {
        const unidades = p.unidades ? c.gris(`${p.pendientes}/${p.unidades} por generar`) : "";
        console.log(`  ${p.titulo.padEnd(18)} ${usd(p.costo_usd).padStart(8)}  ${unidades} ${c.gris(p.detalle ?? "")}`);
      }
      const color = e.acumulado + e.total > e.presupuesto ? c.rojo : c.verde;
      console.log(`\n  Estimado: ${c.negrita(usd(e.total))} · Gastado: ${usd(e.acumulado)} · ${color(`Total previsto ${usd(e.acumulado + e.total)} de ${usd(e.presupuesto)}`)}`);
      return;
    }
    case "ejecutar": {
      const ctx = await contexto();
      const hasta = v.hasta ? nombrePaso(v.hasta) : "composicion";
      mostrarResultado(await ejecutarHasta(ctx, hasta, { confirmar }));
      return;
    }
    case "aprobar": {
      const ctx = await contexto();
      const unidades = [...lista(v.escena), ...lista(v.imagen)];
      console.log(c.verde(`✓ ${await aprobar(ctx, nombrePaso(v.paso), { unidades, por: process.env.USER })}`));
      return;
    }
    case "regenerar": {
      const ctx = await contexto();
      const unidades = [...lista(v.escena), ...lista(v.imagen)];
      if (!unidades.length) throw new ErrorGuion2Video("Indica qué regenerar: --escena escena-014 o --imagen escena-014-a", "validacion");
      const r = await regenerar(ctx, nombrePaso(v.paso), unidades, { confirmar });
      console.log(c.verde(`✓ ${r.resumen}`));
      return;
    }
    case "editar-prompt": {
      const ctx = await contexto();
      const imagen = exigir(lista(v.imagen)[0], "Falta --imagen");
      const img = await editarPromptImagen(ctx, imagen, { prompt: v.prompt, calidad: v.calidad as "estandar" | "premium" | undefined });
      console.log(c.verde(`✓ ${imagen}: ${img.prompt}`));
      console.log(c.gris(`  Para generarla: pnpm guion2video ejecutar ${ctx.proyecto.slug} --hasta imagenes`));
      return;
    }
    case "subir-imagen": {
      const ctx = await contexto();
      const imagen = exigir(lista(v.imagen)[0], "Falta --imagen");
      const datos = await readFile(resolve(exigir(v.archivo, "Falta --archivo")));
      const meta = await subirImagenPropia(ctx, imagen, datos, { fuente: v.fuente });
      console.log(c.verde(`✓ ${imagen} reemplazada por tu imagen (${meta.ancho_original}×${meta.alto_original}) y aprobada`));
      return;
    }
    case "validar": {
      const ctx = await contexto();
      const r = await validarProyecto(ctx);
      for (const e of r.errores) console.log(`${c.rojo("✗")} ${e}`);
      for (const a of r.avisos) console.log(`${c.amarillo("!")} ${a}`);
      if (!r.errores.length && !r.avisos.length) console.log(c.verde("✓ Todo en orden"));
      console.log(c.gris(JSON.stringify(r.datos)));
      if (r.errores.length) process.exitCode = 1;
      return;
    }
    case "preview": {
      const ctx = await contexto();
      const r = await ejecutarHasta(ctx, "composicion", { confirmar });
      if (r.detenido) return mostrarResultado(r);
      await renderizarPreview(ctx);
      return;
    }
    case "render": {
      const ctx = await contexto();
      return mostrarResultado(await ejecutarHasta(ctx, "render", { confirmar, reejecutar: v.forzar ? ["render"] : undefined }));
    }
    case "publicar": {
      const ctx = await contexto();
      const g = await leerGuion(ctx);
      console.log(c.negrita("Fuentes del guion (revísalas antes de publicar):"));
      for (const f of g.fuentes) console.log(`  • ${f}`);
      if (!g.fuentes.length) console.log(c.rojo("  (ninguna)"));
      console.log();
      return mostrarResultado(await ejecutarHasta(ctx, "publicacion", { confirmar }));
    }
    case "fuentes": {
      const g = await leerGuion(await contexto());
      for (const f of g.fuentes) console.log(`• ${f}`);
      if (!g.fuentes.length) console.log(c.rojo("El guion no tiene fuentes"));
      return;
    }
    case "costos": {
      const ctx = await contexto();
      const r = await ctx.costos.resumen();
      console.log(c.negrita("Gasto real por paso\n"));
      for (const [paso, x] of Object.entries(r.porPaso)) console.log(`  ${paso.padEnd(16)} ${usd(x.costo_usd).padStart(8)}  ${c.gris(`${x.llamadas} llamadas, ${x.cache} desde caché`)}`);
      console.log(c.negrita("\nPor proveedor\n"));
      for (const [p, x] of Object.entries(r.porProveedor)) console.log(`  ${p.padEnd(24)} ${usd(x).padStart(8)}`);
      console.log(`\n  Total: ${c.negrita(usd(r.total))}`);
      return;
    }
    case "comparar-imagenes": {
      const ctx = await contexto();
      const proveedores = lista(v.proveedores ?? "google-nano-banana-2,openai-gpt-image-2,fal-seedream");
      const n = Number(v.n ?? 10);
      const tarifas = ctx.proveedores.costos;
      const estimado = proveedores.reduce((s, p) => s + n * tarifas.imagen(ctx.proveedores.simular ? "simulado" : p, "estandar"), 0);
      if (!(await confirmar(`Generar ${n} imágenes con ${proveedores.length} proveedores cuesta ≈${usd(estimado)}. ¿Continuar?`))) return;
      const r = await compararProveedoresImagen(ctx, { n, proveedores });
      for (const [p, t] of Object.entries(r.total)) console.log(`  ${p.padEnd(24)} ${usd(t)}`);
      console.log(c.verde(`✓ Abre ${r.archivo}`));
      return;
    }
    case "probar-claves": {
      for (const r of await probarClaves(config)) {
        const icono = !r.presente ? c.gris("○") : r.ok ? c.verde("✓") : c.rojo("✗");
        console.log(`  ${icono} ${r.clave.padEnd(20)} ${c.gris(r.detalle)}`);
      }
      return;
    }
    case "demo": {
      const { renderizarDemo } = await import("@guion2video/render/renderizar");
      const salida = resolve(v.salida ?? "demo.mp4");
      await renderizarDemo(salida, { escala: 1 });
      console.log(c.verde(`✓ Demo renderizada: ${salida}`));
      return;
    }
    default:
      console.log(`Comando desconocido "${comando}".\n\n${AYUDA}`);
      process.exitCode = 1;
  }
}

principal().catch((e) => {
  if (process.stdout.isTTY) process.stdout.write("\n");
  console.error(c.rojo(`✗ ${e instanceof Error ? e.message : String(e)}`));
  if (process.env.GUION2VIDEO_DEBUG && e instanceof Error) console.error(e.stack);
  process.exitCode = 1;
});
