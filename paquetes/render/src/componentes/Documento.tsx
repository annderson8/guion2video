import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { useEstilo } from "../contexto.tsx";
import { familia } from "../fuentes.ts";
import { FondoGrafico, progreso } from "./comun.tsx";

/**
 * Hoja de papel animada con texto escrito por nosotros (nunca copias de prensa).
 * El cuerpo aparece como máquina de escribir; el sello cae al final.
 */
export function Documento({
  titulo,
  cuerpo,
  sello,
  fecha,
  duracion,
}: {
  titulo: string;
  cuerpo: string;
  sello?: string;
  fecha?: string;
  duracion: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { colores, tipografia } = useEstilo();
  const entrada = progreso(frame, 0, 22);
  const finEscritura = Math.max(fps * 1.5, Math.min(duracion * 0.65, fps * 6));
  const caracteres = Math.floor(interpolate(frame, [15, finEscritura], [0, cuerpo.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const tSello = progreso(frame, finEscritura + 6, finEscritura + 16);
  const deriva = interpolate(frame, [0, duracion], [0, 1.2]);
  return (
    <FondoGrafico>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <div
          style={{
            width: 1180,
            minHeight: 760,
            background: "linear-gradient(160deg, #f3ecdc 0%, #e6dcc4 100%)",
            boxShadow: "0 40px 120px rgba(0,0,0,0.6)",
            padding: "80px 100px",
            transform: `translateY(${(1 - entrada) * 80}px) rotate(${-1.5 + deriva}deg) scale(${0.98 + deriva * 0.02})`,
            opacity: entrada,
            position: "relative",
            color: "#1d1a14",
          }}
        >
          {fecha && <div style={{ fontFamily: familia("Special Elite", "monospace"), fontSize: 34, opacity: 0.7, marginBottom: 24 }}>{fecha}</div>}
          <div style={{ fontFamily: familia("Playfair Display", "serif"), fontWeight: 800, fontSize: 70, lineHeight: 1.08, marginBottom: 36, borderBottom: "3px solid #1d1a14", paddingBottom: 26 }}>
            {titulo}
          </div>
          <div style={{ fontFamily: familia("Special Elite", "monospace"), fontSize: 46, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>
            {cuerpo.slice(0, caracteres)}
            <span style={{ opacity: frame % 20 < 10 && caracteres < cuerpo.length ? 1 : 0 }}>▍</span>
          </div>
          {sello && (
            <div
              style={{
                position: "absolute",
                right: 70,
                bottom: 70,
                border: `8px solid ${colores.alerta}`,
                color: colores.alerta,
                fontFamily: familia(tipografia.titulos),
                fontSize: 84,
                padding: "6px 30px",
                letterSpacing: "0.08em",
                transform: `rotate(-12deg) scale(${interpolate(tSello, [0, 1], [2.2, 1])})`,
                opacity: tSello * 0.88,
                mixBlendMode: "multiply",
              }}
            >
              {sello}
            </div>
          )}
        </div>
      </AbsoluteFill>
    </FondoGrafico>
  );
}
