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

const VOCES = ["elevenlabs", "cartesia", "local-say"];
const IMAGENES = ["google-nano-banana-2", "openai-gpt-image-2", "fal-seedream", "fal-flux"];
const AUDIO = ["jamendo", "freesound", "biblioteca"];

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
        {datos.estilos.map((e) => (
          <ProveedoresEstilo key={e.id} estilo={e} modelo={datos.llm.modelo} alGuardar={recargar} />
        ))}
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

function ProveedoresEstilo({ estilo, modelo, alGuardar }: { estilo: Config["estilos"][number]; modelo: string; alGuardar: () => Promise<void> }) {
  const [f, setF] = useState({ ...estilo, llm_modelo: modelo });
  const accion = useAccion();
  const campo = (k: keyof typeof f, etiqueta: string, opciones?: string[]) => (
    <label>
      {etiqueta}
      {opciones ? (
        <select value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })}>
          {[...new Set([f[k], ...opciones])].map((o) => <option key={o}>{o}</option>)}
        </select>
      ) : (
        <input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
      )}
    </label>
  );
  return (
    <div className="panel rejilla">
      <h2>Proveedores · estilo {estilo.id}</h2>
      <div className="rejilla dos">
        {campo("voz", "Voz", VOCES)}
        {campo("voz_id", "ID de la voz clonada")}
        {campo("imagen_principal", "Imágenes (principal)", IMAGENES)}
        {campo("imagen_premium", "Imágenes (premium y miniaturas)", IMAGENES)}
        {campo("musica", "Música", AUDIO)}
        {campo("efectos", "Efectos", AUDIO)}
        {campo("llm_modelo", "Modelo de Claude (todos los estilos)")}
      </div>
      <div className="fila">
        {accion.error && <div className="mensaje">{accion.error}</div>}
        {accion.mensaje && <span style={{ color: "var(--ok)" }}>{accion.mensaje}</span>}
        <span className="espacio" />
        <button className="boton primario" disabled={accion.ocupado} onClick={() => accion.ejecutar(async () => { await api.put("/configuracion/proveedores", { ...f, estilo: estilo.id }); await alGuardar(); }, "Guardado")}>Guardar proveedores</button>
      </div>
    </div>
  );
}
