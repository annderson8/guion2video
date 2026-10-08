import { join } from "node:path";
import { conTemporal, duracionMs, ffmpeg, normalizarSonoridad, tieneAudio } from "@guion2video/proveedores";

export interface EntradaMezcla {
  src: string; // ruta absoluta
  desde_ms: number;
  duracion_ms?: number;
  volumen_db?: number;
}

export interface OpcionesMezcla {
  salida: string;
  duracionMs: number;
  voces: EntradaMezcla[];
  musica: EntradaMezcla[];
  efectos: EntradaMezcla[];
  extras: EntradaMezcla[]; // audio de intro/outro
  duckingDb: number;
  lufs: number;
}

/** Une intervalos con voz separados por menos de `hueco` ms. */
export function regionesConVoz(voces: { desde_ms: number; duracion_ms: number }[], hueco = 1500) {
  const ordenadas = [...voces].sort((a, b) => a.desde_ms - b.desde_ms);
  const regiones: [number, number][] = [];
  for (const v of ordenadas) {
    const fin = v.desde_ms + v.duracion_ms;
    const ultima = regiones[regiones.length - 1];
    if (ultima && v.desde_ms - ultima[1] < hueco) ultima[1] = Math.max(ultima[1], fin);
    else regiones.push([v.desde_ms, fin]);
  }
  return regiones;
}

/**
 * Expresión de volumen para ffmpeg: la música baja `duckingDb` mientras hay voz,
 * con rampas de 0,3 s al entrar y 0,8 s al salir.
 */
export function expresionDucking(regiones: [number, number][], duckingDb: number): string {
  if (!regiones.length || duckingDb === 0) return "1";
  const ataque = 0.3;
  const salida = 0.8;
  const r = regiones.map(([a, b]) => {
    const ini = (a / 1000 - ataque).toFixed(3);
    const fin = (b / 1000 + salida).toFixed(3);
    return `clip(min((t-${ini})/${ataque},(${fin}-t)/${salida}),0,1)`;
  });
  const maximo = r.reduce((acc, x) => `max(${acc},${x})`);
  return `pow(10,${duckingDb}*${maximo}/20)`;
}

/** Mezcla voz + música (con ducking) + efectos + intro/outro en un WAV estéreo normalizado. */
export async function mezclar(op: OpcionesMezcla): Promise<void> {
  const D = (op.duracionMs / 1000).toFixed(3);
  const args: string[] = [];
  const filtros: string[] = [];
  const buses: string[] = [];
  let n = 0;
  const ms = (x: number) => Math.max(0, Math.round(x));

  const voces = op.voces.map((v) => {
    args.push("-i", v.src);
    const etiqueta = `v${n}`;
    filtros.push(`[${n++}:a]aresample=48000,aformat=channel_layouts=mono,adelay=${ms(v.desde_ms)}:all=1[${etiqueta}]`);
    return etiqueta;
  });
  if (voces.length) {
    filtros.push(`${voces.map((v) => `[${v}]`).join("")}amix=inputs=${voces.length}:normalize=0:dropout_transition=0,pan=stereo|c0=c0|c1=c0[voz]`);
    buses.push("[voz]");
  }

  const extras: string[] = [];
  for (const e of op.extras) {
    if (!(await tieneAudio(e.src))) continue;
    args.push("-i", e.src);
    const etiqueta = `x${n}`;
    filtros.push(`[${n++}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${ms(e.desde_ms)}:all=1[${etiqueta}]`);
    extras.push(etiqueta);
  }
  if (extras.length) {
    filtros.push(`${extras.map((v) => `[${v}]`).join("")}amix=inputs=${extras.length}:normalize=0[extras]`);
    buses.push("[extras]");
  }

  const pistas = op.musica.map((m) => {
    args.push("-stream_loop", "-1", "-i", m.src);
    const d = Math.max(1, (m.duracion_ms ?? 0) / 1000);
    const salidaFade = Math.max(0, d - 3).toFixed(3);
    const etiqueta = `m${n}`;
    filtros.push(
      `[${n++}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:${d.toFixed(3)},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=2,afade=t=out:st=${salidaFade}:d=3,volume=${m.volumen_db ?? 0}dB,adelay=${ms(m.desde_ms)}:all=1[${etiqueta}]`,
    );
    return etiqueta;
  });
  if (pistas.length) {
    const regiones = regionesConVoz(op.voces.map((v) => ({ desde_ms: v.desde_ms, duracion_ms: v.duracion_ms ?? 0 })));
    filtros.push(`${pistas.map((v) => `[${v}]`).join("")}amix=inputs=${pistas.length}:normalize=0,volume='${expresionDucking(regiones, op.duckingDb)}':eval=frame[musica]`);
    buses.push("[musica]");
  }

  const efectos = op.efectos.map((e) => {
    args.push("-i", e.src);
    const d = Math.max(0.3, (e.duracion_ms ?? 3000) / 1000);
    const etiqueta = `e${n}`;
    filtros.push(
      `[${n++}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:${d.toFixed(3)},asetpts=PTS-STARTPTS,afade=t=out:st=${Math.max(0, d - 0.4).toFixed(3)}:d=0.4,volume=${e.volumen_db ?? -18}dB,adelay=${ms(e.desde_ms)}:all=1[${etiqueta}]`,
    );
    return etiqueta;
  });
  if (efectos.length) {
    filtros.push(`${efectos.map((v) => `[${v}]`).join("")}amix=inputs=${efectos.length}:normalize=0[efectos]`);
    buses.push("[efectos]");
  }

  if (!buses.length) {
    args.push("-f", "lavfi", "-i", `anullsrc=r=48000:cl=stereo`);
    buses.push(`[${n++}:a]`);
  }
  filtros.push(`${buses.join("")}amix=inputs=${buses.length}:normalize=0:duration=longest,apad=whole_dur=${D},atrim=0:${D}[salida]`);

  await conTemporal(async (dir) => {
    const previa = join(dir, "previa.wav");
    await ffmpeg([...args, "-filter_complex", filtros.join(";"), "-map", "[salida]", "-c:a", "pcm_s24le", "-ar", "48000", previa]);
    // Normalización final al estándar de YouTube (-14 LUFS, pico verdadero ≤ -1,5 dBTP).
    await normalizarSonoridad(previa, op.salida, { lufs: op.lufs, picoDb: -1.5, canales: 2, frecuencia: 48000, codec: ["-c:a", "pcm_s16le"] });
  });
  const real = await duracionMs(op.salida);
  if (Math.abs(real - op.duracionMs) > 200) throw new Error(`La mezcla dura ${real} ms y debía durar ${op.duracionMs} ms`);
}
