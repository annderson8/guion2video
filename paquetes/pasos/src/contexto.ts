import {
  cargarConfig,
  cargarEstilo,
  crearBitacora,
  EspacioProyecto,
  RegistroCostos,
  type Bitacora,
  type Config,
  type EstiloCargado,
  type OpcionesBitacora,
  type Proyecto,
} from "@guion2video/nucleo";
import { crearProveedores, type Proveedores } from "@guion2video/proveedores";

export interface ContextoPaso {
  config: Config;
  espacio: EspacioProyecto;
  proyecto: Proyecto;
  estilo: EstiloCargado;
  proveedores: Proveedores;
  costos: RegistroCostos;
  log: Bitacora;
  /** Unidades (ids de escena o de imagen) que hay que regenerar aunque estén en caché. */
  forzar: Set<string>;
  /** Permite sobrescribir escenas.json editado a mano. */
  forzarSobrescritura: boolean;
}

export interface OpcionesContexto {
  config?: Config;
  bitacora?: Omit<OpcionesBitacora, "archivo">;
  log?: Bitacora;
  proveedores?: Proveedores;
}

export async function crearContexto(slug: string, op: OpcionesContexto = {}): Promise<ContextoPaso> {
  const config = op.config ?? cargarConfig();
  const espacio = await EspacioProyecto.abrir(config, slug);
  const proyecto = await espacio.leer();
  const log = op.log ?? crearBitacora({ ...op.bitacora, archivo: espacio.rutas.bitacora });
  const estilo = await cargarEstilo(config, proyecto.estilo);
  const proveedores = op.proveedores ?? (await crearProveedores(config, { avisar: log.aviso }));
  return {
    config,
    espacio,
    proyecto,
    estilo,
    proveedores,
    costos: new RegistroCostos(espacio.rutas.costos),
    log,
    forzar: new Set(),
    forzarSobrescritura: false,
  };
}

/** Recarga proyecto.json (otro proceso o paso pudo cambiarlo). */
export async function refrescar(ctx: ContextoPaso): Promise<Proyecto> {
  ctx.proyecto = await ctx.espacio.leer();
  return ctx.proyecto;
}
