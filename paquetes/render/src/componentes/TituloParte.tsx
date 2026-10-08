import { AbsoluteFill, useCurrentFrame } from "remotion";
import { useEstilo } from "../contexto.tsx";
import { familia } from "../fuentes.ts";
import { FondoGrafico, progreso } from "./comun.tsx";

/** Separador "Parte 3: El truco de las tarjetas". */
export function TituloParte({ numero, titulo }: { numero?: number; titulo: string }) {
  const frame = useCurrentFrame();
  const { colores, tipografia } = useEstilo();
  const linea = progreso(frame, 6, 26);
  const texto = progreso(frame, 14, 32);
  return (
    <FondoGrafico>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "column" }}>
        {numero !== undefined && (
          <div style={{ fontFamily: familia(tipografia.subtitulos), fontWeight: 700, fontSize: 48, letterSpacing: "0.5em", color: colores.acento, opacity: progreso(frame, 0, 16), marginBottom: 24, paddingLeft: "0.5em" }}>
            PARTE {numero}
          </div>
        )}
        <div style={{ width: 900 * linea, height: 4, background: colores.acento, marginBottom: 40 }} />
        <div style={{ overflow: "hidden" }}>
          <div
            style={{
              fontFamily: familia(tipografia.titulos),
              fontSize: titulo.length > 28 ? 120 : 160,
              color: colores.texto,
              letterSpacing: "0.03em",
              textAlign: "center",
              lineHeight: 1,
              maxWidth: 1600,
              transform: `translateY(${(1 - texto) * 110}%)`,
            }}
          >
            {titulo}
          </div>
        </div>
      </AbsoluteFill>
    </FondoGrafico>
  );
}
