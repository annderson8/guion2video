import {
  enParalelo,
  escribirArchivo,
  escribirJson,
  existe,
  huella,
  leerJsonSiExiste,
  type Escena,
} from "@guion2video/nucleo";
import { writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { conTemporal, normalizarSonoridad, type CandidatoAudio, type ProveedorAudio } from "@guion2video/proveedores";
import type { ContextoPaso } from "./contexto.ts";
import type { Paso } from "./paso.ts";
import { registrarCosto } from "./cache.ts";
import { leerEscenas } from "./escenas.ts";

const VERSION = 2;

/** Etiqueta de ambiente → términos de búsqueda en las bibliotecas (en inglés, que es como están etiquetadas). */
export const CONSULTAS_MUSICA: Record<string, string> = {
  neutral: "documentary ambient",
  tension_baja: "dark ambient suspense",
  tension_alta: "tense thriller",
  revelacion: "dramatic cinematic",
  tribunal: "serious investigation",
  nostalgia: "melancholic piano",
  esperanza: "hopeful piano",
  caos: "chaotic dark",
};

export interface Pista {
  archivo: string;
  etiqueta: string;
  titulo: string;
  autor: string;
  licencia: string;
  url_licencia?: string;
  url_fuente?: string;
  proveedor: string;
  huella: string;
}

export interface ArchivoMusica {
  partes: Record<string, Pista | null>;
}
export interface ArchivoEfectos {
  efectos: Record<string, Pista | null>;
  escenas: Record<string, string[]>;
}

export interface Credito {
  tipo: "musica" | "efecto";
  titulo: string;
  autor: string;
  licencia: string;
  url_fuente?: string;
  url_licencia?: string;
  atribucion: string;
}

const moda = (xs: string[]) => {
  const c = new Map<string, number>();
  for (const x of xs) c.set(x, (c.get(x) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "neutral";
};

export const slugEfecto = (e: string) => e.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);

function planear(escenas: Escena[]) {
  const partes: { parte: string; clave: string; etiqueta: string; ordinal: number }[] = [];
  const titulos = [...new Set(escenas.map((e) => e.parte))];
  const usos = new Map<string, number>();
  titulos.forEach((t, i) => {
    const etiqueta = moda(escenas.filter((e) => e.parte === t && e.texto_narracion).map((e) => e.ambiente.musica));
    const ordinal = usos.get(etiqueta) ?? 0;
    usos.set(etiqueta, ordinal + 1);
    partes.push({ parte: t, clave: `parte-${String(i + 1).padStart(2, "0")}`, etiqueta, ordinal });
  });
  const efectosPorEscena: Record<string, string[]> = {};
  for (const e of escenas) {
    const lista = e.ambiente.efectos.map(slugEfecto).filter(Boolean);
    if (lista.length) efectosPorEscena[e.id] = lista;
  }
  const efectos = [...new Set(Object.values(efectosPorEscena).flat())].sort();
  return { partes, efectos, efectosPorEscena };
}

/** Elige el proveedor: el del estilo si tiene clave; si no, la biblioteca propia. */
function proveedorDisponible(ctx: ContextoPaso, id: string): ProveedorAudio {
  const k = ctx.config.claves;
  if (!ctx.proveedores.simular && ((id === "jamendo" && !k.JAMENDO_CLIENT_ID) || (id === "freesound" && !k.FREESOUND_API_KEY))) {
    ctx.log.aviso(`Sin clave para ${id}: se usa la biblioteca propia (biblioteca/)`);
    return ctx.proveedores.audio("biblioteca");
  }
  return ctx.proveedores.audio(id);
}

export const atribucion = (p: { titulo: string; autor: string; licencia: string; url_fuente?: string }) =>
  `"${p.titulo}"${p.autor ? ` de ${p.autor}` : ""}${p.licencia ? ` (${p.licencia})` : ""}${p.url_fuente ? ` — ${p.url_fuente}` : ""}`;

export const pasoAudioAmbiente: Paso = {
  nombre: "audio_ambiente",
  titulo: "Música y efectos",
  depende: ["escenas"],
  revision: false,
  async huella(ctx) {
    const { escenas } = await leerEscenas(ctx);
    const p = planear(escenas);
    const m = ctx.estilo.estilo.musica;
    return huella("ambiente", VERSION, p.partes, p.efectos, m.proveedor, m.efectos_proveedor, ctx.proveedores.simular);
  },
  salidas: (ctx) => [ctx.espacio.ruta("ambiente", "musica.json"), ctx.espacio.ruta("ambiente", "efectos.json"), ctx.espacio.ruta("ambiente", "creditos.json")],
  async estimar(ctx) {
    const { escenas } = await leerEscenas(ctx);
    const p = planear(escenas);
    const c = ctx.proveedores.costos;
    const m = ctx.estilo.estilo.musica;
    return { costo_usd: c.audio(m.proveedor, p.partes.length) + c.audio(m.efectos_proveedor, p.efectos.length), unidades: p.partes.length + p.efectos.length, pendientes: p.partes.length + p.efectos.length };
  },
  async ejecutar(ctx) {
    const { escenas } = await leerEscenas(ctx);
    const plan = planear(escenas);
    const m = ctx.estilo.estilo.musica;
    const provMusica = proveedorDisponible(ctx, m.proveedor);
    const provEfectos = proveedorDisponible(ctx, m.efectos_proveedor);
    const avisos: string[] = [];
    const usadas = new Set<string>();
    const previaMusica = await leerJsonSiExiste<ArchivoMusica>(ctx.espacio.ruta("ambiente", "musica.json"));
    const previaEfectos = await leerJsonSiExiste<ArchivoEfectos>(ctx.espacio.ruta("ambiente", "efectos.json"));

    // Cada pista se normaliza a la sonoridad de la voz: así volumen_db significa lo mismo con cualquier pista.
    const referencia = ctx.estilo.estilo.voz.lufs;
    const descargar = async (prov: ProveedorAudio, c: CandidatoAudio, destino: string) => {
      const crudo = await prov.descargar(c);
      const normalizado = await conTemporal(async (dir) => {
        const entrada = join(dir, "crudo");
        const salida = join(dir, "norm.m4a");
        await writeFile(entrada, crudo);
        await normalizarSonoridad(entrada, salida, { lufs: referencia, canales: 2, frecuencia: 48000, codec: ["-c:a", "aac", "-b:a", "192k"] });
        return readFile(salida);
      });
      await escribirArchivo(ctx.espacio.ruta(destino), normalizado);
    };

    // Música: una pista por parte, sin repetir pista dentro del video si hay alternativas.
    const musica: ArchivoMusica = { partes: {} };
    for (const p of plan.partes) {
      const h = huella(VERSION, provMusica.id, p.etiqueta, p.ordinal, referencia);
      const previa = previaMusica?.partes[p.clave];
      if (previa && previa.huella === h && (await existe(ctx.espacio.ruta(previa.archivo)))) {
        musica.partes[p.clave] = previa;
        usadas.add(previa.titulo);
        continue;
      }
      try {
        const candidatos = await provMusica.buscar({ tipo: "musica", etiqueta: p.etiqueta, consulta: CONSULTAS_MUSICA[p.etiqueta] ?? p.etiqueta.replace(/_/g, " "), duracionMinS: 90 });
        const libres = candidatos.filter((c) => !usadas.has(c.titulo));
        const elegido = (libres.length ? libres : candidatos)[libres.length ? 0 : p.ordinal % Math.max(1, candidatos.length)];
        if (!elegido) {
          avisos.push(`No encontré música "${p.etiqueta}" para "${p.parte}" (${provMusica.id}). Añade pistas en biblioteca/musica/${p.etiqueta}/`);
          musica.partes[p.clave] = null;
          continue;
        }
        const archivo = `ambiente/musica-${p.clave}.m4a`;
        await descargar(provMusica, elegido, archivo);
        usadas.add(elegido.titulo);
        musica.partes[p.clave] = { archivo, etiqueta: p.etiqueta, titulo: elegido.titulo, autor: elegido.autor, licencia: elegido.licencia, url_licencia: elegido.url_licencia, url_fuente: elegido.url_fuente, proveedor: provMusica.id, huella: h };
        await registrarCosto(ctx, { paso: "audio_ambiente", unidad: p.clave, proveedor: provMusica.id, costo_usd: ctx.proveedores.costos.audio(provMusica.id, 1), cache: false });
      } catch (e) {
        avisos.push(`Música de "${p.parte}": ${(e as Error).message.slice(0, 200)}`);
        musica.partes[p.clave] = null;
      }
    }

    // Efectos: un archivo por efecto distinto.
    const efectos: ArchivoEfectos = { efectos: {}, escenas: plan.efectosPorEscena };
    await enParalelo(plan.efectos, 3, async (ef) => {
      const h = huella(VERSION, provEfectos.id, ef, referencia);
      const previa = previaEfectos?.efectos[ef];
      if (previa && previa.huella === h && (await existe(ctx.espacio.ruta(previa.archivo)))) {
        efectos.efectos[ef] = previa;
        return;
      }
      try {
        const [elegido] = await provEfectos.buscar({ tipo: "efecto", etiqueta: ef, consulta: ef.replace(/_/g, " ") });
        if (!elegido) {
          efectos.efectos[ef] = null;
          avisos.push(`Sin efecto para "${ef}"`);
          return;
        }
        const archivo = `ambiente/efecto-${ef}.m4a`;
        await descargar(provEfectos, elegido, archivo);
        efectos.efectos[ef] = { archivo, etiqueta: ef, titulo: elegido.titulo, autor: elegido.autor, licencia: elegido.licencia, url_licencia: elegido.url_licencia, url_fuente: elegido.url_fuente, proveedor: provEfectos.id, huella: h };
      } catch (e) {
        efectos.efectos[ef] = null;
        avisos.push(`Efecto "${ef}": ${(e as Error).message.slice(0, 160)}`);
      }
    });

    const creditos: Credito[] = [
      ...Object.values(musica.partes).filter((p): p is Pista => !!p).map((p) => ({ tipo: "musica" as const, ...p, atribucion: atribucion(p) })),
      ...Object.values(efectos.efectos).filter((p): p is Pista => !!p).map((p) => ({ tipo: "efecto" as const, ...p, atribucion: atribucion(p) })),
    ]
      .map(({ tipo, titulo, autor, licencia, url_fuente, url_licencia, atribucion: a }) => ({ tipo, titulo, autor, licencia, url_fuente, url_licencia, atribucion: a }))
      // Una pista usada en varias partes se acredita una sola vez.
      .filter((c, i, todos) => todos.findIndex((x) => x.tipo === c.tipo && x.titulo === c.titulo && x.autor === c.autor) === i);

    await escribirJson(ctx.espacio.ruta("ambiente", "musica.json"), musica);
    await escribirJson(ctx.espacio.ruta("ambiente", "efectos.json"), efectos);
    await escribirJson(ctx.espacio.ruta("ambiente", "creditos.json"), creditos);
    const conMusica = Object.values(musica.partes).filter(Boolean).length;
    return {
      costo_usd: 0,
      resumen: `${conMusica}/${plan.partes.length} partes con música, ${Object.values(efectos.efectos).filter(Boolean).length} efectos (${provMusica.id} / ${provEfectos.id})`,
      avisos,
    };
  },
};
