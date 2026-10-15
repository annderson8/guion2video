import { Composition, Still } from "remotion";
import { Video } from "./Video.tsx";
import { Vertical } from "./Vertical.tsx";
import { ALTO_VERTICAL, ANCHO_VERTICAL, framesContenido, segmentosRecorte } from "./recorte.ts";
import { Miniatura } from "./componentes/Miniatura.tsx";
import { LlamadoSuscripcion } from "./componentes/LlamadoSuscripcion.tsx";
import { TIMELINE_DEMO } from "./demo.ts";
import { ESTILO_POR_DEFECTO } from "./contexto.tsx";
import type { PropsMiniatura, PropsVertical, PropsVideo } from "./tipos.ts";
import type { PropsLlamado } from "./componentes/LlamadoSuscripcion.tsx";

const metadatos = ({ props }: { props: PropsVideo }) => ({
  durationInFrames: Math.max(1, props.timeline.duracion_frames),
  fps: props.timeline.fps,
  width: props.timeline.ancho,
  height: props.timeline.alto,
});

const LlamadoEstudio = (props: Record<string, unknown>) => <LlamadoSuscripcion {...(props as unknown as PropsLlamado)} />;

const metadatosVertical = ({ props }: { props: PropsVertical }) => ({
  durationInFrames: Math.max(1, framesContenido(segmentosRecorte(props.timeline, props.recorte.desde, props.recorte.hasta)) + props.recorte.cierre.frames),
  fps: props.timeline.fps,
  width: ANCHO_VERTICAL,
  height: ALTO_VERTICAL,
});

const RECORTE_DEMO: PropsVertical["recorte"] = { tipo: "short", desde: 0, hasta: 150, cierre: { texto: "Mira el video completo en el canal", subtexto: "@RendimientoGarantizado", frames: 90 } };

export function Root() {
  return (
    <>
      <Composition
        id="Video"
        component={Video}
        defaultProps={{ timeline: TIMELINE_DEMO } satisfies PropsVideo}
        calculateMetadata={metadatos}
        durationInFrames={TIMELINE_DEMO.duracion_frames}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="Vertical"
        component={Vertical}
        defaultProps={{ timeline: TIMELINE_DEMO, recorte: RECORTE_DEMO } satisfies PropsVertical}
        calculateMetadata={metadatosVertical}
        durationInFrames={240}
        fps={30}
        width={ANCHO_VERTICAL}
        height={ALTO_VERTICAL}
      />
      <Composition
        id="Demo"
        component={Video}
        defaultProps={{ timeline: TIMELINE_DEMO } satisfies PropsVideo}
        durationInFrames={TIMELINE_DEMO.duracion_frames}
        fps={30}
        width={1920}
        height={1080}
      />
      {/* Vista suelta del llamado a suscribirse, para ajustarlo en el Studio (pnpm studio). */}
      <Composition
        id="Llamado"
        component={LlamadoEstudio}
        defaultProps={{ canal: "@RendimientoGarantizado", titulo: "Título del video", clics: { suscribir: 70, like: 125 }, duracion: 210 } satisfies PropsLlamado}
        durationInFrames={210}
        fps={30}
        width={1920}
        height={1080}
      />
      <Still
        id="Miniatura"
        component={Miniatura}
        width={1280}
        height={720}
        defaultProps={{ titulo: "La pirámide que enloqueció a un país", resaltado: "pirámide", estilo: ESTILO_POR_DEFECTO } satisfies PropsMiniatura}
      />
    </>
  );
}
