import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api, usd, type DetalleProyecto, type Trabajo } from "../api.ts";
import { useDatos } from "../ganchos.ts";
import { Resumen } from "./Resumen.tsx";
import { Escenas } from "./Escenas.tsx";
import { Voz } from "./Voz.tsx";
import { Imagenes } from "./Imagenes.tsx";
import { VistaPrevia } from "./VistaPrevia.tsx";
import { Publicacion } from "./Publicacion.tsx";
import { Costos } from "./Costos.tsx";

interface ContextoProyecto {
  slug: string;
  detalle: DetalleProyecto;
  recargar: () => Promise<void>;
  /** Lanza un trabajo en segundo plano (ejecutar, regenerar, preview). */
  lanzar: (ruta: string, cuerpo?: unknown) => Promise<void>;
  /** Cambia cada vez que termina un trabajo: las pestañas lo usan para recargar sus datos. */
  version: number;
  ocupado: boolean;
}

const Ctx = createContext<ContextoProyecto | null>(null);
export const useProyecto = () => useContext(Ctx)!;

const PESTANAS = [
  ["resumen", "Resumen"],
  ["escenas", "Guion y escenas"],
  ["voz", "Voz"],
  ["imagenes", "Imágenes"],
  ["vista-previa", "Vista previa"],
  ["publicacion", "Render y publicación"],
  ["costos", "Costos"],
] as const;

