import sharp from "sharp";
import { sha256, type CalculadoraCostos } from "@guion2video/nucleo";
import type { ProveedorImagen } from "../tipos.ts";

const escapar = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function envolver(texto: string, ancho: number): string[] {
  const lineas: string[] = [];
  let linea = "";
  for (const p of texto.split(/\s+/)) {
    if ((linea + " " + p).trim().length > ancho) {
      lineas.push(linea.trim());
      linea = p;
    } else linea += " " + p;
  }
  if (linea.trim()) lineas.push(linea.trim());
  return lineas;
}

/** Imagen falsa: degradado de color estable por prompt con el texto del prompt encima. */
export function crearImagenSimulada(costos?: CalculadoraCostos): ProveedorImagen {
  return {
    id: "simulado",
    modelo: "svg",
    estimarCosto: ({ calidad }) => costos?.imagen("simulado", calidad) ?? 0,
    async generar(p) {
      const h = sha256(p.prompt);
      const tono = parseInt(h.slice(0, 2), 16) * 1.4;
      const ancho = 1536;
      const alto = 864;
      const lineas = envolver(p.prompt.split("\n")[0], 52).slice(0, 6);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}">
        <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="hsl(${tono},45%,28%)"/><stop offset="1" stop-color="hsl(${(tono + 60) % 360},40%,10%)"/>
        </linearGradient></defs>
        <rect width="100%" height="100%" fill="url(#g)"/>
        <circle cx="${ancho * 0.72}" cy="${alto * 0.35}" r="${alto * 0.28}" fill="hsl(${(tono + 30) % 360},55%,45%)" opacity="0.35"/>
        <text x="80" y="110" font-family="Helvetica, Arial" font-size="30" fill="#E0A526" letter-spacing="6">SIMULADO · ${p.calidad.toUpperCase()}</text>
        ${lineas
          .map((l, i) => `<text x="80" y="${220 + i * 62}" font-family="Helvetica, Arial" font-size="46" fill="#F4F1EA">${escapar(l)}</text>`)
          .join("")}
      </svg>`;
      return { imagen: await sharp(Buffer.from(svg)).png().toBuffer(), costoUsd: costos?.imagen("simulado", p.calidad) ?? 0, meta: { simulado: true } };
    },
  };
}
