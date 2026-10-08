import { appendFile } from "node:fs/promises";

export type Nivel = "info" | "aviso" | "error" | "detalle";

export interface Bitacora {
  info(msg: string): void;
  aviso(msg: string): void;
  error(msg: string): void;
  detalle(msg: string): void;
  progreso(paso: string, hechos: number, total: number, msg?: string): void;
}

export interface OpcionesBitacora {
  archivo?: string;
  consola?: boolean;
  verbose?: boolean;
  alEvento?: (evento: { nivel: Nivel | "progreso"; msg: string; paso?: string; hechos?: number; total?: number }) => void;
}

const COLORES: Record<Nivel, string> = { info: "\x1b[36m", aviso: "\x1b[33m", error: "\x1b[31m", detalle: "\x1b[90m" };

export function crearBitacora(op: OpcionesBitacora = {}): Bitacora {
  const consola = op.consola ?? true;
  const escribir = (nivel: Nivel, msg: string) => {
    const linea = `${new Date().toISOString()} [${nivel}] ${msg}`;
    if (op.archivo) appendFile(op.archivo, linea + "\n").catch(() => {});
    op.alEvento?.({ nivel, msg });
    if (!consola || (nivel === "detalle" && !op.verbose)) return;
    const salida = nivel === "error" ? process.stderr : process.stdout;
    salida.write(`${COLORES[nivel]}${nivel === "info" ? "•" : nivel === "aviso" ? "!" : nivel === "error" ? "✗" : "·"}\x1b[0m ${msg}\n`);
  };
  return {
    info: (m) => escribir("info", m),
    aviso: (m) => escribir("aviso", m),
    error: (m) => escribir("error", m),
    detalle: (m) => escribir("detalle", m),
    progreso: (paso, hechos, total, msg) => {
      op.alEvento?.({ nivel: "progreso", msg: msg ?? "", paso, hechos, total });
      if (consola && process.stdout.isTTY) {
        process.stdout.write(`\r\x1b[2K  ${paso}: ${hechos}/${total}${msg ? " · " + msg : ""}`);
        if (hechos >= total) process.stdout.write("\n");
      } else if (consola && op.verbose) {
        process.stdout.write(`  ${paso}: ${hechos}/${total}${msg ? " · " + msg : ""}\n`);
      }
    },
  };
}

export const bitacoraSilenciosa: Bitacora = crearBitacora({ consola: false });
