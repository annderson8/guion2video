import { api, archivo } from "../api.ts";
import { useDatos } from "../ganchos.ts";
import { useProyecto } from "./Proyecto.tsx";

interface DatosPublicacion {
  publicacion: { titulos: { titulo: string }[]; etiquetas: string[]; fuentes: string[]; capitulos: { inicio_ms: number; titulo: string }[] } | null;
  descripcion: string | null;
  archivos: Record<string, boolean>;
}
interface Validacion { errores: string[]; avisos: string[]; datos: Record<string, unknown> }

export function Publicacion() {
  const { slug, version, detalle, lanzar, recargar, ocupado } = useProyecto();
  const { datos } = useDatos<DatosPublicacion>(`/proyectos/${slug}/publicacion`, [version]);
  const validacion = useDatos<Validacion>(`/proyectos/${slug}/validacion`, [version]);
  const estado = (n: string) => detalle.estados.find((e) => e.nombre === n);
  const render = estado("render");
  const pub = estado("publicacion");
  const a = datos?.archivos ?? {};
  const aprobar = async (paso: string) => {
    await api.post(`/proyectos/${slug}/aprobar`, { paso });
    await recargar();
  };
  return (
    <div className="rejilla">
      <div className="panel rejilla">
        <div className="fila">
          <h2>Validaciones automáticas</h2>
          <span className="espacio" />
          <button className="boton chico" onClick={validacion.recargar}>Volver a revisar</button>
        </div>
        {validacion.cargando && <div className="cargando">Revisando audio, subtítulos e imágenes…</div>}
        {validacion.datos && (
          <>
            {validacion.datos.errores.map((e, i) => <div key={i} className="mensaje">✗ {e}</div>)}
            {validacion.datos.avisos.map((e, i) => <div key={i} className="mensaje info">! {e}</div>)}
            {!validacion.datos.errores.length && !validacion.datos.avisos.length && <div className="mensaje ok">✓ Todo en orden</div>}
            <div className="mono" style={{ color: "var(--texto-3)" }}>{Object.entries(validacion.datos.datos).map(([k, v]) => `${k}: ${typeof v === "number" ? Math.round(v * 10) / 10 : v}`).join(" · ")}</div>
          </>
        )}
      </div>

      <div className="panel rejilla">
        <div className="fila">
          <h2>Render final 1080p</h2>
          {render && <span className={`chip ${render.estado}`}>{render.estado}</span>}
          <span className="espacio" />
          <button className="boton" disabled={ocupado} onClick={() => lanzar("/ejecutar", { hasta: "render" })}>Renderizar</button>
          {render?.estado === "revision" && <button className="boton primario" onClick={() => aprobar("render")}>Lo vi completo: aprobar</button>}
        </div>
        {a["video.mp4"] && <video controls src={archivo(slug, "salida/video.mp4", String(version))} style={{ width: "100%", borderRadius: 8 }} />}
        <div className="fila">
          {["video.mp4", "subtitulos.srt", "miniatura.png"].filter((f) => a[f]).map((f) => (
            <a key={f} className="boton chico" href={archivo(slug, `salida/${f}`)} download>Descargar {f}</a>
          ))}
        </div>
      </div>

      <div className="panel rejilla">
        <div className="fila">
          <h2>Publicación</h2>
          {pub && <span className={`chip ${pub.estado}`}>{pub.estado}</span>}
          <span className="espacio" />
          <button className="boton" disabled={ocupado || render?.estado !== "al_dia"} onClick={() => lanzar("/ejecutar", { hasta: "publicacion" })}>Generar paquete</button>
          {pub?.estado === "revision" && <button className="boton primario" onClick={() => aprobar("publicacion")}>Aprobar</button>}
        </div>
        <p style={{ color: "var(--texto-3)", margin: 0 }}>La subida a YouTube es manual y como borrador privado. Revisa la lista de publicación antes de subir.</p>
        {datos?.publicacion && (
          <>
            <h3>Títulos</h3>
            <ol style={{ margin: 0 }}>{datos.publicacion.titulos.map((t, i) => <li key={i}>{t.titulo}</li>)}</ol>
            <h3>Miniaturas</h3>
            <div className="miniaturas">
              {[1, 2, 3].filter((i) => a[`miniatura-${i}.png`]).map((i) => (
                <a key={i} href={archivo(slug, `salida/miniatura-${i}.png`)} download>
                  <img src={archivo(slug, `salida/miniatura-${i}.png`, String(version))} alt={`Miniatura ${i}`} />
                </a>
              ))}
            </div>
            <div className="fila">
              <h3>Descripción</h3>
              <span className="espacio" />
              {datos.descripcion && <button className="boton chico" onClick={() => navigator.clipboard.writeText(datos.descripcion!)}>Copiar</button>}
              {a["LISTA-PUBLICACION.md"] && <a className="boton chico" href={archivo(slug, "salida/LISTA-PUBLICACION.md")} target="_blank">Lista de publicación</a>}
            </div>
            <pre className="descripcion">{datos.descripcion}</pre>
          </>
        )}
      </div>
    </div>
  );
}