export function Proyecto({ slug, pestana }: { slug: string; pestana: string }) {
  const { datos, error, recargar, setDatos } = useDatos<DetalleProyecto>(`/proyectos/${slug}`);
  const [trabajo, setTrabajo] = useState<Trabajo | null>(null);
  const [version, setVersion] = useState(0);
  const [errorLanzar, setErrorLanzar] = useState<string | null>(null);
  const ultimoId = useRef<string | null>(null);

  useEffect(() => {
    if (datos?.trabajo) setTrabajo(datos.trabajo);
  }, [datos?.trabajo?.id]);

  // Sondeo del trabajo en curso; al terminar se recarga el proyecto.
  useEffect(() => {
    if (trabajo?.estado !== "en_curso") return;
    const id = setInterval(async () => {
      const t = await api.get<Trabajo | null>(`/proyectos/${slug}/trabajo`).catch(() => null);
      if (!t) return;
      setTrabajo(t);
      if (t.estado !== "en_curso" && ultimoId.current !== t.id + t.fin) {
        ultimoId.current = t.id + t.fin;
        await recargar();
        setVersion((v) => v + 1);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [trabajo?.estado, trabajo?.id, slug, recargar]);

  const lanzar = useCallback(
    async (ruta: string, cuerpo?: unknown) => {
      setErrorLanzar(null);
      try {
        const t = await api.post<Trabajo>(`/proyectos/${slug}${ruta}`, cuerpo);
        setTrabajo(t);
      } catch (e) {
        setErrorLanzar((e as Error).message);
      }
    },
    [slug],
  );

  if (error) return <div className="mensaje">{error}</div>;
  if (!datos) return <div className="cargando">Cargando proyecto…</div>;
  const ocupado = trabajo?.estado === "en_curso";
  const c = datos.costos;
  const pct = Math.min(100, (c.acumulado / Math.max(0.01, c.presupuesto)) * 100);
  const previsto = c.acumulado + c.estimado_restante;

  return (
    <Ctx.Provider value={{ slug, detalle: datos, recargar: async () => { await recargar(); setVersion((v) => v + 1); }, lanzar, version, ocupado }}>
      <div className="fila">
        <div>
          <h1>{datos.proyecto.titulo ?? slug}</h1>
          <div className="mono" style={{ color: "var(--texto-3)" }}>
            {slug} · estilo {datos.proyecto.estilo} · voz {datos.estilo.voz.proveedor} · imágenes {datos.estilo.imagen.proveedor_principal}
          </div>
        </div>
      </div>

      {/* Siempre visible: costo del siguiente paso y acumulado. */}
      <div className="costos">
        <div>
          <div className="etiqueta">Gastado</div>
          <div className="cifra">{usd(c.acumulado)}</div>
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          <div className="etiqueta">Presupuesto {usd(c.presupuesto)}</div>
          <div className={`barra ${previsto > c.presupuesto ? "excedida" : ""}`}>
            <div style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div>
          <div className="etiqueta">Siguiente paso</div>
          <div>{c.siguiente ? <><strong>{c.siguiente.titulo}</strong> <span className="mono">≈ {usd(c.siguiente.costo_usd)}</span></> : <span style={{ color: "var(--texto-3)" }}>nada pendiente</span>}</div>
        </div>
        <div>
          <div className="etiqueta">Falta (estimado)</div>
          <div className="mono">{usd(c.estimado_restante)}</div>
        </div>
        <span className="espacio" />
        <button className="boton chico" onClick={() => void recargar()}>Actualizar</button>
      </div>

      {errorLanzar && <div className="mensaje" style={{ marginBottom: 14 }}>{errorLanzar}</div>}
      {trabajo && <PanelTrabajo trabajo={trabajo} alContinuar={(ruta, cuerpo) => lanzar(ruta, cuerpo)} alCerrar={() => setTrabajo(null)} />}

      <nav className="pestanas">
        {PESTANAS.map(([id, nombre]) => (
          <a key={id} href={`#/p/${slug}/${id}`} className={pestana === id ? "activa" : ""}>
            {nombre}
          </a>
        ))}
      </nav>
      {pestana === "escenas" ? <Escenas /> : pestana === "voz" ? <Voz /> : pestana === "imagenes" ? <Imagenes /> : pestana === "vista-previa" ? <VistaPrevia /> : pestana === "publicacion" ? <Publicacion /> : pestana === "costos" ? <Costos /> : <Resumen />}
    </Ctx.Provider>
  );
}

function PanelTrabajo({ trabajo, alContinuar, alCerrar }: { trabajo: Trabajo; alContinuar: (ruta: string, cuerpo: unknown) => void; alCerrar: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [trabajo.eventos.length]);
  const p = trabajo.progreso;
  const hasta = trabajo.tipo.match(/ejecutar hasta (\w+)/)?.[1];
  return (
    <div className="panel trabajo" style={{ marginBottom: 18 }}>
      <div className="fila" style={{ marginBottom: 10 }}>
        <h3>{trabajo.tipo}</h3>
        <span className={`chip ${trabajo.estado === "en_curso" ? "revision" : trabajo.estado === "ok" ? "al_dia" : "error"}`}>
          {trabajo.estado === "en_curso" ? "en curso" : trabajo.estado === "ok" ? (trabajo.motivo === "revision" ? "listo para revisar" : "terminado") : trabajo.motivo === "presupuesto" ? "detenido por presupuesto" : "error"}
        </span>
        <span className="espacio" />
        {trabajo.motivo === "presupuesto" && hasta && (
          <button className="boton primario chico" onClick={() => alContinuar("/ejecutar", { hasta, confirmar_presupuesto: true })}>
            Continuar de todos modos
          </button>
        )}
        {trabajo.estado !== "en_curso" && <button className="boton chico" onClick={alCerrar}>Cerrar</button>}
      </div>
      {p && (
        <div style={{ marginBottom: 10 }}>
          <div className="fila" style={{ fontSize: 12.5, color: "var(--texto-2)", marginBottom: 4 }}>
            {p.paso} · {p.hechos}/{p.total} {p.msg && `· ${p.msg}`}
          </div>
          <div className="barra"><div style={{ width: `${(p.hechos / Math.max(1, p.total)) * 100}%` }} /></div>
        </div>
      )}
      <div className="registro" ref={ref}>
        {trabajo.eventos.map((e, i) => (
          <div key={i} className={e.nivel}>
            {new Date(e.t).toLocaleTimeString("es-CO")} {e.msg}
          </div>
        ))}
        {!trabajo.eventos.length && <div className="detalle">Iniciando…</div>}
      </div>
    </div>
  );
}
