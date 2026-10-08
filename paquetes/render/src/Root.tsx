import { Composition, Still } from "remotion";
import { Video } from "./Video.tsx";
import { Miniatura } from "./componentes/Miniatura.tsx";
import { TIMELINE_DEMO } from "./demo.ts";
import { ESTILO_POR_DEFECTO } from "./contexto.tsx";
import type { PropsMiniatura, PropsVideo } from "./tipos.ts";

const metadatos = ({ props }: { props: PropsVideo }) => ({
  durationInFrames: Math.max(1, props.timeline.duracion_frames),
  fps: props.timeline.fps,
  width: props.timeline.ancho,
  height: props.timeline.alto,
});

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
        id="Demo"
        component={Video}
        defaultProps={{ timeline: TIMELINE_DEMO } satisfies PropsVideo}
        durationInFrames={TIMELINE_DEMO.duracion_frames}
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
