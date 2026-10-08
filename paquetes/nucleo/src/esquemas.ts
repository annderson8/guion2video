import { z } from "zod";

// ───────────────────────── Estilo (uno por canal) ─────────────────────────

export const Movimiento = z.enum([
  "zoom_lento_entrada",
  "zoom_lento_salida",
  "paneo_izquierda",
  "paneo_derecha",
  "estatico",
]);
export type Movimiento = z.infer<typeof Movimiento>;

export const TipoTransicion = z.enum(["fundido", "corte", "negro", "barrido"]);
export type TipoTransicion = z.infer<typeof TipoTransicion>;

export const Estilo = z.object({
  id: z.string(),
  nombre: z.string(),
  idioma: z.string().default("es"),
  formato: z.object({ ancho: z.number().int(), alto: z.number().int(), fps: z.number().int() }),
  voz: z.object({
    proveedor: z.string(),
    voz_id: z.string(),
    modelo: z.string().optional(),
    velocidad: z.number().default(1),
    estabilidad: z.number().default(0.5),
    similitud: z.number().default(0.75),
    normalizar_numeros: z.boolean().default(false),
    lufs: z.number().default(-16),
    pausa_escena_s: z.number().default(0.4),
    pausa_parte_s: z.number().default(1.2),
  }),
  imagen: z.object({
    proveedor_principal: z.string(),
    proveedor_premium: z.string(),
    estilo_prompt: z.string(),
    negativo: z.string().default(""),
    imagenes_referencia: z.array(z.string()).default([]),
    relacion_aspecto: z.string().default("16:9"),
  }),
  ritmo: z.object({
    segundos_por_imagen_min: z.number().default(5),
    segundos_por_imagen_max: z.number().default(10),
    porcentaje_minimo_graficos: z.number().default(25),
    max_imagenes_seguidas: z.number().int().default(6),
  }),
  tipografia: z.object({ titulos: z.string(), subtitulos: z.string(), cifras: z.string() }),
  colores: z.object({ fondo: z.string(), acento: z.string(), texto: z.string(), alerta: z.string() }),
  subtitulos: z.object({
    activos: z.boolean().default(true),
    palabras_por_bloque: z.number().int().default(6),
    resaltar_palabra_actual: z.boolean().default(true),
    posicion: z.enum(["inferior", "superior"]).default("inferior"),
  }),
  /**
   * Música y efectos se normalizan a la misma sonoridad que la voz (voz.lufs);
   * volumen_db es relativo a ese nivel. Con -6 y ducking -8, la música suena 6 dB por debajo
   * de la voz en las pausas y 14 dB por debajo mientras se narra.
   */
  musica: z.object({
    proveedor: z.string(),
    volumen_db: z.number().default(-6),
    ducking_db: z.number().default(-8),
    efectos_proveedor: z.string().default("biblioteca"),
    efectos_volumen_db: z.number().default(-10),
  }),
  intro_outro: z
    .object({ intro: z.string().optional(), outro: z.string().optional() })
    .default({}),
  marca: z.object({ logo: z.string().optional(), texto: z.string().optional() }).default({}),
  publicacion: z
    .object({
      nota_ia: z.string().default(
        "Este video usa voz sintética del creador del canal e ilustraciones generadas con inteligencia artificial. La investigación y el guion son originales.",
      ),
      llamadas_accion: z.array(z.string()).default([]),
    })
    .default({ nota_ia: "", llamadas_accion: [] }),
});
export type Estilo = z.infer<typeof Estilo>;

/** Diccionario de pronunciación: palabra o frase escrita → cómo se debe decir. */
export const Pronunciacion = z.record(z.string(), z.string());
export type Pronunciacion = z.infer<typeof Pronunciacion>;

// ───────────────────────── Guion estructurado ─────────────────────────

export const Oracion = z.object({
  id: z.string(), // "o-0001"
  texto: z.string(),
  notas: z.array(z.string()).default([]),
});
export type Oracion = z.infer<typeof Oracion>;

export const ParteGuion = z.object({
  id: z.string(), // "parte-01"
  titulo: z.string(),
  oraciones: z.array(Oracion),
});
export type ParteGuion = z.infer<typeof ParteGuion>;

export const GuionEstructurado = z.object({
  titulo: z.string(),
  partes: z.array(ParteGuion),
  fuentes: z.array(z.string()).default([]),
  palabras: z.number().int(),
});
export type GuionEstructurado = z.infer<typeof GuionEstructurado>;

