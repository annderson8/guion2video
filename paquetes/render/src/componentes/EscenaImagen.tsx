import { AbsoluteFill, Img, interpolate, useCurrentFrame } from "remotion";
import { useResolver } from "../contexto.tsx";
import type { MovimientoImagen } from "../tipos.ts";
import { ENTRADA_SALIDA, Grano, Vineta } from "./comun.tsx";

const ZOOM = 0.12;

function transformacion(movimiento: MovimientoImagen, t: number): string {
  switch (movimiento) {
    case "zoom_lento_entrada":
      return `scale(${1 + ZOOM * t})`;
    case "zoom_lento_salida":
      return `scale(${1 + ZOOM * (1 - t)})`;
    case "paneo_izquierda":
      return `scale(${1 + ZOOM}) translateX(${interpolate(t, [0, 1], [4, -4])}%)`;
    case "paneo_derecha":
      return `scale(${1 + ZOOM}) translateX(${interpolate(t, [0, 1], [-4, 4])}%)`;
    case "estatico":
    default:
      // "Estático" nunca es del todo quieto: una respiración mínima evita cuadros muertos.
      return `scale(${1 + 0.03 * t})`;
  }
}

/** Imagen con efecto Ken Burns. `duracion` incluye el solape de la transición. */
export function EscenaImagen({
  src,
  huella,
  movimiento = "zoom_lento_entrada",
  duracion,
  enfoque = 0.5,
}: {
  src: string;
  huella?: string;
  movimiento?: MovimientoImagen;
  duracion: number;
  /** Punto horizontal (0 a 1) que se mantiene a la vista cuando el cuadro es más angosto que la imagen. */
  enfoque?: number;
}) {
  const frame = useCurrentFrame();
  const resolver = useResolver();
  const t = interpolate(frame, [0, Math.max(1, duracion)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ENTRADA_SALIDA,
  });
  return (
    <AbsoluteFill style={{ backgroundColor: "#000", overflow: "hidden" }}>
      <Img
        src={resolver(src, huella)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: `${enfoque * 100}% 50%`,
          transform: transformacion(movimiento, t),
          transformOrigin: `${enfoque * 100}% 50%`,
          willChange: "transform",
        }}
      />
      <Vineta fuerza={0.45} />
      <Grano opacidad={0.07} />
    </AbsoluteFill>
  );
}
