import { useCurrentFrame } from "remotion";
import { useEstilo } from "../contexto.tsx";
import { familia } from "../fuentes.ts";
import type { BloqueSubtitulo } from "../tipos.ts";

/**
 * Subtítulos para 9:16: letra grande, ajustada sola al ancho y fuera de las franjas que tapan los botones
 * de Shorts y Reels (el borde inferior queda ~400 px por encima del final).
 */
export function SubtitulosVertical({ bloques, resaltar = true }: { bloques: BloqueSubtitulo[]; resaltar?: boolean }) {
  const frame = useCurrentFrame();
  const { colores, tipografia } = useEstilo();
  const bloque = bloques.find((b) => frame >= b.desde && frame < b.hasta);
  if (!bloque) return null;
  const entrada = Math.min(1, (frame - bloque.desde) / 4);
  return (
    <div style={{ position: "absolute", left: 60, right: 60, bottom: 420, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
      <div
        style={{
          background: "rgba(8, 10, 14, 0.74)",
          borderRadius: 24,
          padding: "22px 36px",
          textAlign: "center",
          opacity: entrada,
          transform: `translateY(${(1 - entrada) * 10}px)`,
          fontFamily: familia(tipografia.subtitulos),
          fontWeight: 700,
          fontSize: 68,
          lineHeight: 1.22,
          color: colores.texto,
        }}
      >
        {bloque.palabras.map((p, i) => {
          const actual = resaltar && frame >= p.desde && frame < p.hasta;
          return (
            <span key={i} style={{ color: actual ? colores.acento : undefined }}>
              {p.texto}
              {i < bloque.palabras.length - 1 ? " " : ""}
            </span>
          );
        })}
      </div>
    </div>
  );
}
