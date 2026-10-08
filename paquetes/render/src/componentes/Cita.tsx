import { AbsoluteFill, useCurrentFrame } from "remotion";
import { useEstilo } from "../contexto.tsx";
import { familia } from "../fuentes.ts";
import { FondoGrafico, progreso, TextoPorPalabras } from "./comun.tsx";

export function Cita({ texto, autor }: { texto: string; autor?: string }) {
  const frame = useCurrentFrame();
  const { colores, tipografia } = useEstilo();
  const palabras = texto.split(/\s+/).length;
  const tamano = palabras > 30 ? 60 : palabras > 18 ? 72 : 88;
  return (
    <FondoGrafico>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: "0 220px" }}>
        <div style={{ fontFamily: familia("Playfair Display", "serif"), fontSize: 300, lineHeight: 0.6, color: colores.acento, opacity: progreso(frame, 0, 12), alignSelf: "flex-start", marginLeft: -60 }}>“</div>
        <div style={{ fontFamily: familia("Playfair Display", "serif"), fontStyle: "italic", fontSize: tamano, lineHeight: 1.25, color: colores.texto, textAlign: "center" }}>
          <TextoPorPalabras texto={texto} inicio={8} cadencia={2} />
        </div>
        {autor && (
          <div style={{ marginTop: 50, fontFamily: familia(tipografia.subtitulos), fontSize: 48, color: colores.acento, letterSpacing: "0.06em", opacity: progreso(frame, 8 + palabras * 2, 20 + palabras * 2) }}>
            — {autor}
          </div>
        )}
      </AbsoluteFill>
    </FondoGrafico>
  );
}
