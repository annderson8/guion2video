import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface ResultadoComando {
  stdout: string;
  stderr: string;
}

export function ejecutarComando(comando: string, args: string[], op: { entrada?: Buffer } = {}): Promise<ResultadoComando> {
  return new Promise((resolve, reject) => {
    const proceso = spawn(comando, args, { stdio: ["pipe", "pipe", "pipe"] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    proceso.stdout.on("data", (d) => out.push(d));
    proceso.stderr.on("data", (d) => err.push(d));
    proceso.on("error", (e) =>
      reject(
        (e as NodeJS.ErrnoException).code === "ENOENT"
          ? new Error(`No encuentro "${comando}". Instálalo (p. ej. brew install ffmpeg) y vuelve a intentar.`)
          : e,
      ),
    );
    proceso.on("close", (codigo) => {
      const stdout = Buffer.concat(out).toString("utf8");
      const stderr = Buffer.concat(err).toString("utf8");
      if (codigo === 0) resolve({ stdout, stderr });
      else reject(new Error(`${comando} terminó con código ${codigo}:\n${stderr.split("\n").slice(-15).join("\n")}`));
    });
    if (op.entrada) proceso.stdin.end(op.entrada);
    else proceso.stdin.end();
  });
}

export const ffmpeg = (args: string[]) => ejecutarComando("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);

/** ffmpeg sin silenciar el log (algunos filtros como loudnorm o ebur128 informan por stderr). */
export const ffmpegConLog = (args: string[]) => ejecutarComando("ffmpeg", ["-hide_banner", "-nostats", "-y", ...args]);

export async function duracionMs(ruta: string): Promise<number> {
  const { stdout } = await ejecutarComando("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", ruta,
  ]);
  const s = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(s)) throw new Error(`No pude medir la duración de ${ruta}`);
  return Math.round(s * 1000);
}

export async function tieneAudio(ruta: string): Promise<boolean> {
  const { stdout } = await ejecutarComando("ffprobe", [
    "-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", ruta,
  ]);
  return stdout.trim().length > 0;
}

interface MedicionLoudnorm {
  input_i: string;
  input_tp: string;
  input_lra: string;
  input_thresh: string;
  target_offset: string;
}

function extraerJsonFinal(texto: string): MedicionLoudnorm {
  const inicio = texto.lastIndexOf("{");
  const fin = texto.lastIndexOf("}");
  return JSON.parse(texto.slice(inicio, fin + 1));
}

/**
 * Normaliza la sonoridad a `lufs` con loudnorm en dos pasadas (medir y luego corregir de forma lineal),
 * que evita el "bombeo" de la pasada única en clips cortos.
 */
export async function normalizarSonoridad(
  entrada: string,
  salida: string,
  op: { lufs: number; picoDb?: number; lra?: number; frecuencia?: number; canales?: number; codec?: string[] },
): Promise<void> {
  const tp = op.picoDb ?? -1.5;
  const lra = op.lra ?? 11;
  const objetivo = `I=${op.lufs}:TP=${tp}:LRA=${lra}`;
  const medida = await ffmpegConLog(["-i", entrada, "-af", `loudnorm=${objetivo}:print_format=json`, "-f", "null", "-"]);
  const m = extraerJsonFinal(medida.stderr);
  const filtro =
    Number.isFinite(Number(m.input_i)) && Number(m.input_i) > -70
      ? `loudnorm=${objetivo}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`
      : "anull"; // silencio total: no hay nada que normalizar
  await ffmpeg([
    "-i", entrada,
    "-af", filtro,
    "-ar", String(op.frecuencia ?? 48000),
    "-ac", String(op.canales ?? 1),
    ...(op.codec ?? []),
    salida,
  ]);
}

/** Crea una carpeta temporal y la borra al terminar. */
export async function conTemporal<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "guion2video-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export interface MedicionAudio {
  lufsIntegrado: number;
  picoVerdaderoDb: number;
}

/** Mide sonoridad integrada y pico verdadero (dBTP) con ebur128. */
export async function medirAudio(ruta: string): Promise<MedicionAudio> {
  const { stderr } = await ffmpegConLog(["-i", ruta, "-af", "ebur128=peak=true", "-f", "null", "-"]);
  const resumen = stderr.slice(stderr.lastIndexOf("Summary:"));
  const i = resumen.match(/I:\s+(-?[\d.]+|-inf)\s+LUFS/);
  const pico = resumen.match(/True peak:\s+Peak:\s+(-?[\d.]+|-inf)\s+dBFS/);
  return {
    lufsIntegrado: i && i[1] !== "-inf" ? Number(i[1]) : -Infinity,
    picoVerdaderoDb: pico && pico[1] !== "-inf" ? Number(pico[1]) : -Infinity,
  };
}

/** Silencios más largos que `minimoS` (en ms desde el inicio). */
export async function detectarSilencios(ruta: string, minimoS: number, umbralDb = -45) {
  const { stderr } = await ffmpegConLog(["-i", ruta, "-af", `silencedetect=noise=${umbralDb}dB:d=${minimoS}`, "-f", "null", "-"]);
  const silencios: { inicio_ms: number; fin_ms: number }[] = [];
  let inicio: number | undefined;
  for (const linea of stderr.split("\n")) {
    const a = linea.match(/silence_start:\s*(-?[\d.]+)/);
    const b = linea.match(/silence_end:\s*(-?[\d.]+)/);
    if (a) inicio = Number(a[1]) * 1000;
    if (b && inicio !== undefined) {
      silencios.push({ inicio_ms: Math.round(inicio), fin_ms: Math.round(Number(b[1]) * 1000) });
      inicio = undefined;
    }
  }
  return silencios;
}
