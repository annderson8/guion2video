import { copyFile, readdir } from "node:fs/promises";
import { join, resolve, isAbsolute } from "node:path";
import { Estilo, Proyecto, Pronunciacion, type EstadoPaso, type NombrePaso } from "./esquemas.ts";
import { asegurarCarpeta, escribirJson, existe, leerJson, leerJsonSiExiste } from "./archivos.ts";
import { conCerrojo } from "./cerrojo.ts";
import type { Config } from "./config.ts";
import { ErrorGuion2Video } from "./errores.ts";
import { ahora } from "./fechas.ts";

export const SLUG_VALIDO = /^[a-z0-9][a-z0-9-]{1,63}$/;

export class EspacioProyecto {
  constructor(
    readonly dir: string,
    readonly slug: string,
  ) {}

  ruta(...partes: string[]): string {
    return join(this.dir, ...partes);
  }

  get rutas() {
    return {
      proyecto: this.ruta("proyecto.json"),
      guionFuente: this.ruta("fuente", "guion-original.md"),
      guion: this.ruta("guion.md"),
      guionJson: this.ruta("guion.json"),
      escenas: this.ruta("escenas.json"),
      audio: this.ruta("audio"),
      imagenes: this.ruta("imagenes"),
      ambiente: this.ruta("ambiente"),
      timeline: this.ruta("timeline.json"),
      salida: this.ruta("salida"),
      costos: this.ruta("costos.json"),
      bitacora: this.ruta("bitacora.log"),
      cache: this.ruta("cache"),
    };
  }

  static async abrir(config: Config, slug: string): Promise<EspacioProyecto> {
    const dir = join(config.proyectos, slug);
    if (!(await existe(join(dir, "proyecto.json")))) {
      throw new ErrorGuion2Video(`No existe el proyecto "${slug}" en ${config.proyectos}`, "no_encontrado");
    }
    return new EspacioProyecto(dir, slug);
  }

  static async crear(
    config: Config,
    datos: { slug: string; estilo: string; guion: string; titulo?: string; presupuestoUsd?: number },
  ): Promise<EspacioProyecto> {
    if (!SLUG_VALIDO.test(datos.slug)) {
      throw new ErrorGuion2Video(`Slug inválido "${datos.slug}": usa minúsculas, números y guiones`);
    }
    const dir = join(config.proyectos, datos.slug);
    if (await existe(join(dir, "proyecto.json"))) {
      throw new ErrorGuion2Video(`El proyecto "${datos.slug}" ya existe`);
    }
    await cargarEstilo(config, datos.estilo); // valida que el estilo exista antes de crear nada
    const guion = isAbsolute(datos.guion) ? datos.guion : resolve(process.cwd(), datos.guion);
    if (!(await existe(guion))) throw new ErrorGuion2Video(`No encuentro el guion ${guion}`, "no_encontrado");

    const espacio = new EspacioProyecto(dir, datos.slug);
    for (const carpeta of ["fuente", "audio", "imagenes", "ambiente", "salida", "cache"]) {
      await asegurarCarpeta(espacio.ruta(carpeta));
    }
    // El proyecto guarda su propia copia del guion: así es autocontenido y reproducible.
    await copyFile(guion, espacio.rutas.guionFuente);
    const proyecto: Proyecto = {
      version: 1,
      slug: datos.slug,
      titulo: datos.titulo,
      estilo: datos.estilo,
      creado: ahora(),
      guion_origen: guion,
      presupuesto_usd: datos.presupuestoUsd,
      pasos: {},
    };
    await escribirJson(espacio.rutas.proyecto, proyecto);
    await escribirJson(espacio.rutas.costos, []);
    return espacio;
  }

  leer(): Promise<Proyecto> {
    return leerJson(this.rutas.proyecto, Proyecto);
  }

  /** Lee-modifica-escribe proyecto.json de forma serializada. */
  modificar(fn: (p: Proyecto) => void | Promise<void>): Promise<Proyecto> {
    return conCerrojo(this.rutas.proyecto, async () => {
      const p = await this.leer();
      await fn(p);
      await escribirJson(this.rutas.proyecto, p);
      return p;
    });
  }

  actualizarPaso(nombre: NombrePaso, cambios: Partial<EstadoPaso> | ((e: EstadoPaso) => EstadoPaso)) {
    return this.modificar((p) => {
      const actual = p.pasos[nombre] ?? {};
      p.pasos[nombre] = typeof cambios === "function" ? cambios(actual) : { ...actual, ...cambios };
    });
  }
}

export async function listarProyectos(config: Config): Promise<string[]> {
  if (!(await existe(config.proyectos))) return [];
  const entradas = await readdir(config.proyectos, { withFileTypes: true });
  const slugs: string[] = [];
  for (const e of entradas) {
    if (e.isDirectory() && (await existe(join(config.proyectos, e.name, "proyecto.json")))) slugs.push(e.name);
  }
  return slugs.sort().reverse();
}

export interface EstiloCargado {
  estilo: Estilo;
  pronunciacion: Pronunciacion;
  dir: string;
  /** Resuelve rutas del estilo (referencias, intro, logo) relativas a la raíz del repositorio. */
  resolver(ruta: string): string;
}

export async function cargarEstilo(config: Config, id: string): Promise<EstiloCargado> {
  const dir = join(config.estilos, id);
  const archivo = join(dir, "estilo.json");
  if (!(await existe(archivo))) throw new ErrorGuion2Video(`No existe el estilo "${id}" (${archivo})`, "no_encontrado");
  const estilo = await leerJson(archivo, Estilo);
  const pronunciacion = (await leerJsonSiExiste(join(dir, "pronunciacion.json"), Pronunciacion)) ?? {};
  return {
    estilo,
    pronunciacion,
    dir,
    resolver: (r) => (isAbsolute(r) ? r : resolve(config.raiz, r)),
  };
}
