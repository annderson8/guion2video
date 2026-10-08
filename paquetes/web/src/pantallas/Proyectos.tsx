import { useState } from "react";
import { api, usd, type EstadoPaso } from "../api.ts";
import { useAccion, useDatos } from "../ganchos.ts";

interface ItemProyecto {
  slug: string;
  titulo?: string;
  estilo: string;
  costo_usd: number;
  presupuesto_usd: number;
  siguiente: EstadoPaso | null;
  trabajo: string | null;
}

const ETIQUETAS: Record<string, string> = { al_dia: "al día", revision: "por revisar", obsoleto: "obsoleto", pendiente: "pendiente", error: "error", bloqueado: "bloqueado" };

export function Proyectos() {
  const { datos, error, recargar } = useDatos<ItemProyecto[]>("/proyectos");
  const [nuevo, setNuevo] = useState(false);
  return (
    <div className="rejilla">
      <div className="fila">
        <h1>Proyectos</h1>
        <span className="espacio" />
        <button className="boton primario" onClick={() => setNuevo((x) => !x)}>
          {nuevo ? "Cerrar" : "+ Nuevo proyecto"}
        </button>
      </div>
      {nuevo && <NuevoProyecto alCrear={(slug) => (window.location.hash = `#/p/${slug}`)} />}
      {error && <div className="mensaje">{error}</div>}
      {!datos ? (
        <div className="cargando">Cargando…</div>
      ) : !datos.length ? (
        <div className="vacio">Aún no hay proyectos. Crea uno con tu guion en Markdown.</div>
      ) : (
        <div className="lista-proyectos">
          {datos.map((p) => (
            <a key={p.slug} className="proyecto" href={`#/p/${p.slug}`}>
              <div>
                <div style={{ fontWeight: 600 }}>{p.titulo ?? p.slug}</div>
                <div className="slug">
                  {p.slug} · {p.estilo}
                </div>
              </div>
              <div>
                {p.trabajo === "en_curso" ? (
                  <span className="chip revision">trabajando…</span>
                ) : p.siguiente ? (
                  <span className={`chip ${p.siguiente.estado}`}>
                    {p.siguiente.titulo}: {ETIQUETAS[p.siguiente.estado]}
                  </span>
                ) : (
                  <span className="chip al_dia">terminado</span>
                )}
              </div>
              <div className="mono" style={{ color: "var(--texto-2)" }}>
                {usd(p.costo_usd)} / {usd(p.presupuesto_usd)}
              </div>
            </a>
          ))}
        </div>
      )}
      <button className="boton chico" style={{ justifySelf: "start" }} onClick={recargar}>
        Actualizar
      </button>
    </div>
  );
}

function NuevoProyecto({ alCrear }: { alCrear: (slug: string) => void }) {
  const estilos = useDatos<{ id: string; nombre: string }[]>("/estilos");
  const [f, setF] = useState({ slug: "", titulo: "", estilo: "", guion: "", presupuesto_usd: "" });
  const accion = useAccion();
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const cargarArchivo = async (archivo?: File) => {
    if (!archivo) return;
    const texto = await archivo.text();
    const titulo = texto.match(/^#\s+(.+)$/m)?.[1] ?? "";
    setF((x) => ({ ...x, guion: texto, titulo: x.titulo || titulo, slug: x.slug || sugerirSlug(titulo || archivo.name) }));
  };
  return (
    <div className="panel rejilla">
      <h2>Nuevo video</h2>
      <div className="rejilla dos">
        <label>
          Slug (carpeta del proyecto)
          <input value={f.slug} onChange={set("slug")} placeholder="2026-10-dmg" />
        </label>
        <label>
          Estilo del canal
          <select value={f.estilo} onChange={set("estilo")}>
            <option value="">Elige…</option>
            {estilos.datos?.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre} ({e.id})
              </option>
            ))}
          </select>
        </label>
        <label>
          Título (opcional; si no, se toma del guion)
          <input value={f.titulo} onChange={set("titulo")} />
        </label>
        <label>
          Presupuesto máximo USD (opcional)
          <input value={f.presupuesto_usd} onChange={set("presupuesto_usd")} placeholder="15" inputMode="decimal" />
        </label>
      </div>
      <label>
        Guion en Markdown
        <textarea value={f.guion} onChange={set("guion")} rows={12} placeholder={"# Título\n\n## Gancho\n\n[nota visual] Texto que se narra…\n\n## Fuentes\n\n- …"} />
      </label>
      <div className="fila">
        <label className="boton" style={{ display: "inline-flex" }}>
          Subir .md
          <input type="file" accept=".md,.markdown,.txt" style={{ display: "none" }} onChange={(e) => cargarArchivo(e.target.files?.[0])} />
        </label>
        <span className="espacio" />
        <button
          className="boton primario"
          disabled={accion.ocupado || !f.slug || !f.estilo || !f.guion}
          onClick={() =>
            accion.ejecutar(async () => {
              const r = await api.post<{ slug: string }>("/proyectos", { ...f, titulo: f.titulo || undefined, presupuesto_usd: f.presupuesto_usd ? Number(f.presupuesto_usd) : undefined });
              alCrear(r.slug);
            })
          }
        >
          Crear proyecto
        </button>
      </div>
      {accion.error && <div className="mensaje">{accion.error}</div>}
    </div>
  );
}

const sugerirSlug = (s: string) => {
  const fecha = new Date().toISOString().slice(0, 7);
  const base = s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\.md$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return `${fecha}-${base}`;
};
