import * as React from "react";
import * as Lucide from "lucide-react";
import { AbsoluteFill, Easing, interpolate, interpolateColors, random, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { useEstilo } from "../contexto.tsx";
import { familia } from "../fuentes.ts";
import type { EstiloVisual, ItemSuperposicion, PalabraSubtitulo } from "../tipos.ts";

/** Lo que recibe la función `Superposicion` que escribe Claude. */
export interface PropsSuperposicion {
  /** Frames que dura la escena. */
  duracion: number;
  /** Palabras narradas con sus frames (relativos al inicio de la escena). */
  palabras: PalabraSubtitulo[];
  /** Frame en que se empieza a decir una palabra (sin importar tildes ni mayúsculas), o null. */
  momento: (palabra: string, desdeFrame?: number) => number | null;
}

/** Variables que el código de Claude tiene a mano, y nada más del entorno. */
export function temaDe(estilo: EstiloVisual) {
  return {
    colores: estilo.colores,
    fuentes: { titulos: familia(estilo.tipografia.titulos), texto: familia(estilo.tipografia.subtitulos), cifras: familia(estilo.tipografia.cifras, "monospace") },
    subtitulos: estilo.subtitulos.posicion,
  };
}

const normalizar = (p: string) =>
  p
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ]/g, "");

// Un ícono que no existe no rompe la escena: no se dibuja y queda en el registro del navegador.
const Iconos = new Proxy(Lucide as unknown as Record<string, unknown>, {
  get(objetivo, nombre: string) {
    const icono = objetivo[nombre];
    if (icono) return icono;
    console.warn(`[superposición] el ícono "${String(nombre)}" no existe en Lucide`);
    return () => null;
  },
});

// Nombres que el código no puede usar: se reemplazan por undefined dentro de la función.
const BLOQUEADOS = ["window", "document", "globalThis", "self", "fetch", "XMLHttpRequest", "WebSocket", "localStorage", "sessionStorage", "indexedDB", "navigator", "eval", "importScripts"];

const compiladas = new Map<string, React.ComponentType<PropsSuperposicion> | Error>();

function compilar(codigo: string, tema: ReturnType<typeof temaDe>): React.ComponentType<PropsSuperposicion> | Error {
  const clave = `${JSON.stringify(tema)}\n${codigo}`;
  const previa = compiladas.get(clave);
  if (previa) return previa;
  let resultado: React.ComponentType<PropsSuperposicion> | Error;
  try {
    const api = { React, AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate, interpolateColors, spring, Easing, random, Iconos, tema };
    const fabrica = new Function(...Object.keys(api), ...BLOQUEADOS, `${codigo}\nreturn typeof Superposicion === "function" ? Superposicion : null;`);
    const componente = fabrica(...Object.values(api), ...BLOQUEADOS.map(() => undefined));
    resultado = componente ?? new Error("el código no declara function Superposicion");
  } catch (e) {
    resultado = e as Error;
  }
  compiladas.set(clave, resultado);
  return resultado;
}

class Aislar extends React.Component<{ id: string; children: React.ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  componentDidCatch(e: Error) {
    console.error(`[superposición ${this.props.id}] ${e.message}`);
  }
  render() {
    return this.state.error ? null : this.props.children;
  }
}

/** Ejecuta la animación que Claude diseñó para una escena. Si falla, la escena sigue sin ella. */
export function SuperposicionCodigo({ item }: { item: ItemSuperposicion }) {
  const estilo = useEstilo();
  const tema = React.useMemo(() => temaDe(estilo), [estilo]);
  const Componente = compilar(item.codigo, tema);
  const momento = React.useCallback(
    (palabra: string, desdeFrame = 0) => {
      const buscada = normalizar(palabra.split(/\s+/)[0] ?? "");
      return item.palabras.find((p) => p.desde >= desdeFrame && normalizar(p.texto) === buscada)?.desde ?? null;
    },
    [item.palabras],
  );
  if (Componente instanceof Error) {
    console.error(`[superposición ${item.id}] ${Componente.message}`);
    return null;
  }
  return (
    <Aislar id={item.id}>
      <AbsoluteFill style={{ pointerEvents: "none" }}>
        <Componente duracion={item.duracion} palabras={item.palabras} momento={momento} />
      </AbsoluteFill>
    </Aislar>
  );
}
