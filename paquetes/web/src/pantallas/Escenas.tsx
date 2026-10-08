import { useEffect, useState } from "react";
import { api } from "../api.ts";
import { useDatos } from "../ganchos.ts";
import { useProyecto } from "./Proyecto.tsx";

interface Imagen { id: string; prompt: string; calidad: string; movimiento: string }
interface Escena {
  id: string;
  parte: string;
  texto_narracion: string;
  nota_visual?: string;
  tipo_visual: string;
  imagenes: Imagen[];
  grafico?: Record<string, unknown>;
  ambiente: { musica: string; efectos: string[] };
  duracion_estimada_s?: number;
}

const GRAFICOS = ["cifra", "linea_tiempo", "mapa", "comparacion", "documento", "cita", "titulo_parte"];
const TIPOS = ["imagen_ia", "archivo", ...GRAFICOS];
const PLANTILLAS: Record<string, Record<string, unknown>> = {
  cifra: { tipo: "cifra", valor: 0, etiqueta: "" },
  linea_tiempo: { tipo: "linea_tiempo", eventos: [{ fecha: "", texto: "" }] },
  mapa: { tipo: "mapa", pais: "CO", resaltar: [], etiqueta: "" },
  comparacion: { tipo: "comparacion", a: { valor: 0, etiqueta: "" }, b: { valor: 0, etiqueta: "" } },
  documento: { tipo: "documento", titulo: "", cuerpo: "" },
  cita: { tipo: "cita", texto: "" },
  titulo_parte: { tipo: "titulo_parte", titulo: "" },
};

export function Escenas() {
  const { slug, version, detalle, recargar } = useProyecto();
  const guion = useDatos<{ fuente: string; estructurado: { fuentes: string[]; palabras: number } | null }>(`/proyectos/${slug}/guion`, [version]);
  const escenas = useDatos<{ escenas: Escena[]; biblia?: { personas_reales: string[] } }>(`/proyectos/${slug}/escenas`, [version]);
  const [filtro, setFiltro] = useState("");
  const estadoEscenas = detalle.estados.find((e) => e.nombre === "escenas");
  const estadoGuion = detalle.estados.find((e) => e.nombre === "guion");
  const aprobar = async (paso: string) => {
    await api.post(`/proyectos/${slug}/aprobar`, { paso });
    await recargar();
  };
  const lista = escenas.datos?.escenas.filter((e) => !filtro || e.tipo_visual === filtro || e.parte === filtro) ?? [];
  const graficos = escenas.datos ? escenas.datos.escenas.filter((e) => e.texto_narracion && GRAFICOS.includes(e.tipo_visual)).length / Math.max(1, escenas.datos.escenas.filter((e) => e.texto_narracion).length) : 0;
  return (
    <div className="rejilla dos" style={{ alignItems: "start" }}>
      <div className="panel rejilla" style={{ position: "sticky", top: 80 }}>
        <div className="fila">
          <h2>Guion</h2>
          <span className="espacio" />
          {estadoGuion?.estado === "revision" && <button className="boton primario chico" onClick={() => aprobar("guion")}>Aprobar guion</button>}
        </div>
        {guion.datos?.estructurado && (
          <div style={{ color: "var(--texto-2)", fontSize: 12.5 }}>
            {guion.datos.estructurado.palabras} palabras · {guion.datos.estructurado.fuentes.length} fuentes
          </div>
        )}
        <pre className="descripcion" style={{ maxHeight: "70vh" }}>{guion.datos?.fuente ?? "…"}</pre>
      </div>
      <div className="rejilla">
        <div className="fila">
          <h2>Escenas</h2>
          {escenas.datos && <span style={{ color: "var(--texto-3)" }}>{escenas.datos.escenas.length} escenas · {(graficos * 100).toFixed(0)} % gráficos</span>}
          <span className="espacio" />
          <select style={{ width: 180 }} value={filtro} onChange={(e) => setFiltro(e.target.value)}>
            <option value="">Todas</option>
            {[...new Set(escenas.datos?.escenas.map((e) => e.parte))].map((p) => <option key={p} value={p}>{p}</option>)}
            {TIPOS.map((t) => <option key={t} value={t}>tipo: {t}</option>)}
          </select>
          {estadoEscenas?.estado === "revision" && <button className="boton primario chico" onClick={() => aprobar("escenas")}>Aprobar escenas</button>}
        </div>
        {escenas.error && <div className="vacio">Aún no hay escenas. Ejecuta el paso "Escenas" desde el resumen.</div>}
        {escenas.datos?.biblia?.personas_reales?.length ? (
          <div className="mensaje info">Personas reales detectadas (nunca con rostro realista): {escenas.datos.biblia.personas_reales.join(", ")}</div>
        ) : null}
        <div className="tarjetas">
          {lista.map((e) => (
            <TarjetaEscena key={e.id + version} escena={e} alGuardar={escenas.recargar} />
          ))}
        </div>
      </div>
    </div>
  );
}

