#!/usr/bin/env tsx
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  cargarConfig,
  cargarEnv,
  cargarEstilo,
  crearBitacora,
  EspacioProyecto,
  ErrorGuion2Video,
  listarProyectos,
  NOMBRES_PASOS,
  NombrePaso,
  usd,
  type Config,
} from "@guion2video/nucleo";
import { crearProveedores, probarClaves } from "@guion2video/proveedores";
import {
  agregarRecorte,
  aprobar,
  borrarVideoFinal,
  conservar,
  compararProveedoresImagen,
  crearContexto,
  editarPromptImagen,
  ejecutarHasta,
  estadoLlamado,
  estadoProyecto,
  estimarLlamado,
  estimarProyecto,
  estadoRecortes,
  generarLlamado,
  leerGuion,
  limpiarCache,
  quitarRecorte,
  regenerar,
  renderizarPreview,
  renderizarRecortes,
  resumenCache,
  resumenVideoFinal,
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
  conservar <slug> --hasta <paso>        usa lo ya generado con la configuración actual (no regenera ni gasta)
  regenerar <slug> --paso <paso> --escena <id>[,<id>…] | --imagen <id>   (composicion y render se rehacen sin unidades)
  editar-prompt <slug> --imagen <id> --prompt "…" [--calidad premium]
  subir-imagen <slug> --imagen <id> --archivo <ruta> [--fuente "…"]
  validar <slug>                         revisiones automáticas antes del render
  preview <slug>                         render rápido a 540p
  render <slug> [--forzar]               render final 1080p (+ SRT y miniatura)
  publicar <slug>                        descripción, capítulos, títulos y miniaturas
  fuentes <slug>                         muestra las fuentes del guion
  limpiar-cache <slug> [--si]            borra la caché del proyecto (libera espacio; regenerar lo ya hecho volvería a costar)
  borrar-video <slug> [--si]             borra video.mp4 y preview.mp4 para liberar espacio (se rehacen con render, $0)
  costos <slug>                          gasto real por paso y proveedor
  comparar-imagenes <slug> [--n 10] [--proveedores a,b,c]   Fase 0: mismas escenas con varios modelos
  recortes <slug> [listar|agregar|quitar|renderizar]   Shorts y Reels 9:16 sacados del video
      agregar --tipo short|reel --desde <seg> --hasta <seg> [--id x] [--titulo "…"] [--enfoque 0-1] [--exacto]
      quitar --id x · renderizar [--id x[,y]] [--forzar]
  llamado [estado|generar] --estilo <id> [--forzar]   voz del «suscríbete y dale me gusta» (una vez por estilo)
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
      tipo: { type: "string" },
      id: { type: "string", multiple: true },
      desde: { type: "string" },
      enfoque: { type: "string" },
      exacto: { type: "boolean", default: false },
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
    case "conservar": {
      const ctx = await contexto();
      const r = await conservar(ctx, nombrePaso(exigir(v.hasta, "Falta --hasta <paso>")));
      for (const p of r.conservados) console.log(c.verde(`✓ ${p.titulo}: se conserva lo ya generado${p.unidades > 1 ? ` (${p.unidades} unidades)` : ""}`));
      if (!r.conservados.length && !r.detenido) console.log(c.gris("Nada obsoleto que conservar."));
      if (r.detenido) console.log(`${c.amarillo("!")} ${r.detenido.mensaje}`);
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
      const paso = nombrePaso(v.paso);
      // Los pasos locales y gratuitos (composición, render, publicación) se rehacen enteros, sin indicar unidades.
      if (!unidades.length && !["composicion", "render"].includes(paso)) throw new ErrorGuion2Video("Indica qué regenerar: --escena escena-014 o --imagen escena-014-a", "validacion");
      const r = await regenerar(ctx, paso, unidades, { confirmar });
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
    case "limpiar-cache": {
      const ctx = await contexto();
      const r = await resumenCache(ctx);
      const mb = (n: number) => `${(n / 1048576).toFixed(1)} MB`;
      if (!r.archivos) return console.log(c.gris("La caché de este proyecto ya está vacía."));
      console.log(`Caché de ${ctx.proyecto.slug}: ${r.archivos} archivos, ${mb(r.bytes)} (se liberarían ${mb(r.liberable_bytes)}; el resto sigue en uso en audio/ e imagenes/).`);
      if (!(await confirmar("Se pierde la posibilidad de reutilizar voz, imágenes y respuestas de Claude sin volver a pagarlas. ¿Borrar la caché?"))) return;
      await limpiarCache(ctx);
      console.log(c.verde(`✓ Caché borrada (${mb(r.liberable_bytes)} liberados)`));
      return;
    }
    case "borrar-video": {
      const ctx = await contexto();
      const r = await resumenVideoFinal(ctx);
      const mb = (n: number) => `${(n / 1048576).toFixed(1)} MB`;
      if (!r.archivos.length) return console.log(c.gris("Este proyecto no tiene videos renderizados que borrar."));
      for (const a of r.archivos) console.log(`  ${a.nombre.padEnd(12)} ${mb(a.bytes).padStart(10)}  ${c.gris(a.descripcion)}`);
      if (!(await confirmar(`Se borran ${mb(r.bytes)}. Si aún no subiste el video, tendrás que renderizarlo de nuevo (tarda). ¿Borrar?`))) return;
      await borrarVideoFinal(ctx);
      console.log(c.verde(`✓ Videos borrados (${mb(r.bytes)} liberados). Para rehacerlo: pnpm guion2video render ${ctx.proyecto.slug}`));
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
    case "recortes": {
      const ctx = await contexto();
      const accion = positionals[2] ?? "listar";
      const segundos = (x: string | undefined, nombre: string) => {
        const n = Number(String(exigir(x, `Falta --${nombre}`)).replace(",", "."));
        if (!Number.isFinite(n)) throw new ErrorGuion2Video(`--${nombre} debe ser un número de segundos`, "validacion");
        return n;
      };
      if (accion === "agregar") {
        const tipo = v.tipo === "short" || v.tipo === "reel" ? v.tipo : undefined;
        const r = await agregarRecorte(ctx, {
          tipo: exigir(tipo, "Indica --tipo short o --tipo reel"),
          desde_s: segundos(v.desde, "desde"),
          hasta_s: segundos(v.hasta, "hasta"),
          id: lista(v.id)[0],
          titulo: v.titulo,
          enfoque: v.enfoque ? Number(v.enfoque) : undefined,
          sinAjuste: v.exacto,
        });
        console.log(c.verde(`✓ ${r.recorte.id}: ${r.recorte.desde_s} → ${r.recorte.hasta_s} s (${r.duracion_s.toFixed(1)} s de contenido + cierre)`));
        if (r.ajustado) console.log(c.gris(`  Ajustado a límite de palabra (usa --exacto para no ajustar)`));
        for (const a of r.avisos) console.log(`${c.amarillo("!")} ${a}`);
        console.log(c.gris(`  Siguiente: pnpm guion2video recortes ${ctx.proyecto.slug} renderizar`));
        return;
      }
      if (accion === "quitar") {
        const id = exigir(lista(v.id)[0], "Falta --id");
        await quitarRecorte(ctx, id);
        console.log(c.verde(`✓ Recorte ${id} quitado (su video en salida/recortes no se borra)`));
        return;
      }
      if (accion === "renderizar") {
        const r = await renderizarRecortes(ctx, { ids: lista(v.id), forzar: v.forzar });
        for (const h of r.hechos) console.log(c.verde(`✓ ${h.id}: ${h.duracion_s.toFixed(0)} s, renderizado en ${h.segundos_render.toFixed(0)} s`));
        if (r.omitidos.length) console.log(c.gris(`  Al día (no se renderizan de nuevo): ${r.omitidos.join(", ")}`));
        for (const e of r.errores) console.log(`${c.rojo("✗")} ${e}`);
        if (!r.hechos.length && !r.omitidos.length && !r.errores.length) console.log(c.gris("No hay recortes. Crea uno con: recortes <slug> agregar --tipo short --desde 10 --hasta 50"));
        if (r.errores.length) process.exitCode = 1;
        return;
      }
      if (accion !== "listar") throw new ErrorGuion2Video(`Acción desconocida "${accion}": usa listar, agregar, quitar o renderizar`, "validacion");
      const info = await estadoRecortes(ctx);
      if (!info.length) console.log(c.gris("Este proyecto no tiene recortes."));
      for (const i of info) {
        const estado = { al_dia: c.verde("● al día"), obsoleto: c.amarillo("○ obsoleto"), pendiente: c.gris("○ sin renderizar") }[i.estado];
        console.log(`  ${i.recorte.id.padEnd(10)} ${i.recorte.tipo.padEnd(5)} ${`${i.recorte.desde_s}–${i.recorte.hasta_s} s`.padEnd(16)} ${i.duracion_s ? `${i.duracion_s.toFixed(0)} s`.padEnd(6) : "".padEnd(6)} ${estado}  ${c.gris(i.recorte.titulo ?? "")}`);
        if (i.desfasado) console.log(`    ${c.amarillo("!")} el video cambió desde que lo definiste: revisa que los segundos sigan apuntando a lo que quieres`);
        for (const e of i.errores) console.log(`    ${c.rojo("✗")} ${e}`);
        for (const a of i.avisos) console.log(`    ${c.amarillo("!")} ${a}`);
      }
      return;
    }
    case "llamado": {
      const estilo = await cargarEstilo(config, exigir(v.estilo, "Falta --estilo <id>"));
      const log = crearBitacora({ verbose: v.verbose });
      const proveedores = await crearProveedores(config, { avisar: log.aviso });
      const accion = slugPos ?? "estado";
      const actual = await estadoLlamado(estilo, proveedores);
      if (accion === "estado") {
        const textos = { desactivado: c.gris("desactivado en el estilo"), sin_generar: c.amarillo("sin generar"), obsoleto: c.amarillo("obsoleto (cambió el texto o la voz)"), al_dia: c.verde("al día") };
        console.log(`Llamado a suscribirse de «${estilo.estilo.nombre}»: ${textos[actual.estado]}`);
        console.log(c.gris(`  Texto: ${estilo.estilo.llamado.texto}`));
        if (actual.meta) console.log(c.gris(`  Voz: ${(actual.meta.duracion_ms / 1000).toFixed(1)} s con ${actual.meta.proveedor}`));
        if (actual.estado === "sin_generar" || actual.estado === "obsoleto") console.log(c.gris(`  Genéralo con: pnpm guion2video llamado generar --estilo ${estilo.estilo.id}`));
        return;
      }
      if (accion !== "generar") throw new ErrorGuion2Video(`Acción desconocida "${accion}": usa estado o generar`, "validacion");
      if (!estilo.estilo.llamado.activo) throw new ErrorGuion2Video("El llamado está desactivado en este estilo (llamado.activo)", "validacion");
      if (actual.estado === "al_dia" && !v.forzar) return console.log(c.verde("Ya está al día (costo $0). Usa --forzar para regenerarlo."));
      const costo = estimarLlamado(estilo, proveedores);
      if (!(await confirmar(`Generar la voz del llamado cuesta ≈${usd(costo)}. ¿Continuar?`))) return;
      const r = await generarLlamado({ estilo, proveedores, log, forzar: v.forzar });
      console.log(c.verde(`✓ Llamado listo (${(r.meta.duracion_ms / 1000).toFixed(1)} s, ${usd(r.meta.costo_usd)}). Aplica a cada proyecto al volver a ejecutar la composición.`));
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
