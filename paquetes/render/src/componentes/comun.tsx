import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Easing, interpolate, random, useCurrentFrame } from "remotion";
import { useEstilo } from "../contexto.tsx";

export const SALIDA_SUAVE = Easing.bezier(0.16, 1, 0.3, 1);
export const ENTRADA_SALIDA = Easing.bezier(0.65, 0, 0.35, 1);

/** Progreso 0→1 entre dos frames con easing. */
export function progreso(frame: number, desde: number, hasta: number, easing = SALIDA_SUAVE) {
  return interpolate(frame, [desde, hasta], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing });
}

/** Grano de película: ruido SVG que se desplaza cada frame para que nunca haya un cuadro "muerto". */
export function Grano({ opacidad = 0.08 }: { opacidad?: number }) {
  const frame = useCurrentFrame();
  const x = Math.floor(random(`gx${frame}`) * 200);
  const y = Math.floor(random(`gy${frame}`) * 200);
  return (
    <AbsoluteFill style={{ pointerEvents: "none", mixBlendMode: "overlay", opacity: opacidad }}>
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0 }}>
        <filter id="grano">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed={frame % 50} stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect x={-x} y={-y} width="120%" height="120%" filter="url(#grano)" />
      </svg>
    </AbsoluteFill>
  );
}

export function Vineta({ fuerza = 0.55 }: { fuerza?: number }) {
  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        background: `radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(0,0,0,${fuerza}) 100%)`,
      }}
    />
  );
}

/** Fondo de los gráficos: degradado oscuro que respira lentamente, con grano. */
export function FondoGrafico({ children, estilo }: { children?: ReactNode; estilo?: CSSProperties }) {
  const { colores } = useEstilo();
  const frame = useCurrentFrame();
  const x = 50 + Math.sin(frame / 90) * 12;
  const y = 40 + Math.cos(frame / 110) * 10;
  return (
    <AbsoluteFill
      style={{
        backgroundColor: colores.fondo,
        backgroundImage: `radial-gradient(circle at ${x}% ${y}%, ${colores.acento}22 0%, transparent 55%), radial-gradient(circle at ${100 - x}% ${100 - y}%, #ffffff0d 0%, transparent 45%)`,
        ...estilo,
      }}
    >
      {children}
      <Grano opacidad={0.12} />
      <Vineta fuerza={0.5} />
    </AbsoluteFill>
  );
}

/** Aparición escalonada de palabras. */
export function TextoPorPalabras({
  texto,
  inicio,
  cadencia = 3,
  estilo,
}: {
  texto: string;
  inicio: number;
  cadencia?: number;
  estilo?: CSSProperties;
}) {
  const frame = useCurrentFrame();
  return (
    <span style={estilo}>
      {texto.split(/\s+/).map((p, i) => {
        const t = progreso(frame, inicio + i * cadencia, inicio + i * cadencia + 12);
        return (
          <span key={i} style={{ display: "inline-block", opacity: t, transform: `translateY(${(1 - t) * 18}px)`, marginRight: "0.28em" }}>
            {p}
          </span>
        );
      })}
    </span>
  );
}
