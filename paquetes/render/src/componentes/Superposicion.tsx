import type { CSSProperties } from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { formatearNumero, useEstilo } from "../contexto.tsx";
import { familia } from "../fuentes.ts";
import { icono } from "../iconos.ts";
import type { ItemSuperposicion } from "../tipos.ts";
import { progreso } from "./comun.tsx";

const FRAMES_SALIDA = 10;
const FONDO = "rgba(8, 10, 14, 0.78)";

/** "400.000" o "1500" cuentan desde 0; cualquier otra cosa ("150 %", "US$2 mil") se muestra tal cual. */
function valorAnimado(valor: string, t: number): string {
  const m = valor.match(/^(\D*)(\d{1,3}(?:\.\d{3})+|\d+)(\D*)$/);
  if (!m) return valor;
  return `${m[1]}${formatearNumero(Number(m[2].replace(/\./g, "")) * t, 0)}${m[3]}`;
}

/**
 * Texto o ícono encima de una ilustración. Entra con un rebote al decirse la palabra ancla
 * y sale con un fundido corto. Nunca se pone donde van los subtítulos.
 */
export function Superposicion({ item }: { item: ItemSuperposicion }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { colores, tipografia, subtitulos } = useEstilo();
  const entrada = spring({ frame, fps, config: { damping: 14, stiffness: 170, mass: 0.8 } });
  const salida = interpolate(frame, [item.duracion - FRAMES_SALIDA, item.duracion], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const Icono = icono(item.icono);
  const opacidad = Math.min(1, entrada * 1.4) * salida;

  if (item.tipo === "etiqueta") {
    const vertical: CSSProperties = subtitulos.posicion === "superior" ? { bottom: 64 } : { top: 56 };
    return (
      <AbsoluteFill style={{ pointerEvents: "none" }}>
        <div
          style={{
            position: "absolute",
            left: 64,
            ...vertical,
            display: "flex",
            alignItems: "center",
            gap: 18,
            background: FONDO,
            borderLeft: `6px solid ${colores.acento}`,
            borderRadius: 10,
            padding: "14px 28px 14px 22px",
            opacity: opacidad,
            transform: `translateX(${(1 - entrada) * -60}px)`,
          }}
        >
          {Icono && <Icono size={40} color={colores.acento} strokeWidth={2.2} />}
          <span style={{ fontFamily: familia(tipografia.subtitulos), fontWeight: 600, fontSize: 40, color: colores.texto, letterSpacing: "0.02em" }}>{item.texto}</span>
        </div>
      </AbsoluteFill>
    );
  }

  if (item.tipo === "sello") {
    const golpe = progreso(frame, 0, 8);
    return (
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", pointerEvents: "none", paddingBottom: 180 }}>
        <div
          style={{
            border: `9px solid ${colores.alerta}`,
            color: colores.alerta,
            background: "rgba(8, 10, 14, 0.6)",
            fontFamily: familia(tipografia.titulos),
            fontSize: 128,
            lineHeight: 1,
            padding: "14px 44px 6px",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            transform: `rotate(-9deg) scale(${interpolate(golpe, [0, 1], [2.4, 1])})`,
            opacity: Math.min(1, golpe * 1.5) * salida * 0.92,
            boxShadow: golpe >= 1 ? "0 0 0 4px rgba(0,0,0,0.15)" : undefined,
          }}
        >
          {item.texto}
        </div>
      </AbsoluteFill>
    );
  }

  // palabra_clave y dato: tarjeta a la derecha, a media altura.
  const conteo = progreso(frame, 4, 4 + fps * 1.1);
  const subrayado = progreso(frame, 8, 22);
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "flex-end", paddingRight: 96, paddingBottom: 160, pointerEvents: "none" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 28,
          maxWidth: 820,
          background: FONDO,
          borderRadius: 18,
          padding: "26px 40px 26px 30px",
          boxShadow: "0 24px 70px rgba(0,0,0,0.45)",
          opacity: opacidad,
          transform: `translateY(${(1 - entrada) * 40}px) scale(${0.85 + 0.15 * entrada})`,
          transformOrigin: "right center",
        }}
      >
        {Icono && (
          <div style={{ flex: "none", width: 104, height: 104, borderRadius: "50%", background: colores.acento, display: "flex", alignItems: "center", justifyContent: "center", transform: `scale(${entrada})` }}>
            <Icono size={58} color={colores.fondo} strokeWidth={2.4} />
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {item.tipo === "dato" && item.valor && (
            <span style={{ fontFamily: familia(tipografia.cifras, "monospace"), fontWeight: 700, fontSize: 92, lineHeight: 1, color: colores.acento, letterSpacing: "-0.02em" }}>
              {valorAnimado(item.valor, conteo)}
            </span>
          )}
          <span
            style={{
              fontFamily: familia(item.tipo === "dato" ? tipografia.subtitulos : tipografia.titulos),
              fontWeight: item.tipo === "dato" ? 600 : 400,
              fontSize: item.tipo === "dato" ? 44 : 88,
              lineHeight: 1.02,
              color: colores.texto,
              textTransform: item.tipo === "dato" ? undefined : "uppercase",
              letterSpacing: item.tipo === "dato" ? undefined : "0.03em",
            }}
          >
            {item.texto}
          </span>
          <div style={{ height: 6, borderRadius: 3, background: colores.acento, width: `${subrayado * 100}%`, marginTop: 6 }} />
        </div>
      </div>
    </AbsoluteFill>
  );
}
