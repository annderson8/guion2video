import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { useEstilo } from "../contexto.tsx";
import { familia } from "../fuentes.ts";
import { FondoGrafico, progreso } from "./comun.tsx";

/** Línea horizontal que se dibuja y va revelando los hitos. */
export function LineaTiempo({
  eventos,
  titulo,
  duracion,
}: {
  eventos: { fecha: string; texto: string }[];
  titulo?: string;
  duracion: number;
}) {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const { colores, tipografia } = useEstilo();
  const margen = 180;
  const largo = width - margen * 2;
  const dibujo = progreso(frame, 8, Math.min(duracion * 0.6, fps * 2.5));
  // Los hitos se reparten en el 70 % inicial de la escena para que dé tiempo a leerlos.
  const ventana = Math.max(fps, duracion * 0.7);
  const paso = eventos.length > 1 ? ventana / eventos.length : 0;
  return (
    <FondoGrafico>
      {titulo && (
        <div
          style={{
            position: "absolute",
            top: 140,
            width: "100%",
            textAlign: "center",
            fontFamily: familia(tipografia.titulos),
            fontSize: 88,
            color: colores.texto,
            letterSpacing: "0.04em",
            opacity: progreso(frame, 0, 15),
          }}
        >
          {titulo}
        </div>
      )}
      <AbsoluteFill>
        <div style={{ position: "absolute", left: margen, top: 540, width: largo * dibujo, height: 6, background: colores.acento, borderRadius: 3 }} />
        {eventos.map((e, i) => {
          const x = margen + (eventos.length === 1 ? largo / 2 : (largo * i) / (eventos.length - 1));
          const t = progreso(frame, 12 + i * paso, 12 + i * paso + 18);
          const arriba = i % 2 === 0;
          const anchoTexto = Math.min(420, largo / Math.max(1, eventos.length - 1) + 120);
          return (
            <div key={i} style={{ opacity: t }}>
              <div
                style={{
                  position: "absolute",
                  left: x - 18,
                  top: 540 - 15,
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  background: colores.fondo,
                  border: `6px solid ${colores.acento}`,
                  transform: `scale(${t})`,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: x - anchoTexto / 2,
                  width: anchoTexto,
                  textAlign: "center",
                  top: arriba ? 330 : 600,
                  transform: `translateY(${(1 - t) * (arriba ? 20 : -20)}px)`,
                }}
              >
                <div style={{ fontFamily: familia(tipografia.cifras, "monospace"), fontSize: 56, fontWeight: 700, color: colores.acento }}>{e.fecha}</div>
                <div style={{ fontFamily: familia(tipografia.subtitulos), fontSize: 48, color: colores.texto, lineHeight: 1.15, marginTop: 8 }}>{e.texto}</div>
              </div>
            </div>
          );
        })}
      </AbsoluteFill>
    </FondoGrafico>
  );
}
