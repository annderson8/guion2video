import { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { geoBounds, geoMercator, geoPath } from "d3-geo";
import type { Feature, FeatureCollection, MultiPolygon } from "geojson";
import { useEstilo } from "../contexto.tsx";
import { familia } from "../fuentes.ts";
import { FondoGrafico, progreso } from "./comun.tsx";
import colombia from "../mapas/colombia.json";
import paises from "../mapas/paises.json";

type Region = Feature<MultiPolygon, { nombre: string; iso?: string }>;
type Coleccion = FeatureCollection<MultiPolygon, { nombre: string; iso?: string }>;

const normalizar = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

const ALIAS: Record<string, string> = { "BOGOTA D C": "BOGOTA", "BOGOTA DC": "BOGOTA", "SAN ANDRES Y PROVIDENCIA": "SAN ANDRES", "VALLE": "VALLE DEL CAUCA" };
const clave = (s: string) => ALIAS[normalizar(s)] ?? normalizar(s);

/**
 * Mapa con regiones que se iluminan.
 * - pais "CO": departamentos de Colombia; `resaltar` son nombres de departamentos.
 * - cualquier otro código ISO (o "MUNDO"): mapa de países con zoom a lo resaltado;
 *   `resaltar` puede llevar códigos ISO o nombres de países.
 */
export function MapaRegion({ pais, resaltar = [], etiqueta }: { pais: string; resaltar?: string[]; etiqueta?: string }) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const { colores, tipografia } = useEstilo();

  const { regiones, objetivo, encuadre } = useMemo(() => {
    const esColombia = pais.toUpperCase() === "CO";
    const coleccion = (esColombia ? colombia : paises) as unknown as Coleccion;
    const regiones = coleccion.features as Region[];
    const buscados = new Set((esColombia ? resaltar : [pais, ...resaltar]).map(clave));
    const objetivo = new Set(
      regiones.filter((r) => buscados.has(clave(r.properties.nombre)) || (r.properties.iso && buscados.has(clave(r.properties.iso)))).map((r) => r.properties.nombre),
    );
    let encuadre: GeoJSON.GeoJsonObject;
    if (esColombia) {
      // San Andrés queda muy lejos del continente: se dibuja, pero no cuenta para el encuadre.
      encuadre = { type: "FeatureCollection", features: regiones.filter((r) => r.properties.nombre !== "SAN ANDRES") } as Coleccion;
    } else if (pais.toUpperCase() === "MUNDO" || objetivo.size === 0) {
      encuadre = coleccion;
    } else {
      const sel = { type: "FeatureCollection", features: regiones.filter((r) => objetivo.has(r.properties.nombre)) } as Coleccion;
      const [[x0, y0], [x1, y1]] = geoBounds(sel);
      const dx = Math.max(8, (x1 - x0) * 1.2);
      const dy = Math.max(6, (y1 - y0) * 1.2);
      encuadre = {
        type: "MultiPoint",
        coordinates: [
          [x0 - dx, Math.max(-80, y0 - dy)],
          [x1 + dx, Math.min(80, y1 + dy)],
        ],
      } as GeoJSON.MultiPoint;
    }
    return { regiones, objetivo, encuadre };
  }, [pais, resaltar.join("|")]);

  const ladoTexto = etiqueta ? 620 : 0;
  const proyeccion = geoMercator().fitExtent(
    [
      [ladoTexto + 80, 90],
      [width - 80, height - 90],
    ],
    encuadre as never,
  );
  const ruta = geoPath(proyeccion);
  const entrada = progreso(frame, 0, 20);
  const zoom = 1 + 0.04 * progreso(frame, 0, fps * 6);
  const ordenResaltadas = [...objetivo];

  return (
    <FondoGrafico>
      <AbsoluteFill style={{ opacity: entrada, transform: `scale(${zoom})`, transformOrigin: `${(ladoTexto + width) / 2}px 50%` }}>
        <svg width={width} height={height}>
          {regiones.map((r) => {
            const indice = ordenResaltadas.indexOf(r.properties.nombre);
            const activa = indice >= 0;
            const t = activa ? progreso(frame, 15 + indice * 6, 35 + indice * 6) : 0;
            const pulso = activa ? 0.85 + 0.15 * Math.sin((frame - 35) / 8) : 1;
            return (
              <path
                key={r.properties.nombre}
                d={ruta(r) ?? undefined}
                fill={activa ? colores.acento : "#ffffff"}
                fillOpacity={activa ? 0.12 + 0.78 * t * pulso : 0.07}
                stroke={activa ? colores.acento : "#ffffff"}
                strokeOpacity={activa ? 0.9 : 0.28}
                strokeWidth={activa ? 2.5 : 1.2}
              />
            );
          })}
          {regiones
            .filter((r) => objetivo.has(r.properties.nombre) && ordenResaltadas.length <= 6)
            .map((r) => {
              const [cx, cy] = ruta.centroid(r);
              const t = progreso(frame, 30, 45);
              return (
                <text
                  key={`t-${r.properties.nombre}`}
                  x={cx}
                  y={cy}
                  textAnchor="middle"
                  fontFamily={familia(tipografia.subtitulos)}
                  fontWeight={700}
                  fontSize={30}
                  fill={colores.texto}
                  opacity={t}
                  style={{ paintOrder: "stroke", stroke: colores.fondo, strokeWidth: 8 }}
                >
                  {r.properties.nombre.length > 18 ? r.properties.nombre.slice(0, 16) + "…" : titulo(r.properties.nombre)}
                </text>
              );
            })}
        </svg>
      </AbsoluteFill>
      {etiqueta && (
        <div style={{ position: "absolute", left: 120, top: 0, bottom: 0, width: ladoTexto - 40, display: "flex", alignItems: "center" }}>
          <div
            style={{
              fontFamily: familia(tipografia.titulos),
              fontSize: 110,
              lineHeight: 0.95,
              color: colores.texto,
              borderLeft: `10px solid ${colores.acento}`,
              paddingLeft: 36,
              opacity: progreso(frame, 20, 40),
              transform: `translateX(${(1 - progreso(frame, 20, 40)) * -40}px)`,
            }}
          >
            {etiqueta}
          </div>
        </div>
      )}
    </FondoGrafico>
  );
}

const titulo = (s: string) => s.toLowerCase().replace(/(^|\s)\p{L}/gu, (m) => m.toUpperCase());
