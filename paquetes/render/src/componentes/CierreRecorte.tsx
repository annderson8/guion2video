import { Link2, Play } from "lucide-react";
import { AbsoluteFill, Img, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { useEstilo, useResolver } from "../contexto.tsx";
import { familia } from "../fuentes.ts";
import { FondoGrafico, progreso } from "./comun.tsx";

/** Tarjeta final de un Short o un Reel: dónde ver el video completo. */
export function CierreRecorte({ texto, subtexto, tipo }: { texto: string; subtexto?: string; tipo: "short" | "reel" }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { colores, tipografia, marca } = useEstilo();
  const resolver = useResolver();
  const logo = spring({ frame, fps, config: { damping: 12, stiffness: 120 } });
  const linea = progreso(frame, 10, 30);
  const Icono = tipo === "reel" ? Link2 : Play;
  const palabras = texto.split(/\s+/);
  const pulso = 1 + Math.sin(frame / 7) * 0.04;
  return (
    <FondoGrafico>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", padding: "0 90px", paddingBottom: 120 }}>
        <div style={{ width: 300, height: 300, borderRadius: "50%", overflow: "hidden", background: colores.acento, transform: `scale(${logo})`, boxShadow: `0 0 0 ${10 + Math.sin(frame / 8) * 4}px ${colores.acento}44`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 80 }}>
          {marca.logo ? <Img src={resolver(marca.logo)} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Icono size={150} color={colores.fondo} strokeWidth={2.2} />}
        </div>
        <div style={{ textAlign: "center", fontFamily: familia(tipografia.titulos), fontSize: 132, lineHeight: 1.02, color: colores.texto, letterSpacing: "0.02em" }}>
          {palabras.map((p, i) => {
            const t = progreso(frame, 14 + i * 4, 28 + i * 4);
            return (
              <span key={i} style={{ display: "inline-block", opacity: t, transform: `translateY(${(1 - t) * 40}px)`, marginRight: "0.25em" }}>
                {p}
              </span>
            );
          })}
        </div>
        <div style={{ width: 640 * linea, height: 6, background: colores.acento, margin: "48px 0" }} />
        {subtexto && (
          <div style={{ display: "flex", alignItems: "center", gap: 26, fontFamily: familia(tipografia.subtitulos), fontWeight: 700, fontSize: 60, color: colores.acento, opacity: progreso(frame, 30, 44), transform: `scale(${pulso})` }}>
            <Icono size={64} strokeWidth={2.4} />
            {subtexto}
          </div>
        )}
      </AbsoluteFill>
    </FondoGrafico>
  );
}
