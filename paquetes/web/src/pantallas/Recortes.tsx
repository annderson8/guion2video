import { useMemo, useState } from "react";
import { Player } from "@remotion/player";
import { Vertical, framesContenido, segmentosRecorte, type RecorteVertical, type Timeline } from "@guion2video/render";
import { api, archivo } from "../api.ts";
import { useAccion, useDatos } from "../ganchos.ts";
import { useProyecto } from "./Proyecto.tsx";

type Tipo = "short" | "reel";
type EstadoRecorte = "pendiente" | "al_dia" | "obsoleto";

interface InfoRecorte {
  recorte: { id: string; tipo: Tipo; titulo?: string; desde_s: number; hasta_s: number; enfoque?: number };
  estado: EstadoRecorte;
  duracion_s?: number;
  errores: string[];
  avisos: string[];
  desfasado: boolean;
  archivo?: string;
}

interface DatosRecortes {
  cierre_s: number;
  cierre: Record<Tipo, { texto: string; subtexto?: string }>;
  recortes: InfoRecorte[];
  video: { duracion_s: number; llamado: { desde_s: number; hasta_s: number } | null; bloques: { desde_s: number; hasta_s: number; texto: string }[] } | null;
}

const reloj = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
const ETIQUETA: Record<EstadoRecorte, string> = { al_dia: "renderizado", obsoleto: "desactualizado", pendiente: "sin renderizar" };

