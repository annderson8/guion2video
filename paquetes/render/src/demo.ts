import { ESTILO_POR_DEFECTO } from "./contexto.tsx";
import type { ItemVideo, Timeline } from "./tipos.ts";

const imagenDemo = (tono: number) =>
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="2560" height="1440"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${tono},50%,30%)"/><stop offset="1" stop-color="hsl(${tono + 50},45%,8%)"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="1800" cy="500" r="380" fill="hsl(${tono + 20},60%,50%)" opacity="0.35"/><rect x="300" y="900" width="1100" height="40" fill="#E0A526" opacity="0.5"/></svg>`,
  );

const FPS = 30;
const s = (seg: number) => Math.round(seg * FPS);

const piezas: Omit<ItemVideo, "desde" | "id" | "escena">[] = [
  { tipo: "titulo_parte", duracion: s(3), transicion: "negro", props: { numero: 1, titulo: "La fiebre" } },
  { tipo: "imagen_ia", duracion: s(3.5), transicion: "fundido", src: imagenDemo(30), movimiento: "zoom_lento_entrada" },
  { tipo: "cifra", duracion: s(3.5), transicion: "fundido", props: { valor: 400000, etiqueta: "clientes" } },
  { tipo: "linea_tiempo", duracion: s(4), transicion: "barrido", props: { titulo: "Cronología", eventos: [{ fecha: "2003", texto: "Primer local" }, { fecha: "2006", texto: "Expansión" }, { fecha: "2008", texto: "Intervención" }] } },
  { tipo: "mapa", duracion: s(3.5), transicion: "fundido", props: { pais: "CO", resaltar: ["Putumayo", "Nariño"], etiqueta: "62 municipios" } },
  { tipo: "comparacion", duracion: s(3.5), transicion: "fundido", props: { titulo: "Prometido vs. devuelto", a: { valor: 150, etiqueta: "Rentabilidad prometida" }, b: { valor: 12, etiqueta: "Devuelto" }, sufijo: " %" } },
  { tipo: "documento", duracion: s(3.5), transicion: "fundido", props: { titulo: "Superintendencia ordena intervención", cuerpo: "Se ordena la toma de posesión de los negocios, bienes y haberes.", sello: "INTERVENIDA", fecha: "17 de noviembre de 2008" } },
  { tipo: "cita", duracion: s(3), transicion: "fundido", props: { texto: "Nadie pregunta de dónde sale la plata mientras siga llegando.", autor: "Testimonio recreado" } },
  { tipo: "mapa", duracion: s(2.5), transicion: "fundido", props: { pais: "PA", resaltar: ["CO", "EC"], etiqueta: "Ruta del dinero" } },
];

let cursor = 0;
const video: ItemVideo[] = piezas.map((p, i) => {
  const item = { ...p, id: `demo-${i}`, escena: `escena-${String(i + 1).padStart(3, "0")}`, desde: cursor } as ItemVideo;
  cursor += p.duracion;
  return item;
});

const frase = "Noviembre de 2008. Es de madrugada en un pueblo del Putumayo y la fila ya da la vuelta a la manzana.";
const palabrasDemo = frase.split(" ");
const porPalabra = s(4.5) / palabrasDemo.length;

/** Timeline de 30 s que usa todos los componentes. Sirve para el Studio y para la prueba de render. */
export const TIMELINE_DEMO: Timeline = {
  version: 1,
  titulo: "Demo de componentes",
  fps: FPS,
  ancho: 1920,
  alto: 1080,
  duracion_frames: cursor,
  estilo: { ...ESTILO_POR_DEFECTO, marca: { texto: "GUION2VIDEO" } },
  pistas: {
    video,
    voz: [],
    musica: [],
    efectos: [],
    subtitulos: [0, 1].map((b) => {
      const ps = palabrasDemo.slice(b * 10, b * 10 + 10);
      const desde = s(3.2) + Math.round(b * 10 * porPalabra);
      return {
        desde,
        hasta: desde + Math.round(ps.length * porPalabra),
        texto: ps.join(" "),
        lineas: [ps.join(" ")],
        palabras: ps.map((t, j) => ({ texto: t, desde: desde + Math.round(j * porPalabra), hasta: desde + Math.round((j + 1) * porPalabra) })),
      };
    }),
  },
  partes: [{ titulo: "La fiebre", desde: 0 }],
};
