import { usd } from "../api.ts";
import { useDatos } from "../ganchos.ts";
import { useProyecto } from "./Proyecto.tsx";

interface Resumen {
  total: number;
  porPaso: Record<string, { costo_usd: number; llamadas: number; cache: number }>;
  porProveedor: Record<string, number>;
  registros: { paso: string; escena?: string; unidad?: string; proveedor: string; modelo?: string; costo_usd: number; fecha: string; cache: boolean }[];
}

export function Costos() {
  const { slug, version, detalle } = useProyecto();
  const { datos } = useDatos<Resumen>(`/proyectos/${slug}/costos`, [version]);
  if (!datos) return <div className="cargando">Cargando…</div>;
  return (
    <div className="rejilla dos" style={{ alignItems: "start" }}>
      <div className="panel">
        <h2 style={{ marginBottom: 10 }}>Gasto real por paso</h2>
        <table>
          <thead><tr><th>Paso</th><th>Llamadas</th><th>Desde caché</th><th style={{ textAlign: "right" }}>USD</th></tr></thead>
          <tbody>
            {Object.entries(datos.porPaso).map(([p, x]) => (
              <tr key={p}><td>{p}</td><td>{x.llamadas}</td><td>{x.cache}</td><td className="num">{usd(x.costo_usd)}</td></tr>
            ))}
            <tr><td><strong>Total</strong></td><td /><td /><td className="num"><strong>{usd(datos.total)}</strong></td></tr>
          </tbody>
        </table>
        <h2 style={{ margin: "22px 0 10px" }}>Estimado de lo que falta</h2>
        <table>
          <tbody>
            {detalle.estimacion.map((e) => (
              <tr key={e.nombre}><td>{e.titulo}</td><td style={{ color: "var(--texto-3)" }}>{e.detalle}</td><td className="num">{usd(e.costo_usd)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel">
        <h2 style={{ marginBottom: 10 }}>Por proveedor</h2>
        <table>
          <tbody>{Object.entries(datos.porProveedor).map(([p, x]) => <tr key={p}><td>{p}</td><td className="num">{usd(x)}</td></tr>)}</tbody>
        </table>
        <h2 style={{ margin: "22px 0 10px" }}>Últimas llamadas</h2>
        <table>
          <tbody>
            {datos.registros.slice(-40).reverse().map((r, i) => (
              <tr key={i}>
                <td className="mono" style={{ color: "var(--texto-3)" }}>{new Date(r.fecha).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}</td>
                <td>{r.paso}</td>
                <td className="mono">{r.unidad ?? r.escena ?? ""}</td>
                <td style={{ color: "var(--texto-3)" }}>{r.modelo ?? r.proveedor}{r.cache ? " · caché" : ""}</td>
                <td className="num">{usd(r.costo_usd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
