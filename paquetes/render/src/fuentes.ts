import { continueRender, delayRender } from "remotion";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cargador = () => Promise<{ loadFont: (...args: any[]) => { fontFamily: string; waitUntilDone: () => Promise<unknown> } }>;

/**
 * Fuentes disponibles para estilo.json. Se importan bajo demanda para no meter
 * todo el catálogo de Google Fonts en el bundle. Añade aquí las que necesites.
 */
const FUENTES: Record<string, Cargador> = {
  "Bebas Neue": () => import("@remotion/google-fonts/BebasNeue"),
  Inter: () => import("@remotion/google-fonts/Inter"),
  "JetBrains Mono": () => import("@remotion/google-fonts/JetBrainsMono"),
  Oswald: () => import("@remotion/google-fonts/Oswald"),
  Montserrat: () => import("@remotion/google-fonts/Montserrat"),
  "Playfair Display": () => import("@remotion/google-fonts/PlayfairDisplay"),
  "Source Serif 4": () => import("@remotion/google-fonts/SourceSerif4"),
  "IBM Plex Mono": () => import("@remotion/google-fonts/IBMPlexMono"),
  "Special Elite": () => import("@remotion/google-fonts/SpecialElite"),
  Roboto: () => import("@remotion/google-fonts/Roboto"),
};

const cargadas = new Map<string, Promise<void>>();

export function cargarFuentes(nombres: string[]): void {
  for (const nombre of new Set(nombres)) {
    if (cargadas.has(nombre) || !FUENTES[nombre]) continue;
    const handle = delayRender(`Cargando fuente ${nombre}`, { timeoutInMilliseconds: 60_000 });
    const promesa = FUENTES[nombre]()
      .then(async (m) => {
        try {
          await m.loadFont("normal", { subsets: ["latin", "latin-ext"] }).waitUntilDone();
        } catch {
          await m.loadFont().waitUntilDone();
        }
      })
      .catch((e) => console.warn(`No se pudo cargar la fuente ${nombre}:`, e))
      .finally(() => continueRender(handle));
    cargadas.set(nombre, promesa);
  }
}

/** Pila CSS con respaldo genérico. */
export const familia = (nombre: string, respaldo: "sans-serif" | "serif" | "monospace" = "sans-serif") =>
  `"${nombre}", ${respaldo}`;
