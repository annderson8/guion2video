import { AbsoluteFill, Html5Audio, OffthreadVideo, Sequence } from "remotion";
import { Contexto, Dimensiones, dbAGanancia, resolverSrc } from "./contexto.tsx";
import { cargarFuentes } from "./fuentes.ts";
import { ItemVisual } from "./Video.tsx";
import { ALTO_VERTICAL, ANCHO_VERTICAL, framesContenido, segmentosRecorte, type SegmentoRecorte } from "./recorte.ts";
import type { BloqueSubtitulo, ItemVideo, PropsVertical } from "./tipos.ts";
import { CierreRecorte, EscenaImagen, FRAMES_TRANSICION, MarcaCanal, SuperposicionCodigo, TituloParte, Transicion } from "./componentes/index.ts";
import { FondoGrafico } from "./componentes/comun.tsx";
import { SubtitulosVertical } from "./componentes/SubtitulosVertical.tsx";

const ANCHO_16_9 = 1920;
const ALTO_16_9 = 1080;
const ESCALA = ANCHO_VERTICAL / ANCHO_16_9;
/** Banda central donde se ven los gráficos 16:9 (un poco por encima del centro, para dejar sitio a los subtítulos). */
const TOP_BANDA = (ALTO_VERTICAL - ALTO_16_9 * ESCALA) / 2 - 140;

/** Un gráfico (cifra, mapa, línea de tiempo…) se dibuja en 1920×1080 y se reduce al ancho del cuadro vertical. */
function EnBanda({ children }: { children: React.ReactNode }) {
  return (
    <FondoGrafico>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: TOP_BANDA,
          width: ANCHO_16_9,
          height: ALTO_16_9,
          transformOrigin: "0 0",
          transform: `scale(${ESCALA})`,
          WebkitMaskImage: "linear-gradient(transparent, #000 7%, #000 93%, transparent)",
          maskImage: "linear-gradient(transparent, #000 7%, #000 93%, transparent)",
        }}
      >
        <Dimensiones.Provider value={{ ancho: ANCHO_16_9, alto: ALTO_16_9 }}>
          <AbsoluteFill>{children}</AbsoluteFill>
        </Dimensiones.Provider>
      </div>
    </FondoGrafico>
  );
}

