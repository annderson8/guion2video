import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { formatearNumero, useEstilo } from "../contexto.tsx";
import { familia } from "../fuentes.ts";
import { FondoGrafico, progreso } from "./comun.tsx";

/** Número que cuenta desde 0 con formato colombiano (puntos de miles). */
export function CifraAnimada({
  valor,
  prefijo = "",
  sufijo = "",
  etiqueta,
  decimales = 0,
}: {
  valor: number;
  prefijo?: string;
  sufijo?: string;
  etiqueta: string;
  decimales?: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { colores, tipografia } = useEstilo();
  const conteo = progreso(frame, 6, 6 + fps * 1.6);
  const entrada = progreso(frame, 0, 18);
  const linea = progreso(frame, fps * 1.2, fps * 1.9);
  const textoValor = `${prefijo}${formatearNumero(valor * conteo, decimales)}${sufijo}`;
  const largo = textoValor.length;
  const tamano = largo > 14 ? 150 : largo > 10 ? 190 : 240;
  return (
    <FondoGrafico>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "column" }}>
        <div
          style={{
            fontFamily: familia(tipografia.cifras, "monospace"),
            fontSize: tamano,
            fontWeight: 700,
            color: colores.acento,
            letterSpacing: "-0.02em",
            opacity: entrada,
            transform: `scale(${0.92 + 0.08 * entrada})`,
            fontVariantNumeric: "tabular-nums",
            textShadow: `0 0 60px ${colores.acento}55`,
          }}
        >
          {textoValor}
        </div>
        <div style={{ width: 640 * linea, height: 6, background: colores.acento, margin: "24px 0 36px", borderRadius: 3 }} />
        <div
          style={{
            fontFamily: familia(tipografia.titulos),
            fontSize: 84,
            color: colores.texto,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            opacity: progreso(frame, fps * 0.9, fps * 1.5),
            maxWidth: 1500,
            textAlign: "center",
            lineHeight: 1.05,
          }}
        >
          {etiqueta}
        </div>
      </AbsoluteFill>
    </FondoGrafico>
  );
}