// ───────────────────────── Escenas ─────────────────────────

export const TipoVisual = z.enum([
  "imagen_ia",
  "cifra",
  "linea_tiempo",
  "mapa",
  "comparacion",
  "documento",
  "cita",
  "archivo",
  "titulo_parte",
]);
export type TipoVisual = z.infer<typeof TipoVisual>;

export const TIPOS_GRAFICOS: TipoVisual[] = [
  "cifra",
  "linea_tiempo",
  "mapa",
  "comparacion",
  "documento",
  "cita",
  "titulo_parte",
];

export const ImagenEscena = z.object({
  id: z.string(),
  prompt: z.string(),
  calidad: z.enum(["estandar", "premium"]).default("estandar"),
  movimiento: Movimiento.default("zoom_lento_entrada"),
  /** Solo para tipo "archivo": de dónde viene y con qué licencia. */
  fuente: z.string().optional(),
});
export type ImagenEscena = z.infer<typeof ImagenEscena>;

const Valor = z.object({ valor: z.number(), etiqueta: z.string() });

export const Grafico = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("cifra"),
    valor: z.number(),
    prefijo: z.string().optional(),
    sufijo: z.string().optional(),
    decimales: z.number().int().min(0).max(3).optional(),
    etiqueta: z.string(),
  }),
  z.object({
    tipo: z.literal("linea_tiempo"),
    titulo: z.string().optional(),
    eventos: z.array(z.object({ fecha: z.string(), texto: z.string() })).min(1).max(8),
  }),
  z.object({
    tipo: z.literal("mapa"),
    pais: z.string(),
    resaltar: z.array(z.string()).default([]),
    etiqueta: z.string().optional(),
  }),
  z.object({
    tipo: z.literal("comparacion"),
    titulo: z.string().optional(),
    a: Valor,
    b: Valor,
    prefijo: z.string().optional(),
    sufijo: z.string().optional(),
  }),
  z.object({
    tipo: z.literal("documento"),
    titulo: z.string(),
    cuerpo: z.string(),
    sello: z.string().optional(),
    fecha: z.string().optional(),
  }),
  z.object({ tipo: z.literal("cita"), texto: z.string(), autor: z.string().optional() }),
  z.object({ tipo: z.literal("titulo_parte"), numero: z.number().int().optional(), titulo: z.string() }),
]);
export type Grafico = z.infer<typeof Grafico>;

export const Escena = z
  .object({
    id: z.string(),
    parte: z.string(),
    /** Rango de oraciones del guion que cubre esta escena (garantiza texto literal). */
    oraciones: z.tuple([z.string(), z.string()]).optional(),
    texto_narracion: z.string(),
    nota_visual: z.string().optional(),
    tipo_visual: TipoVisual,
    imagenes: z.array(ImagenEscena).default([]),
    grafico: Grafico.optional(),
    ambiente: z
      .object({ musica: z.string().default("neutral"), efectos: z.array(z.string()).default([]) })
      .default({ musica: "neutral", efectos: [] }),
    transicion: TipoTransicion.optional(),
    duracion_estimada_s: z.number().optional(),
  })
  .superRefine((e, ctx) => {
    if ((e.tipo_visual === "imagen_ia" || e.tipo_visual === "archivo") && e.imagenes.length === 0) {
      ctx.addIssue({ code: "custom", message: `${e.id}: tipo ${e.tipo_visual} necesita al menos una imagen` });
    }
    if (e.tipo_visual !== "imagen_ia" && e.tipo_visual !== "archivo") {
      if (!e.grafico) {
        ctx.addIssue({ code: "custom", message: `${e.id}: tipo ${e.tipo_visual} necesita "grafico"` });
      } else if (e.grafico.tipo !== e.tipo_visual) {
        ctx.addIssue({
          code: "custom",
          message: `${e.id}: grafico.tipo (${e.grafico.tipo}) no coincide con tipo_visual (${e.tipo_visual})`,
        });
      }
    }
  });
export type Escena = z.infer<typeof Escena>;

export const BibliaVisual = z.object({
  epoca_y_lugar: z.string(),
  personas_reales: z.array(z.string()).default([]),
  personajes: z
    .array(z.object({ nombre: z.string(), representacion: z.string() }))
    .default([]),
  lugares: z.array(z.object({ nombre: z.string(), descripcion: z.string() })).default([]),
});
export type BibliaVisual = z.infer<typeof BibliaVisual>;