function VisualVertical({ item, duracion, base, enfoque }: { item: ItemVideo; duracion: number; base?: string; enfoque: number }) {
  if (item.tipo === "imagen_ia" || item.tipo === "archivo") {
    return <EscenaImagen src={item.src!} huella={item.huella} movimiento={item.movimiento} duracion={duracion} enfoque={enfoque} />;
  }
  if (item.tipo === "video") {
    return <OffthreadVideo src={resolverSrc(item.src!, base)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />;
  }
  if (item.tipo === "titulo_parte") {
    // El separador es un texto centrado: se dibuja a tamaño completo en el cuadro vertical, no reducido.
    const p = (item.props ?? {}) as { numero?: number; titulo: string };
    return <TituloParte numero={p.numero} titulo={p.titulo} />;
  }
  return (
    <EnBanda>
      <ItemVisual item={item} duracion={duracion} base={base} />
    </EnBanda>
  );
}

function TramoVertical({ timeline, seg, base, enfoque }: { timeline: PropsVertical["timeline"]; seg: SegmentoRecorte; base?: string; enfoque: number }) {
  const { fps } = timeline;
  const items = timeline.pistas.video;
  return (
    <AbsoluteFill>
      {items.map((item, i) => {
        if (item.tipo === "llamado" || item.desde >= seg.hasta || item.desde + item.duracion <= seg.desde) return null;
        // Igual que en el video completo: cada ítem dura un poco más para que el siguiente entre encima con su transición.
        const extra = i < items.length - 1 && items[i + 1].transicion !== "corte" ? FRAMES_TRANSICION : 0;
        const duracion = item.duracion + extra;
        const primero = item.desde <= seg.desde;
        return (
          <Sequence key={item.id} from={item.desde - seg.desde} durationInFrames={duracion} premountFor={fps} name={`${item.escena} · ${item.tipo}`}>
            <Transicion tipo={primero ? "corte" : item.transicion}>
              <VisualVertical item={item} duracion={duracion} base={base} enfoque={enfoque} />
            </Transicion>
          </Sequence>
        );
      })}
      {(timeline.pistas.superposiciones ?? [])
        .filter((s) => s.desde < seg.hasta && s.desde + s.duracion > seg.desde)
        .map((s) => (
          <Sequence key={s.id} from={s.desde - seg.desde} durationInFrames={Math.max(1, s.duracion)} name={`${s.escena} · animación`}>
            <AbsoluteFill>
              <div style={{ position: "absolute", left: 0, top: TOP_BANDA, width: ANCHO_16_9, height: ALTO_16_9, transformOrigin: "0 0", transform: `scale(${ESCALA})` }}>
                <Dimensiones.Provider value={{ ancho: ANCHO_16_9, alto: ALTO_16_9 }}>
                  <SuperposicionCodigo item={s} />
                </Dimensiones.Provider>
              </div>
            </AbsoluteFill>
          </Sequence>
        ))}
    </AbsoluteFill>
  );
}

/** Subtítulos del recorte con los tiempos ya corridos al tiempo del recorte. */
function bloquesDelRecorte(bloques: BloqueSubtitulo[], segmentos: SegmentoRecorte[]): BloqueSubtitulo[] {
  const salida: BloqueSubtitulo[] = [];
  for (const seg of segmentos) {
    const mover = (f: number) => f - seg.desde + seg.salida;
    for (const b of bloques) {
      if (b.hasta <= seg.desde || b.desde >= seg.hasta) continue;
      salida.push({ ...b, desde: mover(Math.max(b.desde, seg.desde)), hasta: mover(Math.min(b.hasta, seg.hasta)), palabras: b.palabras.map((p) => ({ ...p, desde: mover(p.desde), hasta: mover(p.hasta) })) });
    }
  }
  return salida;
}

/** Composición 9:16 (Short o Reel): un tramo del video final con el mismo audio, más la tarjeta de cierre. */
export function Vertical({ timeline, recorte, base }: PropsVertical) {
  const { estilo, pistas, fps } = timeline;
  cargarFuentes([estilo.tipografia.titulos, estilo.tipografia.subtitulos, estilo.tipografia.cifras, "Playfair Display", "Special Elite"]);
  const segmentos = segmentosRecorte(timeline, recorte.desde, recorte.hasta);
  const total = framesContenido(segmentos);
  const enfoque = recorte.enfoque ?? 0.5;
  const bloques = bloquesDelRecorte(pistas.subtitulos, segmentos);
  const ramp = Math.round(fps / 10);
  return (
    <Contexto.Provider value={{ estilo, base }}>
      <AbsoluteFill style={{ backgroundColor: estilo.colores.fondo }}>
        {segmentos.map((seg) => (
          <Sequence key={seg.salida} from={seg.salida} durationInFrames={seg.hasta - seg.desde} name={`tramo ${seg.salida}`}>
            <TramoVertical timeline={timeline} seg={seg} base={base} enfoque={enfoque} />
          </Sequence>
        ))}
        {pistas.mezcla &&
          segmentos.map((seg, i) => {
            const largo = seg.hasta - seg.desde;
            const ultimo = i === segmentos.length - 1;
            const salida = ultimo ? fps / 2 : ramp;
            return (
              <Sequence key={`a${seg.salida}`} from={seg.salida} durationInFrames={largo} layout="none">
                <Html5Audio
                  src={resolverSrc(pistas.mezcla!.src, base, pistas.mezcla!.huella)}
                  trimBefore={seg.desde}
                  volume={(f) => dbAGanancia(pistas.mezcla!.volumen_db ?? 0) * Math.max(0, Math.min(1, f / ramp, (largo - f) / salida))}
                />
              </Sequence>
            );
          })}
        <Sequence from={0} durationInFrames={Math.max(1, total)} layout="none">
          <SubtitulosVertical bloques={bloques} resaltar={estilo.subtitulos.resaltar_palabra_actual} />
          <MarcaCanal posicion={{ top: 210, right: 60 }} />
        </Sequence>
        <Sequence from={total} durationInFrames={Math.max(1, recorte.cierre.frames)} name="cierre">
          <CierreRecorte texto={recorte.cierre.texto} subtexto={recorte.cierre.subtexto} tipo={recorte.tipo} />
        </Sequence>
      </AbsoluteFill>
    </Contexto.Provider>
  );
}
