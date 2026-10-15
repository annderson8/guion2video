import { useState } from "react";
import { api } from "../api.ts";

interface ResumenVideo {
  archivos: { nombre: string; descripcion: string; bytes: number }[];
  bytes: number;
}

const mb = (n: number) => (n >= 1073741824 ? `${(n / 1073741824).toFixed(2)} GB` : `${(n / 1048576).toFixed(1)} MB`);

/** Botón «Borrar video final»: libera el espacio del MP4 (se rehace con el render, que es local y gratis). */
export function BorrarVideo({ slug, deshabilitado, alBorrar }: { slug: string; deshabilitado: boolean; alBorrar: () => void }) {
  const [resumen, setResumen] = useState<ResumenVideo | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);

  const abrir = async () => {
    setError(null);
    setHecho(null);
    try {
      setResumen(await api.get<ResumenVideo>(`/proyectos/${slug}/video-final`));
    } catch (e) {
      setError((e as Error).message);
    }
    setAbierto(true);
  };

  const borrar = async () => {
    setTrabajando(true);
    setError(null);
    try {
      const r = await api.post<ResumenVideo>(`/proyectos/${slug}/video-final/borrar`);
      setHecho(`Videos borrados: se liberaron ${mb(r.bytes)}.`);
      setResumen(null);
      alBorrar();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTrabajando(false);
    }
  };

  const hay = !!resumen && resumen.archivos.length > 0;
  return (
    <>
      <button className="boton chico" disabled={deshabilitado} onClick={() => void abrir()} title="Borra video.mp4 para liberar espacio; se rehace con el render">
        Borrar video final
      </button>
      {abierto && (
        <div className="modal-fondo" onClick={() => !trabajando && setAbierto(false)}>
          <div className="modal panel" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3>Borrar el video final</h3>
            {error && <div className="mensaje">{error}</div>}
            {hecho && <div className="mensaje ok">{hecho}</div>}
            {resumen && !hay && !hecho && <div className="mensaje info">Este proyecto no tiene videos renderizados que borrar.</div>}
            {hay && (
              <>
                <div className="mensaje info">
                  <strong>Advertencia:</strong> si todavía no lo has subido a YouTube, <strong>no lo borres</strong>. Se puede rehacer con «Render y publicación», pero el render tarda
                  (unos 20 minutos en un video largo), aunque no cuesta nada. Esta acción no se puede deshacer.
                </div>
                <div style={{ display: "grid", gap: 4, fontSize: 13 }}>
                  {resumen.archivos.map((a) => (
                    <div key={a.nombre} className="fila">
                      <span className="mono" style={{ width: 120 }}>{a.nombre}</span>
                      <span style={{ flex: 1, color: "var(--texto-2)" }}>{a.descripcion}</span>
                      <span className="mono">{mb(a.bytes)}</span>
                    </div>
                  ))}
                  <div className="fila" style={{ marginTop: 6 }}>
                    <strong style={{ width: 120 }}>Se liberan</strong>
                    <strong className="mono">{mb(resumen.bytes)}</strong>
                  </div>
                </div>
                <div style={{ color: "var(--texto-3)", fontSize: 12.5 }}>
                  No se tocan los subtítulos, la miniatura, la descripción, el guion, la voz ni las imágenes. Los Shorts y Reels tampoco. El paso «Render final» quedará pendiente de rehacer.
                </div>
              </>
            )}
            <div className="fila" style={{ justifyContent: "flex-end", marginTop: 8 }}>
              <button className="boton" disabled={trabajando} onClick={() => setAbierto(false)}>{hay && !hecho ? "Cancelar" : "Cerrar"}</button>
              {hay && !hecho && (
                <button className="boton peligro" disabled={trabajando} onClick={() => void borrar()}>
                  {trabajando ? "Borrando…" : "Sí, borrar el video"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
