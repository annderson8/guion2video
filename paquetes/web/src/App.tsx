import { useDatos, useRuta } from "./ganchos.ts";
import { Proyectos } from "./pantallas/Proyectos.tsx";
import { Proyecto } from "./pantallas/Proyecto.tsx";
import { Configuracion } from "./pantallas/Configuracion.tsx";

export function App() {
  const ruta = useRuta();
  const salud = useDatos<{ simular: boolean }>("/salud");
  const [seccion, slug, pestana] = ruta;
  return (
    <div className="app">
      <header className="cabecera">
        <a className="marca" href="#/">
          GUION<span>2</span>VIDEO
        </a>
        <nav>
          <a href="#/" className={!seccion || seccion === "p" ? "activo" : ""}>Proyectos</a>
          <a href="#/configuracion" className={seccion === "configuracion" ? "activo" : ""}>Configuración</a>
        </nav>
        {salud.datos?.simular && <span className="simulado" title="GUION2VIDEO_SIMULAR=1: no se llama a ninguna API de pago">MODO SIMULADO</span>}
        {salud.error && <span className="simulado" style={{ color: "#ff8b78" }}>API sin conexión</span>}
      </header>
      <main className="contenido">
        {seccion === "configuracion" ? <Configuracion /> : seccion === "p" && slug ? <Proyecto slug={slug} pestana={pestana ?? "resumen"} /> : <Proyectos />}
      </main>
    </div>
  );
}
