import { useMemo, useState } from "react";
import { Player } from "@remotion/player";
import { NOMBRES_FUENTES, TIMELINE_DEMO, Video, type EstiloVisual, type Timeline } from "@guion2video/render";
import { api } from "../api.ts";
import { useAccion, useDatos } from "../ganchos.ts";
import { AUDIO, IMAGENES, VOCES } from "../opciones.ts";

interface ResumenEstilo {
  id: string;
  nombre: string;
  idioma?: string;
  colores?: Record<string, string>;
  proyectos: string[];
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = Record<string, any>;

export function Estilos({ id }: { id?: string }) {
  return id ? <EditorEstilo id={id} /> : <ListaEstilos />;
}

// ───────── Lista y creación ─────────

const aId = (nombre: string) =>
  nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

function ListaEstilos() {
  const { datos } = useDatos<ResumenEstilo[]>("/estilos");
  const [f, setF] = useState({ nombre: "", id: "", base: "" });
  const [idTocado, setIdTocado] = useState(false);
  const accion = useAccion();
  if (!datos) return <div className="cargando">Cargando…</div>;
  const base = f.base || datos[0]?.id || "";
  const id = idTocado ? f.id : aId(f.nombre);
  const crear = () =>
    accion.ejecutar(async () => {
      const r = await api.post<{ id: string }>("/estilos", { id, nombre: f.nombre, base });
      window.location.hash = `#/estilos/${r.id}`;
    });
  return (
    <div className="rejilla dos" style={{ alignItems: "start" }}>
      <div className="rejilla">
        <h2>Estilos de canal</h2>
        <p style={{ color: "var(--texto-3)", margin: 0 }}>Un estilo es la identidad fija de un canal: voz, dibujo, colores, tipografía y música. Cada video solo aporta su guion.</p>
        {datos.map((e) => (
          <a key={e.id} className="panel" href={`#/estilos/${e.id}`} style={{ display: "grid", gap: 8, color: "inherit" }}>
            <div className="fila">
              <strong>{e.nombre}</strong>
              <span className="espacio" />
              <span style={{ display: "flex", gap: 4 }}>
                {Object.values(e.colores ?? {}).map((c, i) => (
                  <span key={i} title={c} style={{ width: 18, height: 18, borderRadius: 4, background: c, border: "1px solid var(--borde)" }} />
                ))}
              </span>
            </div>
            <span className="mono" style={{ color: "var(--texto-3)" }}>
              {e.id} · {e.idioma ?? "es"} · {e.proyectos.length === 1 ? "1 proyecto" : `${e.proyectos.length} proyectos`}
            </span>
          </a>
        ))}
      </div>
      <div className="panel rejilla">
        <h2>Nuevo estilo</h2>
        <p style={{ color: "var(--texto-3)", margin: 0 }}>Se crea como copia de otro estilo (con su pronunciación) y luego lo ajustas.</p>
        <label>
          Nombre del canal
          <input value={f.nombre} placeholder="Historias del Caribe" onChange={(e) => setF({ ...f, nombre: e.target.value })} />
        </label>
        <label>
          Identificador (carpeta en estilos/)
          <input value={id} placeholder="historias-del-caribe" onChange={(e) => { setIdTocado(true); setF({ ...f, id: e.target.value }); }} />
        </label>
        <label>
          Copiar de
          <select value={base} onChange={(e) => setF({ ...f, base: e.target.value })}>
            {datos.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
        </label>
        {accion.error && <div className="mensaje">{accion.error}</div>}
        <div className="fila">
          <span className="espacio" />
          <button className="boton primario" disabled={accion.ocupado || !f.nombre.trim() || !id || !base} onClick={crear}>Crear estilo</button>
        </div>
      </div>
    </div>
  );
}

// ───────── Editor ─────────

type TipoCampo = "texto" | "area" | "numero" | "color" | "si_no" | "lineas" | { opciones: string[] };

interface Campo {
  ruta: string;
  etiqueta: string;
  tipo: TipoCampo;
  paso?: number;
  ayuda?: string;
}

interface Seccion {
  titulo: string;
  /** Qué se vuelve a generar (y a pagar) en los proyectos de este estilo si cambia algo de la sección. */
  costo?: string;
  campos: Campo[];
}

const SECCIONES: Seccion[] = [
  {
    titulo: "General",
    campos: [
      { ruta: "nombre", etiqueta: "Nombre del canal", tipo: "texto" },
      { ruta: "idioma", etiqueta: "Idioma", tipo: { opciones: ["es", "en", "pt"] } },
    ],
  },
  {
    titulo: "Voz",
    costo: "la voz de todas las escenas",
    campos: [
      { ruta: "voz.proveedor", etiqueta: "Proveedor", tipo: { opciones: VOCES } },
      { ruta: "voz.voz_id", etiqueta: "ID de la voz", tipo: "texto", ayuda: "En ElevenLabs: Voices → tu voz → ID" },
      { ruta: "voz.velocidad", etiqueta: "Velocidad", tipo: "numero", paso: 0.05, ayuda: "1 = normal" },
      { ruta: "voz.estabilidad", etiqueta: "Estabilidad", tipo: "numero", paso: 0.05, ayuda: "0 a 1: más alto, más monótona" },
      { ruta: "voz.similitud", etiqueta: "Similitud", tipo: "numero", paso: 0.05, ayuda: "0 a 1: parecido con la voz original" },
      { ruta: "voz.lufs", etiqueta: "Sonoridad (LUFS)", tipo: "numero", paso: 1 },
      { ruta: "voz.pausa_escena_s", etiqueta: "Pausa entre escenas (s)", tipo: "numero", paso: 0.1 },
      { ruta: "voz.pausa_parte_s", etiqueta: "Pausa entre partes (s)", tipo: "numero", paso: 0.1 },
    ],
  },
  {
    titulo: "Imágenes",
    costo: "las escenas y las ilustraciones",
    campos: [
      { ruta: "imagen.proveedor_principal", etiqueta: "Proveedor principal", tipo: { opciones: IMAGENES } },
      { ruta: "imagen.proveedor_premium", etiqueta: "Proveedor premium", tipo: { opciones: IMAGENES } },
      { ruta: "imagen.estilo_prompt", etiqueta: "Estilo de dibujo (se añade a cada ilustración)", tipo: "area" },
      { ruta: "imagen.negativo", etiqueta: "Qué evitar", tipo: "area" },
    ],
  },
  {
    titulo: "Ritmo",
    costo: "la división en escenas (y puede cambiar ilustraciones)",
    campos: [
      { ruta: "ritmo.segundos_por_imagen_min", etiqueta: "Segundos por imagen (mín.)", tipo: "numero", paso: 1 },
      { ruta: "ritmo.segundos_por_imagen_max", etiqueta: "Segundos por imagen (máx.)", tipo: "numero", paso: 1 },
      { ruta: "ritmo.porcentaje_minimo_graficos", etiqueta: "% mínimo de gráficos animados", tipo: "numero", paso: 5 },
      { ruta: "ritmo.max_imagenes_seguidas", etiqueta: "Máx. imágenes seguidas sin gráfico", tipo: "numero", paso: 1 },
    ],
  },
  {
    titulo: "Colores",
    campos: [
      { ruta: "colores.fondo", etiqueta: "Fondo", tipo: "color" },
      { ruta: "colores.acento", etiqueta: "Acento", tipo: "color" },
      { ruta: "colores.texto", etiqueta: "Texto", tipo: "color" },
      { ruta: "colores.alerta", etiqueta: "Alerta (sellos)", tipo: "color" },
    ],
  },
  {
    titulo: "Tipografía",
    campos: [
      { ruta: "tipografia.titulos", etiqueta: "Títulos", tipo: { opciones: NOMBRES_FUENTES } },
      { ruta: "tipografia.subtitulos", etiqueta: "Subtítulos y textos", tipo: { opciones: NOMBRES_FUENTES } },
      { ruta: "tipografia.cifras", etiqueta: "Cifras", tipo: { opciones: NOMBRES_FUENTES } },
    ],
  },
  {
    titulo: "Subtítulos y marca",
    campos: [
      { ruta: "subtitulos.activos", etiqueta: "Mostrar subtítulos", tipo: "si_no" },
      { ruta: "subtitulos.resaltar_palabra_actual", etiqueta: "Resaltar la palabra que se dice", tipo: "si_no" },
      { ruta: "subtitulos.palabras_por_bloque", etiqueta: "Palabras por bloque", tipo: "numero", paso: 1 },
      { ruta: "subtitulos.posicion", etiqueta: "Posición", tipo: { opciones: ["inferior", "superior"] } },
      { ruta: "marca.texto", etiqueta: "Texto de marca (esquina)", tipo: "texto" },
      { ruta: "superposiciones.activas", etiqueta: "Textos e íconos sobre las ilustraciones", tipo: "si_no" },
    ],
  },
  {
    titulo: "Música y efectos",
    campos: [
      { ruta: "musica.proveedor", etiqueta: "Música", tipo: { opciones: AUDIO } },
      { ruta: "musica.efectos_proveedor", etiqueta: "Efectos", tipo: { opciones: AUDIO } },
      { ruta: "musica.volumen_db", etiqueta: "Volumen de la música (dB)", tipo: "numero", paso: 1, ayuda: "Relativo a la voz" },
      { ruta: "musica.ducking_db", etiqueta: "Bajada mientras se narra (dB)", tipo: "numero", paso: 1 },
      { ruta: "musica.efectos_volumen_db", etiqueta: "Volumen de los efectos (dB)", tipo: "numero", paso: 1 },
    ],
  },
  {
    titulo: "Publicación",
    campos: [
      { ruta: "publicacion.nota_ia", etiqueta: "Nota sobre el uso de IA (va en la descripción)", tipo: "area" },
      { ruta: "publicacion.llamadas_accion", etiqueta: "Llamadas a la acción (una por línea)", tipo: "lineas" },
    ],
  },
];

const leer = (o: Json, ruta: string): any => ruta.split(".").reduce((x, k) => x?.[k], o);

function escribir(o: Json, ruta: string, valor: unknown): Json {
  const copia = structuredClone(o);
  const ks = ruta.split(".");
  let x = copia;
  for (const k of ks.slice(0, -1)) x = x[k] ??= {};
  x[ks[ks.length - 1]] = valor;
  return copia;
}

/** Lo que el render necesita del estilo para la vista previa en vivo. */
function aVisual(e: Json): EstiloVisual {
  return {
    colores: e.colores,
    tipografia: e.tipografia,
    subtitulos: { activos: e.subtitulos?.activos ?? true, resaltar_palabra_actual: e.subtitulos?.resaltar_palabra_actual ?? true, posicion: e.subtitulos?.posicion ?? "inferior" },
    marca: { texto: e.marca?.texto },
  };
}

function EditorEstilo({ id }: { id: string }) {
  const { datos, error, setDatos } = useDatos<{ estilo: Json; pronunciacion: Record<string, string>; proyectos: string[] }>(`/estilos/${id}`);
  const [e, setE] = useState<Json | null>(null);
  const [pron, setPron] = useState<[string, string][] | null>(null);
  const accion = useAccion();
  const estilo = e ?? datos?.estilo ?? null;
  const filas = pron ?? Object.entries(datos?.pronunciacion ?? {});
  const timeline = useMemo<Timeline | null>(() => (estilo?.colores && estilo?.tipografia ? { ...TIMELINE_DEMO, estilo: aVisual(estilo) } : null), [estilo]);

  if (error) return <div className="mensaje">{error}</div>;
  if (!datos || !estilo) return <div className="cargando">Cargando…</div>;

  const cambiadas = SECCIONES.filter((s) => s.campos.some((c) => JSON.stringify(leer(estilo, c.ruta)) !== JSON.stringify(leer(datos.estilo, c.ruta))));
  const hayCambios = cambiadas.length > 0 || pron !== null;
  const guardar = () =>
    accion.ejecutar(async () => {
      const conCosto = cambiadas.filter((s) => s.costo);
      if (conCosto.length && datos.proyectos.length) {
        const ok = window.confirm(
          `Cambiaste ${conCosto.map((s) => s.titulo.toLowerCase()).join(" y ")}.\n\n` +
            `Los proyectos ${datos.proyectos.join(", ")} usan este estilo: la próxima vez que los ejecutes se volverá a generar ${conCosto.map((s) => s.costo).join(" y ")}, con su costo (usa "Estimar" antes).\n\n¿Guardar?`,
        );
        if (!ok) return;
      }
      const limpio = escribir(estilo, "publicacion.llamadas_accion", (leer(estilo, "publicacion.llamadas_accion") ?? []).filter((l: string) => l.trim()));
      await api.put(`/estilos/${id}`, { estilo: limpio, pronunciacion: Object.fromEntries(filas) });
      setDatos({ ...datos, estilo: limpio, pronunciacion: Object.fromEntries(filas.filter(([k, v]) => k.trim() && v.trim())) });
      setE(null);
      setPron(null);
    }, "Estilo guardado");

  return (
    <div className="rejilla">
      <div className="fila">
        <a href="#/estilos">← Estilos</a>
        <h2 style={{ margin: 0 }}>{estilo.nombre}</h2>
        <span className="mono" style={{ color: "var(--texto-3)" }}>{id}</span>
        <span className="espacio" />
        {accion.mensaje && !hayCambios && <span style={{ color: "var(--ok)" }}>{accion.mensaje}</span>}
        <button className="boton" disabled={!hayCambios || accion.ocupado} onClick={() => { setE(null); setPron(null); }}>Descartar cambios</button>
        <button className="boton primario" disabled={!hayCambios || accion.ocupado} onClick={guardar}>Guardar</button>
      </div>
      {accion.error && <div className="mensaje" style={{ whiteSpace: "pre-wrap" }}>{accion.error}</div>}
      <p style={{ color: "var(--texto-3)", margin: 0 }}>
        {datos.proyectos.length ? `Lo usan: ${datos.proyectos.join(", ")}. ` : "Ningún proyecto usa este estilo todavía. "}
        Las secciones marcadas con <span className="chip" style={{ color: "var(--acento)", borderColor: "var(--acento)" }}>$</span> hacen que esos proyectos vuelvan a generar (y pagar) parte del trabajo; el resto solo pide volver a renderizar, que es gratis.
      </p>

      <div className="rejilla dos" style={{ alignItems: "start" }}>
        <div className="rejilla">
          {SECCIONES.map((s) => (
            <div key={s.titulo} className="panel rejilla">
              <div className="fila">
                <h3 style={{ margin: 0 }}>{s.titulo}</h3>
                {s.costo && <span className="chip" title={`Regenera ${s.costo}`} style={{ color: "var(--acento)", borderColor: "var(--acento)" }}>$ regenera {s.costo}</span>}
              </div>
              <div className="rejilla dos" style={{ alignItems: "start" }}>
                {s.campos.map((c) => (
                  <CampoEstilo key={c.ruta} campo={c} valor={leer(estilo, c.ruta)} alCambiar={(v) => setE(escribir(estilo, c.ruta, v))} />
                ))}
              </div>
            </div>
          ))}
          <div className="panel rejilla">
            <div className="fila">
              <h3 style={{ margin: 0 }}>Pronunciación</h3>
              <span className="chip" style={{ color: "var(--acento)", borderColor: "var(--acento)" }}>$ regenera la voz de las escenas afectadas</span>
            </div>
            <p style={{ color: "var(--texto-3)", margin: 0 }}>Cómo debe decir la voz una palabra o sigla. Solo afecta a la voz: los subtítulos muestran el texto escrito.</p>
            {filas.map(([k, v], i) => (
              <div key={i} className="fila" style={{ flexWrap: "nowrap" }}>
                <input value={k} placeholder="DMG" onChange={(ev) => setPron(filas.map((f, j) => (j === i ? [ev.target.value, f[1]] : f)))} />
                <span>→</span>
                <input value={v} placeholder="de eme ge" onChange={(ev) => setPron(filas.map((f, j) => (j === i ? [f[0], ev.target.value] : f)))} />
                <button className="boton chico" title="Quitar" onClick={() => setPron(filas.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
            <div className="fila">
              <button className="boton chico" onClick={() => setPron([...filas, ["", ""]])}>+ Añadir palabra</button>
            </div>
          </div>
        </div>

        <div className="panel rejilla" style={{ position: "sticky", top: 16 }}>
          <h3 style={{ margin: 0 }}>Vista previa en vivo</h3>
          <p style={{ color: "var(--texto-3)", margin: 0 }}>Colores, tipografía, subtítulos, marca y textos sobre las imágenes, con la demo de 30 s. Se actualiza mientras editas, antes de guardar.</p>
          {timeline && (
            <Player
              component={Video}
              inputProps={{ timeline }}
              durationInFrames={timeline.duracion_frames}
              fps={timeline.fps}
              compositionWidth={timeline.ancho}
              compositionHeight={timeline.alto}
              style={{ width: "100%", aspectRatio: `${timeline.ancho} / ${timeline.alto}`, borderRadius: 8 }}
              controls
              loop
              acknowledgeRemotionLicense
            />
          )}
        </div>
      </div>
    </div>
  );
}

function CampoEstilo({ campo, valor, alCambiar }: { campo: Campo; valor: any; alCambiar: (v: unknown) => void }) {
  const { tipo, etiqueta, ayuda } = campo;
  const ancho = tipo === "area" || tipo === "lineas" ? { gridColumn: "1 / -1" } : undefined;
  let control;
  if (tipo === "si_no") {
    control = (
      <select value={valor === false ? "no" : "si"} onChange={(e) => alCambiar(e.target.value === "si")}>
        <option value="si">Sí</option>
        <option value="no">No</option>
      </select>
    );
  } else if (tipo === "numero") {
    control = <input type="number" step={campo.paso ?? 1} value={valor ?? ""} onChange={(e) => alCambiar(e.target.value === "" ? undefined : Number(e.target.value))} />;
  } else if (tipo === "color") {
    control = (
      <span className="fila" style={{ flexWrap: "nowrap" }}>
        <input type="color" value={valor ?? "#000000"} onChange={(e) => alCambiar(e.target.value)} style={{ width: 48, padding: 2, height: 36 }} />
        <input value={valor ?? ""} onChange={(e) => alCambiar(e.target.value)} />
      </span>
    );
  } else if (tipo === "area") {
    control = <textarea value={valor ?? ""} onChange={(e) => alCambiar(e.target.value)} />;
  } else if (tipo === "lineas") {
    control = <textarea value={(valor ?? []).join("\n")} onChange={(e) => alCambiar(e.target.value.split("\n").filter((l, i, todas) => l.trim() || i < todas.length - 1))} />;
  } else if (typeof tipo === "object") {
    control = (
      <select value={valor ?? ""} onChange={(e) => alCambiar(e.target.value)}>
        {[...new Set([valor ?? "", ...tipo.opciones])].filter((o) => o !== "" || !valor).map((o) => <option key={o} value={o}>{o || "—"}</option>)}
      </select>
    );
  } else {
    control = <input value={valor ?? ""} onChange={(e) => alCambiar(e.target.value)} />;
  }
  return (
    <label style={ancho}>
      {etiqueta}
      {control}
      {ayuda && <span style={{ color: "var(--texto-3)", fontWeight: 400 }}>{ayuda}</span>}
    </label>
  );
}
