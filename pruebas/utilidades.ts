import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { CalculadoraCostos, cargarConfig, EspacioProyecto, bitacoraSilenciosa, RAIZ, type Tarifas } from "@guion2video/nucleo";
import { crearProveedores } from "@guion2video/proveedores";
import { aprobar, calcularEstado, crearContexto, ejecutarHasta, obtenerPaso, type ContextoPaso, type ResultadoEjecucion } from "@guion2video/pasos";
import type { NombrePaso } from "@guion2video/nucleo";

/** Tarifas de prueba: el proveedor "simulado" cobra, para poder comprobar que la caché ahorra. */
export const TARIFAS_PRUEBA: Tarifas = {
  actualizado: "prueba",
  llm: { simulado: { entrada_por_millon: 3, salida_por_millon: 15 } },
  voz: { simulado: { por_mil_caracteres: 0.2 } },
  imagen: { simulado: { estandar: 0.05, premium: 0.2 } },
  transcripcion: { simulado: { por_minuto: 0 } },
  audio: {},
};

export async function proyectoDePrueba(guion = "pruebas/fixtures/guion-corto.md") {
  const dir = await mkdtemp(join(tmpdir(), "guion2video-prueba-"));
  const config = cargarConfig({ ...process.env, GUION2VIDEO_SIMULAR: "1", GUION2VIDEO_PROYECTOS: dir });
  const slug = "prueba";
  await EspacioProyecto.crear(config, { slug, estilo: "fraudes-latam", guion: resolve(RAIZ, guion) });
  const proveedores = await crearProveedores(config, { costos: new CalculadoraCostos(TARIFAS_PRUEBA) });
  const ctx = await crearContexto(slug, { config, log: bitacoraSilenciosa, proveedores });
  return { ctx, config, dir, limpiar: () => rm(dir, { recursive: true, force: true }) };
}

/** Ejecuta hasta `hasta` aprobando cada revisión, como haría una persona que revisa y da el visto bueno. */
export async function ejecutarAprobando(ctx: ContextoPaso, hasta: NombrePaso): Promise<ResultadoEjecucion[]> {
  const vueltas: ResultadoEjecucion[] = [];
  for (let i = 0; i < 20; i++) {
    const r = await ejecutarHasta(ctx, hasta);
    vueltas.push(r);
    if (!r.detenido) {
      if ((await calcularEstado(ctx, obtenerPaso(hasta))).estado === "revision") await aprobar(ctx, hasta);
      return vueltas;
    }
    if (r.detenido.motivo !== "revision") throw new Error(`Se detuvo en ${r.detenido.paso}: ${r.detenido.mensaje}`);
    await aprobar(ctx, r.detenido.paso);
    if (r.detenido.paso === hasta) return vueltas;
  }
  throw new Error("Demasiadas vueltas");
}
