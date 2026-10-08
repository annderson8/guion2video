import { Img } from "remotion";
import { useEstilo, useResolver } from "../contexto.tsx";
import { familia } from "../fuentes.ts";

/** Logo pequeño en una esquina. */
export function MarcaCanal() {
  const { marca, colores, tipografia } = useEstilo();
  const resolver = useResolver();
  if (!marca.logo && !marca.texto) return null;
  return (
    <div style={{ position: "absolute", top: 46, right: 56, opacity: 0.55, pointerEvents: "none" }}>
      {marca.logo ? (
        <Img src={resolver(marca.logo)} style={{ height: 64 }} />
      ) : (
        <div style={{ fontFamily: familia(tipografia.titulos), fontSize: 40, letterSpacing: "0.2em", color: colores.texto, borderBottom: `3px solid ${colores.acento}`, paddingBottom: 2 }}>
          {marca.texto}
        </div>
      )}
    </div>
  );
}
