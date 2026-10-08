import { api, archivo } from "../api.ts";
import { useDatos } from "../ganchos.ts";
import { useProyecto } from "./Proyecto.tsx";

interface ItemVoz { escena: string; parte: string; texto: string; archivo?: string; archivo_huella?: string; duracion_ms?: number; texto_hablado?: string; proveedor?: string; cache?: boolean }

export function Voz() {
  const { slug, version, detalle, lanzar, recargar, ocupado } = useProyecto();
  const { datos, error } = useDatos<ItemVoz[]>(`/proyectos/${slug}/voz`, [version]);
  const estado = detalle.estados.find((e) => e.nombre === "voz");
  const total = datos?.reduce((s, v) => s + (v.duracion_ms ?? 0), 0) ?? 0;
  if (error) return <div className="vacio">Aún no hay escenas.</div>;
  return (
    <div className="rejilla">
      <div className="fila">
        <h2>Voz por escena</h2>
        <span style={{ color: "var(--texto-3)" }}>{(total / 60000).toFixed(1)} min · {estado?.resumen}</span>
        <span className="espacio" />
        {estado?.estado !== "al_dia" && estado?.estado !== "revision" && (
          <button className="boton" disabled={ocupado} onClick={() => lanzar("/ejecutar", { hasta: "voz" })}>Generar voz</button>
        )}
        {estado?.estado === "revision" && (
          <button className="boton primario" onClick={async () => { await api.post(`/proyectos/${slug}/aprobar`, { paso: "voz" }); await recargar(); }}>
            Aprobar toda la voz
          </button>
        )}
      </div>
      <p style={{ color: "var(--texto-3)", margin: 0 }}>Escucha cada escena. Si una suena mal, regenera solo esa: las demás no se tocan ni se vuelven a pagar.</p>
      <div className="tarjetas">
        {datos?.map((v) => (
          <div key={v.escena} className="panel escena">
            <div className="cab">
              <span className="id">{v.escena}</span>
              <span className="parte">{v.parte}</span>
              <span className="espacio" />
              {v.duracion_ms ? <span className="mono" style={{ color: "var(--texto-3)" }}>{(v.duracion_ms / 1000).toFixed(1)} s</span> : <span className="chip pendiente">sin generar</span>}
              <button className="boton chico" disabled={ocupado || !v.archivo} onClick={() => lanzar("/regenerar", { paso: "voz", unidades: [v.escena] })}>Regenerar</button>
            </div>
            <div>{v.texto}</div>
            {v.texto_hablado && v.texto_hablado !== v.texto && <div style={{ color: "var(--texto-3)", fontSize: 12.5 }}>Se pronuncia: {v.texto_hablado}</div>}
            {v.archivo && <audio controls preload="none" src={archivo(slug, v.archivo, v.archivo_huella)} />}
          </div>
        ))}
      </div>
    </div>
  );
}