/** Shorts y Reels (9:16) sacados del video: eliges de qué segundo a cuál y se renderizan con el mismo audio y las mismas imágenes. */
export function Recortes() {
  const { slug, version, lanzar, ocupado } = useProyecto();
  const { datos, error, recargar } = useDatos<DatosRecortes>(`/proyectos/${slug}/recortes`, [version]);
  const { datos: timeline } = useDatos<Timeline>(datos?.video ? `/proyectos/${slug}/timeline` : null, [version]);
  const { ocupado: guardando, error: errorAccion, ejecutar } = useAccion();

  const [tipo, setTipo] = useState<Tipo>("short");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [titulo, setTitulo] = useState("");
  const [enfoque, setEnfoque] = useState(0.5);
  const [verId, setVerId] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const numero = (t: string) => {
    const n = Number(t.replace(",", "."));
    return t.trim() !== "" && Number.isFinite(n) ? n : undefined;
  };
  const d = numero(desde);
  const h = numero(hasta);

  // Lo que se ve en el reproductor: el recorte elegido de la lista o, si no hay, el borrador del formulario.
  const vista = useMemo(() => {
    if (!datos || !timeline) return null;
    const elegido = datos.recortes.find((r) => r.recorte.id === verId)?.recorte;
    const r = elegido ?? (d !== undefined && h !== undefined && h > d ? { tipo, desde_s: d, hasta_s: h, enfoque } : null);
    if (!r) return null;
    const desdeF = Math.round(r.desde_s * timeline.fps);
    const hastaF = Math.round(r.hasta_s * timeline.fps);
    const contenido = framesContenido(segmentosRecorte(timeline, desdeF, hastaF));
    if (contenido <= 0) return null;
    const cierre = datos.cierre[r.tipo];
    const props: RecorteVertical = { tipo: r.tipo, desde: desdeF, hasta: hastaF, enfoque: r.enfoque, cierre: { texto: cierre.texto, subtexto: cierre.subtexto, frames: Math.round(datos.cierre_s * timeline.fps) } };
    return { props, frames: contenido + props.cierre.frames, borrador: !elegido };
  }, [datos, timeline, verId, tipo, d, h, enfoque]);

  if (error) return <div className="mensaje">{error}</div>;
  if (!datos) return <div className="cargando">Cargando recortes…</div>;
  if (!datos.video) return <div className="vacio">Aún no hay video armado. Ejecuta la composición y vuelve aquí.</div>;
  const { video } = datos;

  const agregar = () =>
    ejecutar(async () => {
      const r = await api.post<{ recorte: { id: string; desde_s: number; hasta_s: number }; avisos: string[]; ajustado: boolean; duracion_s: number }>(`/proyectos/${slug}/recortes`, {
        tipo,
        desde_s: d,
        hasta_s: h,
        titulo,
        enfoque,
      });
      setAviso(`${r.recorte.id}: ${reloj(r.recorte.desde_s)} → ${reloj(r.recorte.hasta_s)} (${r.duracion_s.toFixed(0)} s)${r.ajustado ? ", ajustado a límite de palabra" : ""}${r.avisos.length ? ` · ${r.avisos.join("; ")}` : ""}`);
      setDesde("");
      setHasta("");
      setTitulo("");
      setVerId(r.recorte.id);
      await recargar();
    });

  const quitar = (id: string) =>
    ejecutar(async () => {
      await fetch(`/api/proyectos/${slug}/recortes/${id}`, { method: "DELETE" });
      if (verId === id) setVerId(null);
      await recargar();
    });

  const pendientes = datos.recortes.filter((r) => r.estado !== "al_dia" && !r.errores.length);

  return (
    <div className="rejilla" style={{ gridTemplateColumns: "minmax(0, 1fr) 340px", alignItems: "start" }}>
      <div className="rejilla">
        <div className="panel rejilla">
          <h3>Nuevo recorte</h3>
          <div className="fila" style={{ alignItems: "end" }}>
            <label style={{ width: 130 }}>
              Formato
              <select value={tipo} onChange={(x) => setTipo(x.target.value as Tipo)}>
                <option value="short">Short (YouTube)</option>
                <option value="reel">Reel (Instagram)</option>
              </select>
            </label>
            <label style={{ width: 110 }}>
              Desde (s)
              <input value={desde} onChange={(x) => { setDesde(x.target.value); setVerId(null); }} placeholder="63" inputMode="decimal" />
            </label>
            <label style={{ width: 110 }}>
              Hasta (s)
              <input value={hasta} onChange={(x) => { setHasta(x.target.value); setVerId(null); }} placeholder="118" inputMode="decimal" />
            </label>
            <label style={{ flex: 1, minWidth: 160 }}>
              Título (para ti)
              <input value={titulo} onChange={(x) => setTitulo(x.target.value)} placeholder="El gancho de la pirámide" />
            </label>
          </div>
          <label>
            Enfoque de las ilustraciones: {enfoque <= 0.35 ? "izquierda" : enfoque >= 0.65 ? "derecha" : "centro"}
            <input type="range" min={0} max={1} step={0.05} value={enfoque} onChange={(x) => setEnfoque(Number(x.target.value))} />
          </label>
          <div className="fila">
            <button className="boton primario" disabled={guardando || ocupado || d === undefined || h === undefined || h <= d} onClick={() => void agregar()}>
              Agregar recorte
            </button>
            <span style={{ color: "var(--texto-3)", fontSize: 12.5 }}>
              Los segundos son los del video final ({reloj(video.duracion_s)}). Se llevan al límite de palabra más cercano
              {video.llamado ? `; el llamado a suscribirse (${reloj(video.llamado.desde_s)}–${reloj(video.llamado.hasta_s)}) se saca solo` : ""}.
            </span>
          </div>
          {aviso && <div className="mensaje ok">{aviso}</div>}
          {errorAccion && <div className="mensaje">{errorAccion}</div>}
        </div>

        <div className="panel rejilla">
          <div className="fila">
            <h3>Recortes del proyecto</h3>
            <span className="espacio" />
            <button className="boton primario chico" disabled={ocupado || !pendientes.length} onClick={() => lanzar("/recortes/renderizar", {})}>
              Renderizar pendientes{pendientes.length ? ` (${pendientes.length})` : ""}
            </button>
          </div>
          {!datos.recortes.length && <div className="vacio">Aún no hay recortes. Elige un tramo con la transcripción de abajo.</div>}
          {datos.recortes.map((i) => (
            <div key={i.recorte.id} className="panel rejilla" style={{ background: verId === i.recorte.id ? "var(--panel-2)" : undefined }}>
              <div className="fila">
                <strong className="mono">{i.recorte.id}</strong>
                <span className="tipo">{i.recorte.tipo === "short" ? "Short" : "Reel"}</span>
                <span className={`chip ${i.estado}`}>{ETIQUETA[i.estado]}</span>
                <span className="mono" style={{ color: "var(--texto-3)" }}>
                  {reloj(i.recorte.desde_s)} → {reloj(i.recorte.hasta_s)}{i.duracion_s ? ` · ${i.duracion_s.toFixed(0)} s` : ""}
                </span>
                <span style={{ color: "var(--texto-2)" }}>{i.recorte.titulo}</span>
                <span className="espacio" />
                <button className="boton chico" onClick={() => setVerId(i.recorte.id)}>Ver</button>
                <button className="boton chico peligro" disabled={ocupado} onClick={() => void quitar(i.recorte.id)}>Quitar</button>
              </div>
              {i.desfasado && <div className="mensaje info">El video cambió desde que definiste este recorte: revisa que los segundos sigan apuntando a lo que quieres.</div>}
              {i.errores.map((e) => <div key={e} className="mensaje">{e}</div>)}
              {i.avisos.map((a) => <div key={a} className="mensaje info">{a}</div>)}
              {i.archivo && (
                <div className="fila">
                  <video controls preload="none" src={archivo(slug, i.archivo, String(version))} style={{ height: 260, borderRadius: 8, background: "#000" }} />
                  <a className="boton chico" href={archivo(slug, i.archivo, String(version))} download={`${slug}-${i.recorte.id}.mp4`}>Descargar</a>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="panel rejilla">
          <h3>Transcripción</h3>
          <div style={{ color: "var(--texto-3)", fontSize: 12.5 }}>Usa «inicio» y «final» para llenar el formulario con ese momento.</div>
          <div style={{ maxHeight: 420, overflow: "auto", display: "grid", gap: 2 }}>
            {video.bloques.map((b, i) => {
              const enLlamado = video.llamado && b.desde_s >= video.llamado.desde_s && b.hasta_s <= video.llamado.hasta_s;
              const dentro = d !== undefined && h !== undefined && b.desde_s >= d - 0.05 && b.hasta_s <= h + 0.05;
              return (
                <div key={i} className="fila" style={{ padding: "3px 6px", borderRadius: 6, background: dentro ? "#e0a5261a" : undefined, opacity: enLlamado ? 0.5 : 1 }}>
                  <span className="mono" style={{ width: 52, color: "var(--texto-3)" }}>{reloj(b.desde_s)}</span>
                  <button className="boton chico" onClick={() => { setDesde(String(b.desde_s)); setVerId(null); }}>inicio</button>
                  <button className="boton chico" onClick={() => { setHasta(String(b.hasta_s)); setVerId(null); }}>final</button>
                  <span style={{ flex: 1 }}>{b.texto}{enLlamado ? " (llamado a suscribirse)" : ""}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="panel rejilla" style={{ position: "sticky", top: 16 }}>
        <h3>Vista previa 9:16</h3>
        {vista && timeline ? (
          <>
            <div className="reproductor" style={{ aspectRatio: "9 / 16" }}>
              <Player
                key={JSON.stringify(vista.props)}
                component={Vertical}
                inputProps={{ timeline, recorte: vista.props, base: `/api/proyectos/${slug}/archivos` }}
                durationInFrames={vista.frames}
                fps={timeline.fps}
                compositionWidth={1080}
                compositionHeight={1920}
                style={{ width: "100%", height: "100%" }}
                controls
                acknowledgeRemotionLicense
              />
            </div>
            <div style={{ color: "var(--texto-3)", fontSize: 12.5 }}>{vista.borrador ? "Borrador del formulario" : `Recorte ${verId}`} · {(vista.frames / timeline.fps).toFixed(0)} s con la tarjeta final</div>
          </>
        ) : (
          <div className="vacio" style={{ padding: 24 }}>Escribe el inicio y el final, o elige «Ver» en un recorte.</div>
        )}
      </div>
    </div>
  );
}