export const ArchivoEscenas = z.object({
  proyecto: z.string(),
  biblia: BibliaVisual.optional(),
  escenas: z.array(Escena),
});
export type ArchivoEscenas = z.infer<typeof ArchivoEscenas>;

// ───────────────────────── Alineación ─────────────────────────

export const PalabraAlineada = z.object({
  palabra: z.string(),
  inicio_ms: z.number(),
  fin_ms: z.number(),
});
export type PalabraAlineada = z.infer<typeof PalabraAlineada>;

export const Alineacion = z.object({
  escena: z.string(),
  fuente: z.enum(["proveedor", "transcripcion", "estimada"]),
  duracion_ms: z.number(),
  palabras: z.array(PalabraAlineada),
});
export type Alineacion = z.infer<typeof Alineacion>;

// ───────────────────────── Proyecto ─────────────────────────

export const NOMBRES_PASOS = [
  "guion",
  "escenas",
  "voz",
  "alineacion",
  "imagenes",
  "audio_ambiente",
  "composicion",
  "render",
  "publicacion",
] as const;
export const NombrePaso = z.enum(NOMBRES_PASOS);
export type NombrePaso = z.infer<typeof NombrePaso>;

export const EstadoPaso = z.object({
  huella: z.string().optional(),
  ejecutado: z.string().optional(),
  duracion_ms: z.number().optional(),
  costo_usd: z.number().optional(),
  error: z.string().optional(),
  /** La aprobación solo vale para la huella que se aprobó. */
  aprobado: z.object({ huella: z.string(), fecha: z.string(), por: z.string().optional() }).optional(),
  avisos: z.array(z.string()).optional(),
  /** Huella del contenido producido (p. ej. escenas.json) para detectar ediciones manuales. */
  huella_salida: z.string().optional(),
  resumen: z.string().optional(),
});
export type EstadoPaso = z.infer<typeof EstadoPaso>;

export const Proyecto = z.object({
  version: z.literal(1).default(1),
  slug: z.string(),
  titulo: z.string().optional(),
  estilo: z.string(),
  creado: z.string(),
  guion_origen: z.string().optional(),
  presupuesto_usd: z.number().optional(),
  pasos: z.record(z.string(), EstadoPaso).default({}),
});
export type Proyecto = z.infer<typeof Proyecto>;

// ───────────────────────── Costos ─────────────────────────

export const RegistroCosto = z.object({
  paso: z.string(),
  escena: z.string().optional(),
  unidad: z.string().optional(),
  proveedor: z.string(),
  modelo: z.string().optional(),
  costo_usd: z.number(),
  fecha: z.string(),
  cache: z.boolean(),
  detalle: z.record(z.string(), z.unknown()).optional(),
});
export type RegistroCosto = z.infer<typeof RegistroCosto>;

/** Tarifas editables. Los precios cambian; confírmalos en la web de cada proveedor. */
export const Tarifas = z.object({
  actualizado: z.string(),
  llm: z.record(z.string(), z.object({ entrada_por_millon: z.number(), salida_por_millon: z.number() })),
  voz: z.record(z.string(), z.object({ por_mil_caracteres: z.number() })),
  imagen: z.record(z.string(), z.object({ estandar: z.number(), premium: z.number().optional() })),
  transcripcion: z.record(z.string(), z.object({ por_minuto: z.number() })),
  audio: z.record(z.string(), z.object({ por_pista: z.number() })).default({}),
});
export type Tarifas = z.infer<typeof Tarifas>;

// ───────────────────────── Configuración de proveedores ─────────────────────────

/** Nombres de modelo y opciones por proveedor. Nunca en el código. */
export const ConfigProveedores = z.object({
  llm: z.object({
    proveedor: z.string().default("anthropic"),
    modelo: z.string(),
    esfuerzo: z.enum(["low", "medium", "high", "xhigh", "max"]).default("high"),
  }),
  voz: z.record(z.string(), z.record(z.string(), z.unknown())).default({}),
  imagen: z.record(z.string(), z.record(z.string(), z.unknown())).default({}),
  transcripcion: z.object({ proveedor: z.string(), modelo: z.string() }),
  imagenes: z.object({
    paralelo: z.number().int().default(4),
    reintentos: z.number().int().default(3),
    ancho_salida: z.number().int().default(2560),
    alto_salida: z.number().int().default(1440),
  }),
});
export type ConfigProveedores = z.infer<typeof ConfigProveedores>;
