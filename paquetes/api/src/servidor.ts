import { cp, readdir, readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, normalize, sep } from "node:path";
import Fastify, { type FastifyReply } from "fastify";
import multipart from "@fastify/multipart";
import fstatic from "@fastify/static";
import {
  cargarConfig,
  cargarEnv,
  enmascarar,
  ErrorGuion2Video,
  Estilo,
  EspacioProyecto,
  escribirJson,
  existe,
  leerJson,
  leerJsonSiExiste,
  listarProyectos,
  NOMBRES_CLAVES,
  NombrePaso,
  Pronunciacion,
  type Config,
} from "@guion2video/nucleo";
import { cargarConfigProveedores, probarClaves } from "@guion2video/proveedores";
import {
  aprobar,
  crearContexto,
  editarEscena,
  editarPromptImagen,
  ejecutarHasta,
  estadoProyecto,
  estimarProyecto,
  inventarioImagenes,
  leerEscenas,
  leerMetaVoz,
  regenerar,
  renderizarPreview,
  subirImagenPropia,
  validarProyecto,
  type ContextoPaso,
} from "@guion2video/pasos";
import { GestorTrabajos } from "./trabajos.ts";

cargarEnv();
let config: Config = cargarConfig();
const recargar = () => (config = cargarConfig());

const app = Fastify({ logger: { level: process.env.GUION2VIDEO_LOG ?? "warn" }, bodyLimit: 20 * 1024 * 1024 });
await app.register(multipart, { limits: { fileSize: 60 * 1024 * 1024 } });
await app.register(fstatic, { root: config.proyectos, serve: false });

const trabajos = new GestorTrabajos(() => config);

const contexto = async (slug: string) => crearContexto(slug, { config, bitacora: { consola: false } });

app.setErrorHandler((error, _req, reply) => {
  const e = error as Error & { statusCode?: number; codigo?: string };
  const codigo = e instanceof ErrorGuion2Video ? e.codigo : undefined;
  const estado = e.statusCode ?? (codigo === "no_encontrado" ? 404 : codigo ? 400 : 500);
  if (estado >= 500) app.log.error(e);
  reply.status(estado).send({ error: e.message, codigo });
});

type ConSlug = { Params: { slug: string } };

// ───────── Proyectos ─────────

app.get("/api/salud", async () => ({ ok: true, simular: config.simular }));

// ───────── Estilos de canal ─────────

const ID_ESTILO = /^[a-z0-9][a-z0-9-]{1,40}$/;
const dirEstilo = (id: string) => {
  if (!ID_ESTILO.test(id)) throw new ErrorGuion2Video(`"${id}" no es un identificador válido: usa minúsculas, números y guiones (p. ej. "mi-canal")`, "validacion");
  return join(config.estilos, id);
};

/** Proyectos que usan cada estilo: editar un estilo afecta a todos ellos. */
async function proyectosPorEstilo(): Promise<Record<string, string[]>> {
  const r: Record<string, string[]> = {};
  for (const slug of await listarProyectos(config)) {
    const p = await leerJsonSiExiste<{ estilo?: string }>(join(config.proyectos, slug, "proyecto.json"));
    if (p?.estilo) (r[p.estilo] ??= []).push(slug);
  }
  return r;
}

app.get("/api/estilos", async () => {
  const dirs = (await readdir(config.estilos, { withFileTypes: true })).filter((d) => d.isDirectory());
  const usos = await proyectosPorEstilo();
  return Promise.all(
    dirs.map(async (d) => {
      const e = await leerJsonSiExiste<{ nombre?: string; idioma?: string; colores?: Record<string, string> }>(join(config.estilos, d.name, "estilo.json"));
      return { id: d.name, nombre: e?.nombre ?? d.name, idioma: e?.idioma, colores: e?.colores, proyectos: usos[d.name] ?? [] };
    }),
  );
});

app.get<{ Params: { id: string } }>("/api/estilos/:id", async (req) => {
  const dir = dirEstilo(req.params.id);
  const estilo = await leerJsonSiExiste<Record<string, unknown>>(join(dir, "estilo.json"));
  if (!estilo) throw new ErrorGuion2Video(`No existe el estilo "${req.params.id}"`, "no_encontrado");
  return {
    id: req.params.id,
    estilo,
    pronunciacion: (await leerJsonSiExiste<Record<string, string>>(join(dir, "pronunciacion.json"))) ?? {},
    proyectos: (await proyectosPorEstilo())[req.params.id] ?? [],
  };
});

