import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { formatearNumero, useEstilo } from "../contexto.tsx";
import { familia } from "../fuentes.ts";
import { FondoGrafico, progreso } from "./comun.tsx";

/** Dos barras enfrentadas ("prometido vs. devuelto"). */
export function Comparacion({
  a,
  b,
  titulo,
  prefijo = "",
  sufijo = "",
}: {
  a: { valor: number; etiqueta: string };
  b: { valor: number; etiqueta: string };
  titulo?: string;
  prefijo?: string;
  sufijo?: string;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { colores, tipografia } = useEstilo();
  const maximo = Math.max(Math.abs(a.valor), Math.abs(b.valor), 1e-9);
  const anchoMax = 1180;
  const barras = [
    { ...a, color: colores.acento, inicio: 10 },
    { ...b, color: colores.alerta, inicio: 10 + fps * 0.6 },
  ];
  const decimales = (v: number) => (Number.isInteger(v) ? 0 : Math.abs(v) < 10 ? 2 : 1);
  return (
    <FondoGrafico>
      {titulo && (
        <div style={{ position: "absolute", top: 150, width: "100%", textAlign: "center", fontFamily: familia(tipografia.titulos), fontSize: 92, color: colores.texto, letterSpacing: "0.04em", opacity: progreso(frame, 0, 15) }}>
          {titulo}
        </div>
      )}
      <AbsoluteFill style={{ justifyContent: "center", paddingLeft: 200, paddingTop: titulo ? 120 : 0, gap: 90 }}>
        {barras.map((barra, i) => {
          const t = progreso(frame, barra.inicio, barra.inicio + fps * 1.4);
          return (
            <div key={i} style={{ opacity: progreso(frame, barra.inicio - 6, barra.inicio + 6) }}>
              <div style={{ fontFamily: familia(tipografia.subtitulos), fontSize: 52, color: colores.texto, marginBottom: 18, fontWeight: 600 }}>
                {barra.etiqueta}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
                <div style={{ height: 96, width: Math.max(8, (Math.abs(barra.valor) / maximo) * anchoMax * t), background: barra.color, borderRadius: 8, boxShadow: `0 0 50px ${barra.color}44` }} />
                <div style={{ fontFamily: familia(tipografia.cifras, "monospace"), fontSize: 76, fontWeight: 700, color: barra.color, fontVariantNumeric: "tabular-nums" }}>
                  {prefijo}
                  {formatearNumero(barra.valor * t, decimales(barra.valor))}
                  {sufijo}
                </div>
              </div>
            </div>
          );
        })}
      </AbsoluteFill>
    </FondoGrafico>
  );
}
