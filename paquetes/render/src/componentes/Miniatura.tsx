import { AbsoluteFill, Img } from "remotion";
import { Contexto, resolverSrc } from "../contexto.tsx";
import { cargarFuentes, familia } from "../fuentes.ts";
import type { PropsMiniatura } from "../tipos.ts";
import { Grano } from "./comun.tsx";

/** Miniatura 1280×720: imagen clave + título grande con una palabra resaltada. Tres variantes de composición. */
export function Miniatura({ titulo, resaltado, src, base, estilo, variante = 0 }: PropsMiniatura) {
  cargarFuentes([estilo.tipografia.titulos]);
  const { colores } = estilo;
  const palabras = titulo.toUpperCase().split(/\s+/);
  const limpiar = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]/gu, "").toUpperCase();
  const clave = resaltado ? limpiar(resaltado) : undefined;
  // Solo la primera aparición exacta de la palabra va en color.
  const indiceResaltado = clave ? palabras.findIndex((p) => limpiar(p) === clave) : -1;
  const alineacion = variante === 1 ? "flex-end" : "flex-start";
  const degradado =
    variante === 1
      ? "linear-gradient(270deg, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.55) 45%, rgba(0,0,0,0) 75%)"
      : variante === 2
        ? "linear-gradient(0deg, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.35) 55%, rgba(0,0,0,0) 80%)"
        : "linear-gradient(90deg, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.55) 45%, rgba(0,0,0,0) 75%)";
  return (
    <Contexto.Provider value={{ estilo, base }}>
      <AbsoluteFill style={{ backgroundColor: colores.fondo }}>
        {src && <Img src={resolverSrc(src, base)} style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scale(1.06)" }} />}
        <AbsoluteFill style={{ background: degradado }} />
        <AbsoluteFill style={{ justifyContent: variante === 2 ? "flex-end" : "center", alignItems: alineacion, padding: "60px 70px" }}>
          <div
            style={{
              fontFamily: familia(estilo.tipografia.titulos),
              fontSize: palabras.length > 6 ? 118 : 150,
              lineHeight: 0.92,
              color: colores.texto,
              maxWidth: variante === 2 ? 1140 : 720,
              textAlign: variante === 1 ? "right" : "left",
              textShadow: "0 6px 30px rgba(0,0,0,0.6)",
            }}
          >
            {palabras.map((p, i) => (
              <span key={i} style={{ color: i === indiceResaltado ? colores.acento : undefined }}>
                {p}{" "}
              </span>
            ))}
          </div>
          <div style={{ width: 220, height: 12, background: colores.alerta, marginTop: 26 }} />
        </AbsoluteFill>
        <Grano opacidad={0.08} />
      </AbsoluteFill>
    </Contexto.Provider>
  );
}