/** Guarda el estilo completo. Se valida con el mismo esquema que usa el pipeline; los campos que no conoce se conservan. */
app.put<{ Params: { id: string }; Body: { estilo: Record<string, unknown>; pronunciacion?: Record<string, string> } }>("/api/estilos/:id", async (req) => {
  const dir = dirEstilo(req.params.id);
  if (!(await existe(join(dir, "estilo.json")))) throw new ErrorGuion2Video(`No existe el estilo "${req.params.id}"`, "no_encontrado");
  const estilo = { ...req.body.estilo, id: req.params.id };
  const v = Estilo.safeParse(estilo);
  if (!v.success) {
    throw new ErrorGuion2Video(`El estilo no es válido:\n${v.error.issues.map((i) => `• ${i.path.join(".")}: ${i.message}`).join("\n")}`, "validacion");
  }
  await escribirJson(join(dir, "estilo.json"), estilo);
  if (req.body.pronunciacion) {
    const limpia = Object.fromEntries(Object.entries(req.body.pronunciacion).map(([k, val]) => [k.trim(), String(val).trim()]).filter(([k, val]) => k && val));
    await escribirJson(join(dir, "pronunciacion.json"), Pronunciacion.parse(limpia));
  }
  return { ok: true };
});

/** Crea un estilo copiando otro (con su pronunciación y sus recursos). */
app.post<{ Body: { id: string; nombre: string; base: string } }>("/api/estilos", async (req) => {
  const { id, nombre, base } = req.body;
  const destino = dirEstilo(String(id ?? "").trim());
  const origen = dirEstilo(String(base ?? ""));
  if (!nombre?.trim()) throw new ErrorGuion2Video("Ponle un nombre al estilo", "validacion");
  if (await existe(destino)) throw new ErrorGuion2Video(`Ya existe un estilo "${id}"`, "validacion");
  if (!(await existe(join(origen, "estilo.json")))) throw new ErrorGuion2Video(`No existe el estilo base "${base}"`, "no_encontrado");
  await cp(origen, destino, { recursive: true });
  const estilo = await leerJson<Record<string, unknown>>(join(destino, "estilo.json"));
  await escribirJson(join(destino, "estilo.json"), { ...estilo, id, nombre: nombre.trim() });
  return { id };
});

app.get("/api/proyectos", async () => {
  const slugs = await listarProyectos(config);
  return Promise.all(
    slugs.map(async (slug) => {
      const ctx = await contexto(slug);
      const estados = await estadoProyecto(ctx);
      return {
        slug,
        titulo: ctx.proyecto.titulo,
        estilo: ctx.proyecto.estilo,
        creado: ctx.proyecto.creado,
        costo_usd: await ctx.costos.total(),
        presupuesto_usd: ctx.proyecto.presupuesto_usd ?? config.presupuestoMaxUsd,
        siguiente: estados.find((e) => e.estado !== "al_dia") ?? null,
        trabajo: trabajos.actual(slug)?.estado ?? null,
      };
    }),
  );
});

