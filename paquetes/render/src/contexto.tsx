import { createContext, useContext } from "react";
import { staticFile } from "remotion";
import type { EstiloVisual } from "./tipos.ts";

export interface ContextoRender {
  estilo: EstiloVisual;
  base?: string;
}

export const ESTILO_POR_DEFECTO: EstiloVisual = {
  colores: { fondo: "#0E1116", acento: "#E0A526", texto: "#F4F1EA", alerta: "#C2412D" },
  tipografia: { titulos: "Bebas Neue", subtitulos: "Inter", cifras: "JetBrains Mono" },
  subtitulos: { activos: true, resaltar_palabra_actual: true, posicion: "inferior" },
  marca: {},
};

export const Contexto = createContext<ContextoRender>({ estilo: ESTILO_POR_DEFECTO });

export const useEstilo = () => useContext(Contexto).estilo;

/** Resuelve una ruta del proyecto a URL: servidor local al renderizar, API en la vista previa. */
export function useResolver() {
  const { base } = useContext(Contexto);
  return (src: string, huella?: string) => resolverSrc(src, base, huella);
}

export function resolverSrc(src: string, base?: string, huella?: string): string {
  if (/^(https?:|data:|blob:)/.test(src)) return src;
  const limpio = src.replace(/^\.?\//, "");
  const url = base ? `${base.replace(/\/$/, "")}/${limpio.split("/").map(encodeURIComponent).join("/")}` : staticFile(limpio);
  return huella ? `${url}${url.includes("?") ? "&" : "?"}v=${huella}` : url;
}

/** dB → ganancia lineal. */
export const dbAGanancia = (db: number) => Math.pow(10, db / 20);

const formatoCO = (decimales: number) =>
  new Intl.NumberFormat("es-CO", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });

/** Formato colombiano: puntos de miles y coma decimal. */
export const formatearNumero = (n: number, decimales = 0) => formatoCO(decimales).format(n);
