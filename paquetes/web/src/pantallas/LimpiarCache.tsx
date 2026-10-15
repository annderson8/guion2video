import { useState } from "react";
import { api } from "../api.ts";

interface ResumenCache {
  archivos: number;
  bytes: number;
  liberable_bytes: number;
  por_tipo: Record<string, { archivos: number; bytes: number }>;
}

const mb = (n: number) => (n >= 1073741824 ? `${(n / 1073741824).toFixed(2)} GB` : `${(n / 1048576).toFixed(1)} MB`);
const NOMBRES: Record<string, string> = { voz: "voz", imagenes: "imágenes", llm: "respuestas de Claude" };

/** Botón «Limpiar caché»: muestra qué se pierde y cuánto espacio libera, y solo borra si se confirma. */
export function LimpiarCache({ slug, deshabilitado }: { slug: string; deshabilitado: boolean }) {
  const [resumen, setResumen] = useState<ResumenCache | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);

  const abrir = async () => {
    setError(null);
    setHecho(null);
    try {
      setResumen(await api.get<ResumenCache>(`/proyectos/${slug}/cache`));
      setAbierto(true);
    } catch (e) {
      setError((e as Error).message);
      setAbierto(true);
    }
  };

  const borrar = async () => {
    setTrabajando(true);
    setError(null);
    try {
      const r = await api.post<ResumenCache>(`/proyectos/${slug}/cache/limpiar`);
      setHecho(`Caché borrada: se liberaron ${mb(r.liberable_bytes)}.`);
      setResumen(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <>
      <button className="boton chico" disabled={deshabilitado} onClick={() => void abrir()} title="Borra lo guardado para no volver a pagar voz, imágenes y respuestas de Claude">
        Limpiar caché
      </button>
      {abierto && (
        <div className="modal-fondo" onClick={() => !trabajando && setAbierto(false)}>
          <div className="modal panel" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3>Limpiar la caché del proyecto</h3>
            {error && <div className="mensaje">{error}</div>}
            {hecho && <div className="mensaje ok">{hecho}</div>}
            {resumen && !resumen.archivos && <div className="mensaje info">La caché de este proyecto ya está vacía.</div>}
            {resumen && resumen.archivos > 0 && (
              <>
                <div className="mensaje info">
                  <strong>Advertencia:</strong> se borra todo lo que el proyecto guardó para no volver a pagar. Los archivos del proyecto (audio, imágenes, video) no se tocan,
                  pero si después regeneras escenas, imágenes o respuestas de Claude, <strong>se volverán a cobrar</strong>. Esta acción no se puede deshacer.
                </div>
                <div style={{ display: "grid", gap: 4, fontSize: 13 }}>
                  {Object.entries(resumen.por_tipo).map(([tipo, x]) => (
                    <div key={tipo} className="fila">
                      <span style={{ width: 170 }}>{NOMBRES[tipo] ?? tipo}</span>
                      <span className="mono">{x.archivos} archivos · {mb(x.bytes)}</span>
                    </div>
                  ))}
                  <div className="fila" style={{ marginTop: 6 }}>
                    <strong style={{ width: 170 }}>Espacio que se libera</strong>
                    <strong className="mono">{mb(resumen.liberable_bytes)}</strong>
                  </div>
                  {resumen.liberable_bytes < resumen.bytes && (
                    <div style={{ color: "var(--texto-3)", fontSize: 12.5 }}>
                      La caché pesa {mb(resumen.bytes)}, pero parte de esos archivos sigue en uso en audio/ e imagenes/, así que no se libera.
                    </div>
                  )}
                </div>
              </>
            )}
            <div className="fila" style={{ justifyContent: "flex-end", marginTop: 8 }}>
              <button className="boton" disabled={trabajando} onClick={() => setAbierto(false)}>{resumen && resumen.archivos > 0 && !hecho ? "Cancelar" : "Cerrar"}</button>
              {resumen && resumen.archivos > 0 && !hecho && (
                <button className="boton peligro" disabled={trabajando} onClick={() => void borrar()}>
                  {trabajando ? "Borrando…" : "Sí, borrar caché"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {!abierto && error && <span style={{ color: "#ff8b78", fontSize: 12.5 }}>{error}</span>}
    </>
  );
}
