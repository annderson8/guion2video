import type { ReactNode } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import type { TransicionItem } from "../tipos.ts";
import { progreso } from "./comun.tsx";

/** Duración de las transiciones (8–12 frames según la especificación). */
export const FRAMES_TRANSICION = 10;

/**
 * Entrada del ítem sobre el anterior: fundido cruzado, barrido, corte o paso por negro.
 * El ítem anterior sigue dibujado debajo durante el solape.
 */
export function Transicion({ tipo, children, duracion = FRAMES_TRANSICION }: { tipo: TransicionItem; children: ReactNode; duracion?: number }) {
  const frame = useCurrentFrame();
  const t = progreso(frame, 0, duracion);
  if (tipo === "corte") return <AbsoluteFill>{children}</AbsoluteFill>;
  if (tipo === "barrido") {
    return <AbsoluteFill style={{ clipPath: `inset(0 ${(1 - t) * 100}% 0 0)` }}>{children}</AbsoluteFill>;
  }
  if (tipo === "negro") {
    // Primera mitad: el negro cubre lo anterior; segunda mitad: aparece lo nuevo.
    const negro = progreso(frame, 0, duracion);
    const nuevo = progreso(frame, duracion, duracion * 2);
    return (
      <AbsoluteFill>
        <AbsoluteFill style={{ backgroundColor: "#000", opacity: negro }} />
        <AbsoluteFill style={{ opacity: nuevo }}>{children}</AbsoluteFill>
      </AbsoluteFill>
    );
  }
  return <AbsoluteFill style={{ opacity: t }}>{children}</AbsoluteFill>;
}
