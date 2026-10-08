import { createReadStream } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import type { PropsMiniatura, PropsVideo, Timeline } from "./tipos.ts";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ_PAQUETE = resolve(AQUI, "..");
const CACHE_BUNDLES = resolve(RAIZ_PAQUETE, "../../.guion2video-tmp/bundles");

const TIPOS: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".json": "application/json",
};

/** Servidor de archivos estáticos con soporte de rangos (Chrome lo necesita para audio y video). */
export async function servirCarpeta(dir: string): Promise<{ url: string; cerrar: () => Promise<void> }> {
  const raiz = resolve(dir);
  const servidor: Server = createServer(async (req, res) => {
    try {
      const ruta = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
      const archivo = normalize(join(raiz, ruta));
      if (!archivo.startsWith(raiz + sep)) {
        res.writeHead(403).end();
        return;
      }
      const info = await stat(archivo);
      const tipo = TIPOS[extname(archivo).toLowerCase()] ?? "application/octet-stream";
      const cabeceras = { "content-type": tipo, "accept-ranges": "bytes", "access-control-allow-origin": "*" };
      const rango = req.headers.range?.match(/bytes=(\d*)-(\d*)/);
      if (rango) {
        const inicio = rango[1] ? Number(rango[1]) : 0;
        const fin = rango[2] ? Math.min(Number(rango[2]), info.size - 1) : info.size - 1;
        res.writeHead(206, { ...cabeceras, "content-range": `bytes ${inicio}-${fin}/${info.size}`, "content-length": fin - inicio + 1 });
        createReadStream(archivo, { start: inicio, end: fin }).pipe(res);
      } else {
        res.writeHead(200, { ...cabeceras, "content-length": info.size });
        createReadStream(archivo).pipe(res);
      }
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", r));
  const { port } = servidor.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    cerrar: () => new Promise((r) => servidor.close(() => r())),
  };
}

export async function huellaFuentes(): Promise<string> {
  const h = createHash("sha256");
  const recorrer = async (dir: string) => {
    for (const e of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const ruta = join(dir, e.name);
      if (e.isDirectory()) await recorrer(ruta);
      else if (/\.(tsx?|json)$/.test(e.name) && !e.name.endsWith(".test.ts")) h.update(e.name).update(await readFile(ruta));
    }
  };
  await recorrer(join(RAIZ_PAQUETE, "src"));
  h.update(await readFile(join(RAIZ_PAQUETE, "package.json")));
  return h.digest("hex").slice(0, 16);
}

let bundleEnCurso: Promise<string> | undefined;

/** Empaqueta el proyecto Remotion una vez y lo reutiliza mientras el código no cambie. */
export function obtenerBundle(alProgreso?: (p: number) => void): Promise<string> {
  bundleEnCurso ??= (async () => {
    const huella = await huellaFuentes();
    const destino = join(CACHE_BUNDLES, huella);
    try {
      await stat(join(destino, "index.html"));
      return destino;
    } catch {}
    return bundle({
      entryPoint: join(RAIZ_PAQUETE, "src", "entrada.ts"),
      outDir: destino,
      onProgress: (p) => alProgreso?.(p / 100),
    });
  })().catch((e) => {
    bundleEnCurso = undefined;
    throw e;
  });
  return bundleEnCurso;
}

export interface OpcionesRender {
  timeline: Timeline;
  dirProyecto: string;
  salida: string;
  calidad: "preview" | "final";
  alProgreso?: (fraccion: number, etapa: string) => void;
  concurrencia?: number;
}

/** Render a MP4 (H.264 + AAC). La vista previa sale a 540p para revisar rápido. */
export async function renderizarVideo(op: OpcionesRender): Promise<void> {
  const serveUrl = await obtenerBundle((p) => op.alProgreso?.(p, "empaquetando"));
  const servidor = await servirCarpeta(op.dirProyecto);
  try {
    const inputProps: PropsVideo = { timeline: op.timeline, base: servidor.url };
    const composition = await selectComposition({ serveUrl, id: "Video", inputProps: inputProps as unknown as Record<string, unknown> });
    const preview = op.calidad === "preview";
    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      outputLocation: op.salida,
      inputProps: inputProps as unknown as Record<string, unknown>,
      scale: preview ? 0.5 : 1,
      crf: preview ? 28 : 18,
      jpegQuality: preview ? 70 : 92,
      audioCodec: "aac",
      audioBitrate: preview ? "128k" : "320k",
      pixelFormat: "yuv420p",
      concurrency: op.concurrencia ?? null,
      timeoutInMilliseconds: 120_000,
      onProgress: ({ progress, stitchStage }) => op.alProgreso?.(progress, stitchStage === "muxing" ? "uniendo" : "renderizando"),
    });
  } finally {
    await servidor.cerrar();
  }
}

export async function renderizarMiniatura(op: { props: PropsMiniatura; dirProyecto: string; salida: string }): Promise<void> {
  const serveUrl = await obtenerBundle();
  const servidor = await servirCarpeta(op.dirProyecto);
  try {
    const inputProps = { ...op.props, base: servidor.url } as unknown as Record<string, unknown>;
    const composition = await selectComposition({ serveUrl, id: "Miniatura", inputProps });
    await renderStill({ composition, serveUrl, output: op.salida, inputProps, imageFormat: "png" });
  } finally {
    await servidor.cerrar();
  }
}

/** Render de la composición de demostración (prueba de componentes, sin archivos externos). */
export async function renderizarDemo(salida: string, op: { escala?: number } = {}): Promise<void> {
  const serveUrl = await obtenerBundle();
  const composition = await selectComposition({ serveUrl, id: "Demo", inputProps: {} });
  await renderMedia({ composition, serveUrl, codec: "h264", outputLocation: salida, scale: op.escala ?? 0.5, crf: 28 });
}
