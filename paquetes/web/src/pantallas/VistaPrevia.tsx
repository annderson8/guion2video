import { Player } from "@remotion/player";
import { Video, type Timeline } from "@guion2video/render";
import { archivo } from "../api.ts";
import { useDatos } from "../ganchos.ts";
import { useProyecto } from "./Proyecto.tsx";

/** Remotion Player embebido: el video completo sin renderizar, leyendo los archivos del proyecto. */
export function VistaPrevia() {
  const { slug, version, detalle, lanzar, ocupado } = useProyecto();
  const { datos: timeline, error } = useDatos<Timeline>(`/proyectos/${slug}/timeline`, [version]);
  const pub = useDatos<{ archivos: Record<string, boolean> }>(`/proyectos/${slug}/publicacion`, [version]);
  const comp = detalle.estados.find((e) => e.nombre === "composicion");
  return (
    <div className="rejilla">
      <div className="fila">
        <h2>Vista previa</h2>
        {comp && comp.estado !== "al_dia" && <span className={`chip ${comp.estado}`}>composición {comp.estado === "obsoleto" ? "desactualizada" : comp.estado}</span>}
        <span className="espacio" />
        <button className="boton" disabled={ocupado} onClick={() => lanzar("/ejecutar", { hasta: "composicion" })}>Actualizar composición</button>
        <button className="boton" disabled={ocupado} onClick={() => lanzar("/preview", {})}>Render 540p</button>
      </div>
      {error || !timeline ? (
        <div className="vacio">{error ? "Aún no hay composición. Aprueba voz e imágenes y ejecuta la composición." : "Cargando…"}</div>
      ) : (
        <div className="reproductor">
          <Player
            component={Video}
            inputProps={{ timeline, base: `/api/proyectos/${slug}/archivos` }}
            durationInFrames={Math.max(1, timeline.duracion_frames)}
            fps={timeline.fps}
            compositionWidth={timeline.ancho}
            compositionHeight={timeline.alto}
            style={{ width: "100%", aspectRatio: `${timeline.ancho} / ${timeline.alto}` }}
            controls
            acknowledgeRemotionLicense
          />
        </div>
      )}
      {timeline && (
        <div className="panel">
          <h3 style={{ marginBottom: 8 }}>Partes</h3>
          <div className="fila">
            {timeline.partes.map((p) => (
              <span key={p.desde} className="tipo">
                {new Date((p.desde / timeline.fps) * 1000).toISOString().slice(14, 19)} · {p.titulo}
              </span>
            ))}
          </div>
        </div>
      )}
      {pub.datos?.archivos["preview.mp4"] && (
        <div className="panel rejilla">
          <h3>Render de vista previa (540p)</h3>
          <video controls src={archivo(slug, "salida/preview.mp4", String(version))} style={{ width: "100%", borderRadius: 8 }} />
        </div>
      )}
    </div>
  );
}