function TarjetaEscena({ escena, alGuardar }: { escena: Escena; alGuardar: () => Promise<void> }) {
  const { slug, recargar } = useProyecto();
  const [e, setE] = useState(escena);
  const [grafico, setGrafico] = useState(JSON.stringify(escena.grafico ?? {}, null, 2));
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  useEffect(() => setE(escena), [escena]);
  const cambiado = JSON.stringify(e) !== JSON.stringify(escena) || grafico !== JSON.stringify(escena.grafico ?? {}, null, 2);
  const esGrafico = GRAFICOS.includes(e.tipo_visual);
  const guardar = async () => {
    setError(null);
    try {
      const cambios: Partial<Escena> = { texto_narracion: e.texto_narracion, tipo_visual: e.tipo_visual, imagenes: e.imagenes, ambiente: e.ambiente };
      if (esGrafico) cambios.grafico = JSON.parse(grafico);
      else cambios.grafico = undefined;
      await api.patch(`/proyectos/${slug}/escenas/${e.id}`, cambios);
      setGuardado(true);
      setTimeout(() => setGuardado(false), 1500);
      await alGuardar();
      await recargar();
    } catch (err) {
      setError((err as Error).message);
    }
  };
  const cambiarTipo = (tipo: string) => {
    setE({ ...e, tipo_visual: tipo, imagenes: tipo === "imagen_ia" || tipo === "archivo" ? (e.imagenes.length ? e.imagenes : [{ id: `${e.id}-a`, prompt: e.nota_visual ?? "", calidad: "estandar", movimiento: "zoom_lento_entrada" }]) : e.imagenes });
    if (GRAFICOS.includes(tipo)) setGrafico(JSON.stringify(PLANTILLAS[tipo], null, 2));
  };
  return (
    <div className="panel escena">
      <div className="cab">
        <span className="id">{e.id}</span>
        <span className={`tipo ${esGrafico ? "grafico" : ""}`}>{e.tipo_visual}</span>
        <span className="parte">{e.parte}</span>
        <span className="espacio" />
        {e.duracion_estimada_s ? <span className="mono" style={{ color: "var(--texto-3)" }}>≈{e.duracion_estimada_s.toFixed(0)} s</span> : null}
      </div>
      {e.texto_narracion || e.tipo_visual !== "titulo_parte" ? (
        <textarea value={e.texto_narracion} onChange={(x) => setE({ ...e, texto_narracion: x.target.value })} rows={3} />
      ) : null}
      {e.nota_visual && <div style={{ color: "var(--texto-3)", fontSize: 12.5 }}>Nota: {e.nota_visual}</div>}
      <div className="fila">
        <label style={{ width: 180 }}>
          Tipo visual
          <select value={e.tipo_visual} onChange={(x) => cambiarTipo(x.target.value)}>
            {TIPOS.map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
        <label style={{ width: 160 }}>
          Música
          <input value={e.ambiente.musica} onChange={(x) => setE({ ...e, ambiente: { ...e.ambiente, musica: x.target.value } })} />
        </label>
        <label style={{ flex: 1 }}>
          Efectos (separados por coma)
          <input value={e.ambiente.efectos.join(", ")} onChange={(x) => setE({ ...e, ambiente: { ...e.ambiente, efectos: x.target.value.split(",").map((s) => s.trim()).filter(Boolean) } })} />
        </label>
      </div>
      {esGrafico ? (
        <label>
          Datos del gráfico (JSON)
          <textarea className="mono" value={grafico} onChange={(x) => setGrafico(x.target.value)} rows={5} />
        </label>
      ) : (
        e.imagenes.map((img, i) => (
          <label key={img.id}>
            {img.id} · {img.movimiento} · {img.calidad}
            <textarea value={img.prompt} rows={2} onChange={(x) => setE({ ...e, imagenes: e.imagenes.map((y, j) => (j === i ? { ...y, prompt: x.target.value } : y)) })} />
          </label>
        ))
      )}
      {(cambiado || error || guardado) && (
        <div className="fila">
          {error && <div className="mensaje" style={{ flex: 1 }}>{error}</div>}
          {guardado && <span style={{ color: "var(--ok)" }}>Guardado</span>}
          <span className="espacio" />
          {cambiado && <button className="boton chico" onClick={() => { setE(escena); setGrafico(JSON.stringify(escena.grafico ?? {}, null, 2)); }}>Descartar</button>}
          {cambiado && <button className="boton primario chico" onClick={guardar}>Guardar</button>}
        </div>
      )}
    </div>
  );
}
