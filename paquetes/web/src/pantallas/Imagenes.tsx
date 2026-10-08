import { useState } from "react";
import { api, archivo, usd } from "../api.ts";
import { useDatos } from "../ganchos.ts";
import { useProyecto } from "./Proyecto.tsx";

interface ItemImagen {
  id: string;
  escena: string;
  tipo: "imagen_ia" | "archivo";
  prompt: string;
  calidad: "estandar" | "premium";
  texto: string;
  parte: string;
  aprobada: boolean;
  meta?: { archivo: string; archivo_huella: string; origen: string; proveedor?: string; costo_usd: number; ancho_original: number; alto_original: number; cache: boolean; fuente?: string };
}

export function Imagenes() {
  const { slug, version, detalle, lanzar, recargar, ocupado } = useProyecto();
  const { datos, error, recargar: recargarImagenes } = useDatos<ItemImagen[]>(`/proyectos/${slug}/imagenes`, [version]);
  const [soloPendientes, setSoloPendientes] = useState(false);
  const estado = detalle.estados.find((e) => e.nombre === "imagenes");
  const est = detalle.estimacion.find((e) => e.nombre === "imagenes");
  const aprobar = async (unidades?: string[]) => {
    await api.post(`/proyectos/${slug}/aprobar`, { paso: "imagenes", unidades });
    await recargarImagenes();
    await recargar();
  };
  if (error) return <div className="vacio">Aún no hay escenas.</div>;
  const lista = datos?.filter((x) => !soloPendientes || !x.aprobada) ?? [];
  const aprobadas = datos?.filter((x) => x.aprobada).length ?? 0;
  return (
    <div className="rejilla">
      <div className="fila">
        <h2>Imágenes</h2>
        <span style={{ color: "var(--texto-3)" }}>{aprobadas}/{datos?.length ?? 0} aprobadas</span>
        <label className="fila" style={{ display: "flex", width: "auto", gap: 6 }}>
          <input type="checkbox" style={{ width: "auto" }} checked={soloPendientes} onChange={(e) => setSoloPendientes(e.target.checked)} /> solo pendientes
        </label>
        <span className="espacio" />
        {estado && estado.estado !== "al_dia" && estado.estado !== "revision" && (
          <button className="boton" disabled={ocupado} onClick={() => lanzar("/ejecutar", { hasta: "imagenes" })}>
            Generar imágenes {est && est.costo_usd > 0 ? `(≈ ${usd(est.costo_usd)})` : ""}
          </button>
        )}
        <button className="boton primario" disabled={ocupado || !datos?.some((x) => x.meta && !x.aprobada)} onClick={() => aprobar()}>Aprobar todas</button>
      </div>
      <div className="imagenes">
        {lista.map((x) => (
          <TarjetaImagen key={x.id + (x.meta?.archivo_huella ?? "")} img={x} alCambiar={async () => { await recargarImagenes(); await recargar(); }} alAprobar={() => aprobar([x.id])} />
        ))}
      </div>
    </div>
  );
}

function TarjetaImagen({ img, alCambiar, alAprobar }: { img: ItemImagen; alCambiar: () => Promise<void>; alAprobar: () => void }) {
  const { slug, lanzar, ocupado } = useProyecto();
  const [prompt, setPrompt] = useState(img.prompt);
  const [editando, setEditando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const guardarPrompt = async (calidad?: "estandar" | "premium") => {
    try {
      await api.patch(`/proyectos/${slug}/imagenes/${img.id}`, { prompt, ...(calidad ? { calidad } : {}) });
      setEditando(false);
      await alCambiar();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const subir = async (archivoLocal?: File) => {
    if (!archivoLocal) return;
    const fuente = img.tipo === "archivo" ? (window.prompt("Fuente y licencia de la imagen (aparece en los créditos):") ?? "") : "";
    const form = new FormData();
    form.append("fuente", fuente);
    form.append("archivo", archivoLocal);
    try {
      await api.post(`/proyectos/${slug}/imagenes/${img.id}/archivo`, form);
      await alCambiar();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const m = img.meta;
  return (
    <div className={`imagen ${img.aprobada ? "aprobada" : ""}`}>
      <div className="marco">
        {m ? <img src={archivo(slug, m.archivo, m.archivo_huella)} loading="lazy" alt={img.prompt} /> : <span style={{ color: "var(--texto-3)" }}>{img.tipo === "archivo" ? "Sube la imagen de archivo" : "Sin generar"}</span>}
        <span className="sello">{img.aprobada ? <span className="chip al_dia">aprobada</span> : m ? <span className="chip revision">por revisar</span> : null}</span>
      </div>
      <div className="cuerpo">
        <div className="fila">
          <span className="id mono" style={{ color: "var(--acento)" }}>{img.id}</span>
          <span className={`tipo ${img.calidad === "premium" ? "grafico" : ""}`}>{img.calidad}</span>
          <span className="espacio" />
          {m && <span className="mono" style={{ color: "var(--texto-3)", fontSize: 11.5 }}>{m.origen === "usuario" ? "propia" : m.proveedor} · {m.ancho_original}px{m.cache ? " · caché" : ""}</span>}
        </div>
        <div className="texto">{img.texto}</div>
        {editando ? (
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} />
        ) : (
          <div style={{ fontSize: 13, color: "var(--texto-2)" }}>{img.prompt}</div>
        )}
        {error && <div className="mensaje">{error}</div>}
        <div className="fila">
          {editando ? (
            <>
              <button className="boton primario chico" onClick={() => guardarPrompt()}>Guardar prompt</button>
              <button className="boton chico" onClick={() => { setEditando(false); setPrompt(img.prompt); }}>Cancelar</button>
            </>
          ) : (
            <>
              {m && !img.aprobada && <button className="boton primario chico" onClick={alAprobar}>Aprobar</button>}
              {img.tipo === "imagen_ia" && <button className="boton chico" disabled={ocupado} onClick={() => lanzar("/regenerar", { paso: "imagenes", unidades: [img.id] })}>Regenerar</button>}
              {img.tipo === "imagen_ia" && <button className="boton chico" onClick={() => setEditando(true)}>Editar prompt</button>}
              <label className="boton chico">
                Subir mi imagen
                <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => subir(e.target.files?.[0])} />
              </label>
              {img.tipo === "imagen_ia" && img.calidad !== "premium" && <button className="boton chico" title="Usar el proveedor premium" onClick={() => guardarPrompt("premium")}>Premium</button>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