app.post<{ Body: { slug: string; estilo: string; titulo?: string; guion: string; presupuesto_usd?: number } }>("/api/proyectos", async (req) => {
  const { slug, estilo, titulo, guion, presupuesto_usd } = req.body;
  if (!guion?.trim()) throw new ErrorGuion2Video("Pega o sube el guion en Markdown");
  const dir = await mkdtemp(join(tmpdir(), "guion2video-guion-"));
  try {
    const ruta = join(dir, "guion.md");
    await writeFile(ruta, guion);
    const espacio = await EspacioProyecto.crear(config, { slug, estilo, guion: ruta, titulo, presupuestoUsd: presupuesto_usd });
    return { slug: espacio.slug };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

app.get<ConSlug>("/api/proyectos/:slug", async (req) => {
  const ctx = await contexto(req.params.slug);
  const [estados, estimacion] = await Promise.all([estadoProyecto(ctx), estimarProyecto(ctx)]);
  const siguiente = estimacion.pasos.find((p) => p.estado !== "al_dia" && p.estado !== "revision");
  return {
    proyecto: ctx.proyecto,
    estilo: ctx.estilo.estilo,
    estados,
    costos: { acumulado: estimacion.acumulado, presupuesto: estimacion.presupuesto, estimado_restante: estimacion.total, siguiente: siguiente ? { paso: siguiente.nombre, titulo: siguiente.titulo, costo_usd: siguiente.costo_usd } : null },
    estimacion: estimacion.pasos,
    trabajo: trabajos.actual(req.params.slug) ?? null,
  };
});

app.patch<ConSlug & { Body: { presupuesto_usd?: number; titulo?: string } }>("/api/proyectos/:slug", async (req) => {
  const ctx = await contexto(req.params.slug);
  await ctx.espacio.modificar((p) => {
    if (req.body.presupuesto_usd !== undefined) p.presupuesto_usd = Number(req.body.presupuesto_usd);
    if (req.body.titulo !== undefined) p.titulo = req.body.titulo;
  });
  return { ok: true };
});

// ───────── Contenido ─────────

app.get<ConSlug>("/api/proyectos/:slug/guion", async (req) => {
  const ctx = await contexto(req.params.slug);
  return {
    fuente: await readFile(ctx.espacio.rutas.guionFuente, "utf8"),
    estructurado: await leerJsonSiExiste(ctx.espacio.rutas.guionJson),
  };
});

app.get<ConSlug>("/api/proyectos/:slug/escenas", async (req) => leerEscenas(await contexto(req.params.slug)));

app.patch<ConSlug & { Params: { id: string }; Body: Record<string, unknown> }>("/api/proyectos/:slug/escenas/:id", async (req) =>
  editarEscena(await contexto(req.params.slug), req.params.id, req.body),
);

app.get<ConSlug>("/api/proyectos/:slug/voz", async (req) => {
  const ctx = await contexto(req.params.slug);
  const { escenas } = await leerEscenas(ctx);
  return Promise.all(
    escenas
      .filter((e) => e.texto_narracion)
      .map(async (e) => {
        const m = await leerMetaVoz(ctx, e.id);
        return { escena: e.id, parte: e.parte, texto: e.texto_narracion, archivo: m?.archivo, archivo_huella: m?.archivo_huella, duracion_ms: m?.duracion_ms, texto_hablado: m?.texto_hablado, proveedor: m?.proveedor, costo_usd: m?.costo_usd, cache: m?.cache };
      }),
  );
});

app.get<ConSlug>("/api/proyectos/:slug/imagenes", async (req) => {
  const ctx = await contexto(req.params.slug);
  const { escenas } = await leerEscenas(ctx);
  const inv = await inventarioImagenes(ctx);
  return inv.map((x) => {
    const escena = escenas.find((e) => e.id === x.escena)!;
    const img = escena.imagenes.find((i) => i.id === x.id)!;
    return { ...x, prompt: img.prompt, calidad: img.calidad, movimiento: img.movimiento, texto: escena.texto_narracion, parte: escena.parte, aprobada: !!x.meta && x.meta.aprobada?.archivo_huella === x.meta.archivo_huella };
  });
});

app.patch<ConSlug & { Params: { id: string }; Body: { prompt?: string; calidad?: "estandar" | "premium"; movimiento?: never } }>("/api/proyectos/:slug/imagenes/:id", async (req) =>
  editarPromptImagen(await contexto(req.params.slug), req.params.id, req.body),
);

app.post<ConSlug & { Params: { id: string } }>("/api/proyectos/:slug/imagenes/:id/archivo", async (req) => {
  const archivo = await req.file();
  if (!archivo) throw new ErrorGuion2Video("Falta el archivo");
  const fuente = (archivo.fields.fuente as { value?: string } | undefined)?.value;
  return subirImagenPropia(await contexto(req.params.slug), req.params.id, await archivo.toBuffer(), { fuente });
});

app.get<ConSlug>("/api/proyectos/:slug/timeline", async (req, reply) => {
  const ctx = await contexto(req.params.slug);
  if (!(await existe(ctx.espacio.rutas.timeline))) return reply.status(404).send({ error: "Aún no hay timeline: ejecuta la composición" });
  return leerJson(ctx.espacio.rutas.timeline);
});

app.get<ConSlug>("/api/proyectos/:slug/costos", async (req) => (await contexto(req.params.slug)).costos.resumen());

app.get<ConSlug>("/api/proyectos/:slug/validacion", async (req) => validarProyecto(await contexto(req.params.slug)));

app.get<ConSlug>("/api/proyectos/:slug/publicacion", async (req) => {
  const ctx = await contexto(req.params.slug);
  const ruta = (f: string) => ctx.espacio.ruta("salida", f);
  return {
    publicacion: await leerJsonSiExiste(ruta("publicacion.json")),
    descripcion: (await existe(ruta("descripcion.txt"))) ? await readFile(ruta("descripcion.txt"), "utf8") : null,
    archivos: Object.fromEntries(
      await Promise.all(["video.mp4", "preview.mp4", "subtitulos.srt", "miniatura.png", "miniatura-1.png", "miniatura-2.png", "miniatura-3.png", "descripcion.txt", "LISTA-PUBLICACION.md"].map(async (f) => [f, await existe(ruta(f))])),
    ),
  };
});

/** Archivos del proyecto (imágenes, audio, video) con soporte de rangos para el reproductor. */
app.get<ConSlug & { Params: { "*": string } }>("/api/proyectos/:slug/archivos/*", async (req, reply: FastifyReply) => {
  const relativo = normalize(req.params["*"]).replace(/^(\.\.(\/|\\|$))+/, "");
  const raiz = join(config.proyectos, req.params.slug);
  const absoluto = join(raiz, relativo);
  if (!absoluto.startsWith(raiz + sep)) {
    return reply.status(403).send({ error: "Ruta no permitida" });
  }
  return reply.header("cache-control", "no-cache").sendFile(relativo, raiz);
});

// ───────── Acciones (trabajos en segundo plano) ─────────

const presupuestoConfirmado = (si?: boolean) => async () => !!si;

app.post<ConSlug & { Body: { hasta: string; confirmar_presupuesto?: boolean } }>("/api/proyectos/:slug/ejecutar", async (req) => {
  const hasta = NombrePaso.parse(req.body.hasta);
  return trabajos.iniciar(req.params.slug, `ejecutar hasta ${hasta}`, (ctx) => ejecutarHasta(ctx, hasta, { confirmar: presupuestoConfirmado(req.body.confirmar_presupuesto) }));
});

app.post<ConSlug & { Body: { paso: string; unidades: string[]; confirmar_presupuesto?: boolean } }>("/api/proyectos/:slug/regenerar", async (req) => {
  const paso = NombrePaso.parse(req.body.paso);
  return trabajos.iniciar(req.params.slug, `regenerar ${paso}`, async (ctx) => {
    const r = await regenerar(ctx, paso, req.body.unidades ?? [], { confirmar: presupuestoConfirmado(req.body.confirmar_presupuesto) });
    ctx.log.info(`✓ ${r.resumen}`);
    return r;
  });
});

app.post<ConSlug & { Body: { confirmar_presupuesto?: boolean } }>("/api/proyectos/:slug/preview", async (req) =>
  trabajos.iniciar(req.params.slug, "vista previa", async (ctx: ContextoPaso) => {
    const r = await ejecutarHasta(ctx, "composicion", { confirmar: presupuestoConfirmado(req.body?.confirmar_presupuesto) });
    if (r.detenido) return r;
    await renderizarPreview(ctx);
    return r;
  }),
);

app.post<ConSlug & { Body: { paso: string; unidades?: string[] } }>("/api/proyectos/:slug/aprobar", async (req) => {
  if (trabajos.ocupado(req.params.slug)) throw Object.assign(new Error("Espera a que termine el trabajo en curso"), { statusCode: 409 });
  return { mensaje: await aprobar(await contexto(req.params.slug), NombrePaso.parse(req.body.paso), { unidades: req.body.unidades, por: "interfaz" }) };
});

app.get<ConSlug>("/api/proyectos/:slug/trabajo", async (req) => trabajos.actual(req.params.slug) ?? null);

// ───────── Configuración ─────────

const RUTA_ENV = join(config.raiz, ".env");

app.get("/api/configuracion", async () => {
  const proveedores = await cargarConfigProveedores(config.raiz);
  return {
    simular: config.simular,
    presupuesto_max_usd: config.presupuestoMaxUsd,
    paralelo_imagenes: config.paraleloImagenes,
    // Las claves nunca salen del servidor: solo los últimos 4 caracteres.
    claves: Object.fromEntries(NOMBRES_CLAVES.map((k) => [k, enmascarar(config.claves[k])])),
    llm: proveedores.llm,
    transcripcion: proveedores.transcripcion,
    estilos: await Promise.all(
      (await readdir(config.estilos, { withFileTypes: true }))
        .filter((d) => d.isDirectory())
        .map(async (d) => {
          const e = await leerJson<Record<string, any>>(join(config.estilos, d.name, "estilo.json"));
          return { id: d.name, voz: e.voz?.proveedor, voz_id: e.voz?.voz_id, imagen_principal: e.imagen?.proveedor_principal, imagen_premium: e.imagen?.proveedor_premium, musica: e.musica?.proveedor, efectos: e.musica?.efectos_proveedor };
        }),
    ),
  };
});

app.post("/api/configuracion/probar", async () => probarClaves(config));

/** Guarda claves en .env (solo nombres permitidos). Un valor vacío no borra la clave existente. */
app.put<{ Body: Record<string, string> }>("/api/configuracion/claves", async (req) => {
  const permitidas = new Set<string>([...NOMBRES_CLAVES, "GUION2VIDEO_PRESUPUESTO_MAX_USD", "GUION2VIDEO_SIMULAR", "GUION2VIDEO_PARALELO_IMAGENES"]);
  const cambios = Object.entries(req.body).filter(([k, v]) => permitidas.has(k) && typeof v === "string" && v.trim() !== "");
  const lineas = (await existe(RUTA_ENV)) ? (await readFile(RUTA_ENV, "utf8")).split("\n") : [];
  for (const [k, v] of cambios) {
    const limpio = v.trim().replace(/[\r\n]/g, "");
    const i = lineas.findIndex((l) => l.startsWith(`${k}=`));
    if (i >= 0) lineas[i] = `${k}=${limpio}`;
    else lineas.push(`${k}=${limpio}`);
    process.env[k] = limpio;
  }
  await writeFile(RUTA_ENV, lineas.join("\n").replace(/\n*$/, "\n"), { mode: 0o600 });
  recargar();
  return { actualizadas: cambios.map(([k]) => k) };
});

app.put<{ Body: { estilo?: string; voz?: string; voz_id?: string; imagen_principal?: string; imagen_premium?: string; musica?: string; efectos?: string; llm_modelo?: string } }>(
  "/api/configuracion/proveedores",
  async (req) => {
    const b = req.body;
    if (b.estilo) {
      const ruta = join(dirEstilo(b.estilo), "estilo.json");
      const e = await leerJson<Record<string, any>>(ruta);
      if (b.voz) e.voz.proveedor = b.voz;
      if (b.voz_id) e.voz.voz_id = b.voz_id;
      if (b.imagen_principal) e.imagen.proveedor_principal = b.imagen_principal;
      if (b.imagen_premium) e.imagen.proveedor_premium = b.imagen_premium;
      if (b.musica) e.musica.proveedor = b.musica;
      if (b.efectos) e.musica.efectos_proveedor = b.efectos;
      await escribirJson(ruta, e);
    }
    if (b.llm_modelo) {
      const rutaCfg = join(config.raiz, "configuracion.json");
      const c = await leerJson<Record<string, any>>(rutaCfg);
      c.llm.modelo = b.llm_modelo;
      await escribirJson(rutaCfg, c);
    }
    return { ok: true };
  },
);

// ───────── Interfaz compilada (producción) ─────────

const web = join(config.raiz, "paquetes", "web", "dist");
if (await existe(web)) {
  await app.register(fstatic, { root: web, prefix: "/", decorateReply: false, wildcard: false });
  app.setNotFoundHandler(async (req, reply) => {
    if (req.url.startsWith("/api/") || req.url.startsWith("/assets/")) return reply.status(404).send({ error: "No encontrado" });
    return reply.type("text/html").send(await readFile(join(web, "index.html")));
  });
}

const puerto = config.puertoApi;
await app.listen({ port: puerto, host: "127.0.0.1" });
console.log(`guion2video API en http://127.0.0.1:${puerto}${config.simular ? " (modo simulado)" : ""}`);
