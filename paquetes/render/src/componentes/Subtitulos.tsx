import { useCurrentFrame } from "remotion";
import { useEstilo } from "../contexto.tsx";
import { familia } from "../fuentes.ts";
import type { BloqueSubtitulo } from "../tipos.ts";

/** Busca el bloque activo por búsqueda binaria (hay cientos de bloques en un video de 20 min). */
function bloqueActivo(bloques: BloqueSubtitulo[], frame: number): BloqueSubtitulo | undefined {
  let lo = 0;
  let hi = bloques.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const b = bloques[mid];
    if (frame < b.desde) hi = mid - 1;
    else if (frame >= b.hasta) lo = mid + 1;
    else return b;
  }
  return undefined;
}

/** Subtítulos con la palabra actual resaltada en el color de acento. */
export function Subtitulos({ bloques, resaltar = true }: { bloques: BloqueSubtitulo[]; resaltar?: boolean }) {
  const frame = useCurrentFrame();
  const { colores, tipografia, subtitulos } = useEstilo();
  const bloque = bloqueActivo(bloques, frame);
  if (!bloque) return null;
  let indice = 0;
  const entrada = Math.min(1, (frame - bloque.desde) / 4);
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        [subtitulos.posicion === "superior" ? "top" : "bottom"]: 70,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          background: "rgba(8, 10, 14, 0.72)",
          borderRadius: 14,
          padding: "16px 34px",
          maxWidth: 1500,
          textAlign: "center",
          opacity: entrada,
          transform: `translateY(${(1 - entrada) * 8}px)`,
        }}
      >
        {bloque.lineas.map((linea, li) => (
          <div key={li} style={{ fontFamily: familia(tipografia.subtitulos), fontWeight: 600, fontSize: 54, lineHeight: 1.25, color: colores.texto }}>
            {linea.split(" ").map((palabra, pi) => {
              const p = bloque.palabras[indice++];
              const actual = resaltar && p && frame >= p.desde && frame < p.hasta;
              return (
                <span key={pi} style={{ color: actual ? colores.acento : undefined }}>
                  {palabra}
                  {pi < linea.split(" ").length - 1 ? " " : ""}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
