import { useState } from "react";
import { api, usd } from "../api.ts";
import { useProyecto } from "./Proyecto.tsx";

const ETIQUETAS: Record<string, string> = { al_dia: "al día", revision: "por revisar", obsoleto: "obsoleto", pendiente: "pendiente", error: "error", bloqueado: "bloqueado" };
const PESTANA: Record<string, string> = { guion: "escenas", escenas: "escenas", voz: "voz", imagenes: "imagenes", render: "publicacion", publicacion: "publicacion" };

export function Resumen() {
  const { slug, detalle, lanzar, recargar, ocupado } = useProyecto();
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const aprobarPaso = async (paso: string) => {
    try {
      const r = await api.post<{ mensaje: string }>(`/proyectos/${slug}/aprobar`, { paso });
      setMensaje({ tipo: "ok", texto: r.mensaje });
      await recargar();
    } catch (e) {
      setMensaje({ tipo: "error", texto: (e as Error).message });
    }
  };
  const estimacion = Object.fromEntries(detalle.estimacion.map((e) => [e.nombre, e]));
  return (
    <div className="rejilla">
      {mensaje && <div className={`mensaje ${mensaje.tipo === "ok" ? "ok" : ""}`}>{mensaje.texto}</div>}
      <div className="pasos">
        {detalle.estados.map((e, i) => {
          const est = estimacion[e.nombre];
          const puedeEjecutar = e.estado !== "al_dia" && e.estado !== "revision";
          return (
            <div key={e.nombre} className="paso">
              <span className="numero">{i + 1}</span>
              <strong>{e.titulo}</strong>
              <span className={`chip ${e.estado}`}>{ETIQUETAS[e.estado]}</span>
              <div className="detalle">
                {e.estado === "error" ? (
                  <div className="error">{e.error}</div>
                ) : (
                  <>
                    <div>{e.motivo ?? e.resumen ?? ""}</div>
                    {puedeEjecutar && est && est.costo_usd > 0 && (
                      <div className="mono" style={{ color: "var(--acento)" }}>
                        ≈ {usd(est.costo_usd)} · {est.pendientes}/{est.unidades} por generar {est.detalle && `(${est.detalle})`}
                      </div>
                    )}
                    {e.avisos?.map((a, j) => (
                      <div key={j} className="aviso">! {a}</div>
                    ))}
                  </>
                )}
              </div>
              <div className="fila">
                {e.estado === "revision" && PESTANA[e.nombre] && <a className="boton chico" href={`#/p/${slug}/${PESTANA[e.nombre]}`}>Revisar</a>}
                {e.estado === "revision" && (
                  <button className="boton primario chico" disabled={ocupado} onClick={() => aprobarPaso(e.nombre)}>
                    Aprobar
                  </button>
                )}
                {(puedeEjecutar || e.estado === "error") && (
                  <button className="boton chico" disabled={ocupado} onClick={() => lanzar("/ejecutar", { hasta: e.nombre })}>
                    Ejecutar hasta aquí
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p style={{ color: "var(--texto-3)", fontSize: 12.5 }}>
        Cada paso guarda la huella de sus entradas: si nada cambió no se vuelve a ejecutar ni a pagar. Los pasos marcados como "por revisar" detienen la cadena hasta que los apruebes.
      </p>
    </div>
  );
}
