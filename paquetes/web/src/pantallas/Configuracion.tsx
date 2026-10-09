import { useState } from "react";
import { api } from "../api.ts";
import { useAccion, useDatos } from "../ganchos.ts";

interface Config {
  simular: boolean;
  presupuesto_max_usd: number;
  paralelo_imagenes: number;
  claves: Record<string, string | null>;
  llm: { proveedor: string; modelo: string; esfuerzo: string };
  estilos: { id: string; voz: string; voz_id: string; imagen_principal: string; imagen_premium: string; musica: string; efectos: string }[];
}
interface Prueba { clave: string; presente: boolean; ok?: boolean; detalle: string }


export function Configuracion() {
  const { datos, recargar } = useDatos<Config>("/configuracion");
  const [claves, setClaves] = useState<Record<string, string>>({});
  const [pruebas, setPruebas] = useState<Prueba[] | null>(null);
  const accion = useAccion();
  if (!datos) return <div className="cargando">Cargando…</div>;
  return (
    <div className="rejilla dos" style={{ alignItems: "start" }}>
      <div className="panel rejilla">
        <div className="fila">
          <h2>Claves de API</h2>
          <span className="espacio" />
          <button className="boton chico" disabled={accion.ocupado} onClick={() => accion.ejecutar(async () => setPruebas(await api.post<Prueba[]>("/configuracion/probar")))}>
            Probar claves
          </button>
        </div>
        <p style={{ color: "var(--texto-3)", margin: 0 }}>Se guardan en <code>.env</code> en tu computador. Nunca se envían al navegador: solo ves los últimos 4 caracteres.</p>
        {Object.entries(datos.claves).map(([k, v]) => {
          const p = pruebas?.find((x) => x.clave === k);
          return (
            <label key={k}>
              <span className="fila">
                {k}
                <span className="espacio" />
                {p && <span style={{ color: !p.presente ? "var(--texto-3)" : p.ok ? "var(--ok)" : "#ff8b78" }}>{!p.presente ? "sin configurar" : p.ok ? `✓ ${p.detalle}` : `✗ ${p.detalle}`}</span>}
              </span>
              <input type="password" autoComplete="off" placeholder={v ?? "sin configurar"} value={claves[k] ?? ""} onChange={(e) => setClaves({ ...claves, [k]: e.target.value })} />
            </label>
          );
        })}
        <div className="fila">
          <span className="espacio" />
          <button className="boton primario" disabled={accion.ocupado || !Object.values(claves).some(Boolean)} onClick={() => accion.ejecutar(async () => { await api.put("/configuracion/claves", claves); setClaves({}); await recargar(); }, "Claves guardadas")}>
            Guardar claves
          </button>
        </div>
        {accion.error && <div className="mensaje">{accion.error}</div>}
        {accion.mensaje && <div className="mensaje ok">{accion.mensaje}</div>}
      </div>

      <div className="rejilla">
        <div className="panel rejilla">
          <h2>General</h2>
          <Ajuste etiqueta="Presupuesto máximo por video (USD)" valor={String(datos.presupuesto_max_usd)} clave="GUION2VIDEO_PRESUPUESTO_MAX_USD" alGuardar={recargar} />
          <Ajuste etiqueta="Imágenes en paralelo" valor={String(datos.paralelo_imagenes)} clave="GUION2VIDEO_PARALELO_IMAGENES" alGuardar={recargar} />
          <Ajuste etiqueta="Modo simulado (1 = no gasta, 0 = APIs reales). Requiere reiniciar la API." valor={datos.simular ? "1" : "0"} clave="GUION2VIDEO_SIMULAR" alGuardar={recargar} />
        </div>
        <ModeloClaude modelo={datos.llm.modelo} alGuardar={recargar} />
        <div className="panel rejilla">
          <h2>Estilos de canal</h2>
          <p style={{ color: "var(--texto-3)", margin: 0 }}>La voz, los proveedores de imagen, los colores y el resto de la identidad de cada canal se editan en <a href="#/estilos">Estilos</a>.</p>
          <div className="fila">
            {datos.estilos.map((e) => <a key={e.id} className="boton chico" href={`#/estilos/${e.id}`}>{e.id}</a>)}
          </div>
        </div>
      </div>
    </div>
  );
}

function Ajuste({ etiqueta, valor, clave, alGuardar }: { etiqueta: string; valor: string; clave: string; alGuardar: () => Promise<void> }) {
  const [v, setV] = useState(valor);
  const accion = useAccion();
  return (
    <label>
      {etiqueta}
      <span className="fila" style={{ flexWrap: "nowrap" }}>
        <input value={v} onChange={(e) => setV(e.target.value)} />
        <button className="boton chico" disabled={v === valor || accion.ocupado} onClick={() => accion.ejecutar(async () => { await api.put("/configuracion/claves", { [clave]: v }); await alGuardar(); })}>Guardar</button>
      </span>
    </label>
  );
}

function ModeloClaude({ modelo, alGuardar }: { modelo: string; alGuardar: () => Promise<void> }) {
  const [v, setV] = useState(modelo);
  const accion = useAccion();
  return (
    <div className="panel rejilla">
      <h2>Claude</h2>
      <label>
        Modelo (todos los estilos): un alias como "opus" o un ID completo como "claude-opus-5-5"
        <span className="fila" style={{ flexWrap: "nowrap" }}>
          <input value={v} onChange={(e) => setV(e.target.value)} />
          <button className="boton chico" disabled={!v.trim() || v === modelo || accion.ocupado} onClick={() => accion.ejecutar(async () => { await api.put("/configuracion/proveedores", { llm_modelo: v.trim() }); await alGuardar(); }, "Guardado")}>Guardar</button>
        </span>
      </label>
      {accion.error && <div className="mensaje">{accion.error}</div>}
      {accion.mensaje && <span style={{ color: "var(--ok)" }}>{accion.mensaje}</span>}
    </div>
  );
}
