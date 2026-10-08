import { AbsoluteFill, Html5Audio, OffthreadVideo, Sequence } from "remotion";
import { Contexto, dbAGanancia, resolverSrc } from "./contexto.tsx";
import { cargarFuentes } from "./fuentes.ts";
import type { ItemAudio, ItemVideo, PropsVideo } from "./tipos.ts";
import {
  Cita,
  CifraAnimada,
  Comparacion,
  Documento,
  EscenaImagen,
  FRAMES_TRANSICION,
  LineaTiempo,
  MapaRegion,
  MarcaCanal,
  Subtitulos,
  TituloParte,
  Transicion,
} from "./componentes/index.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
function ItemVisual({ item, duracion, base }: { item: ItemVideo; duracion: number; base?: string }) {
  const p = (item.props ?? {}) as any;
  switch (item.tipo) {
    case "imagen_ia":
    case "archivo":
      return <EscenaImagen src={item.src!} huella={item.huella} movimiento={item.movimiento} duracion={duracion} />;
    case "video":
      return <OffthreadVideo src={resolverSrc(item.src!, base)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />;
    case "cifra":
      return <CifraAnimada valor={p.valor} prefijo={p.prefijo} sufijo={p.sufijo} etiqueta={p.etiqueta} decimales={p.decimales} />;
    case "linea_tiempo":
      return <LineaTiempo eventos={p.eventos} titulo={p.titulo} duracion={duracion} />;
    case "mapa":
      return <MapaRegion pais={p.pais} resaltar={p.resaltar} etiqueta={p.etiqueta} />;
    case "comparacion":
      return <Comparacion a={p.a} b={p.b} titulo={p.titulo} prefijo={p.prefijo} sufijo={p.sufijo} />;
    case "documento":
      return <Documento titulo={p.titulo} cuerpo={p.cuerpo} sello={p.sello} fecha={p.fecha} duracion={duracion} />;
    case "cita":
      return <Cita texto={p.texto} autor={p.autor} />;
    case "titulo_parte":
      return <TituloParte numero={p.numero} titulo={p.titulo} />;
    default:
      return null;
  }
}

function PistaAudio({ a, base, fps }: { a: ItemAudio; base?: string; fps: number }) {
  return (
    <Sequence from={a.desde} durationInFrames={a.duracion ?? Infinity} layout="none">
      <Html5Audio src={resolverSrc(a.src, base, a.huella)} volume={dbAGanancia(a.volumen_db ?? 0)} />
    </Sequence>
  );
}

/** Raíz: lee el timeline y monta todo con <Sequence> y <Audio>. */
export function Video({ timeline, base }: PropsVideo) {
  const { estilo, pistas, fps } = timeline;
  cargarFuentes([estilo.tipografia.titulos, estilo.tipografia.subtitulos, estilo.tipografia.cifras, "Playfair Display", "Special Elite"]);
  const items = pistas.video;
  return (
    <Contexto.Provider value={{ estilo, base }}>
      <AbsoluteFill style={{ backgroundColor: estilo.colores.fondo }}>
        {items.map((item, i) => {
          // Cada ítem dura un poco más para que el siguiente entre encima con su transición.
          const extra = i < items.length - 1 && items[i + 1].transicion !== "corte" ? FRAMES_TRANSICION : 0;
          const duracion = item.duracion + extra;
          return (
            <Sequence key={item.id} from={item.desde} durationInFrames={duracion} premountFor={fps} name={`${item.escena} · ${item.tipo}`}>
              <Transicion tipo={i === 0 ? "corte" : item.transicion}>
                <ItemVisual item={item} duracion={duracion} base={base} />
              </Transicion>
            </Sequence>
          );
        })}
        {pistas.mezcla ? (
          <Html5Audio src={resolverSrc(pistas.mezcla.src, base, pistas.mezcla.huella)} />
        ) : (
          <>
            {[...pistas.voz, ...pistas.musica, ...pistas.efectos].map((a, i) => (
              <PistaAudio key={i} a={a} base={base} fps={fps} />
            ))}
          </>
        )}
        {estilo.subtitulos.activos && <Subtitulos bloques={pistas.subtitulos} resaltar={estilo.subtitulos.resaltar_palabra_actual} />}
        <MarcaCanal />
      </AbsoluteFill>
    </Contexto.Provider>
  );
}
