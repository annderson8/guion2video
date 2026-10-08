# guion2video — Especificación del creador de videos con IA

> Especificación original con la que se construyó el proyecto (versión 1.0, 8 de octubre de 2026).
> Los cambios respecto a ella están en [MEJORAS.md](MEJORAS.md).

Este documento describe todo lo necesario para construir un sistema propio que convierte un **guion** en un **video documental narrado** (20–25 min, horizontal 16:9, en español) usando IA para la voz, las imágenes, los efectos de sonido y las animaciones con Remotion.

Está escrito para poder entregárselo a un desarrollador o a Claude Code y que lo construya por fases.

Toma como referencia de diseño el proyecto AS Video Studio (https://github.com/NeverBlink/as-video-studio), pero es una implementación propia: no se copia código hasta confirmar su licencia.

---

## 1. Objetivo

Producir un video documental de fraudes financieros de unos 20 minutos a partir de un guion ya escrito, con:

- Voz clonada del creador del canal.
- Entre 120 y 200 imágenes generadas con IA en un estilo visual fijo.
- Animaciones (zoom, paneo, mapas, cifras, líneas de tiempo, documentos) hechas con Remotion.
- Subtítulos sincronizados palabra por palabra.
- Música de fondo y efectos de sonido.
- Revisión humana entre cada paso.
- Costo controlado y visible antes de gastar.

**Meta de costo:** menos de 15 USD por video en APIs.
**Meta de tiempo:** menos de 3 horas de trabajo humano por video (revisión incluida).

---

## 2. Principios de diseño

1. **Es un sistema de compilación, no un botón mágico.** Cada paso produce archivos a partir de entradas. Si cambia una escena, solo se regenera esa escena y lo que depende de ella.
2. **Caché por huella (hash).** Cada salida guarda la huella de sus entradas. Si la huella no cambia, no se vuelve a pagar la generación.
3. **Revisión humana obligatoria** entre guion, voz, imágenes y render. Nada se publica sin que una persona lo vea.
4. **Proveedores intercambiables.** Voz, imágenes, música y efectos se usan a través de una interfaz común. Cambiar de OpenAI a Google o a otro proveedor es cambiar la configuración, no el código.
5. **El costo se muestra antes de ejecutar.** Cada paso calcula una estimación y la registra después de ejecutarse.
6. **Un estilo por canal, un encargo por video.** El estilo (dibujo, voz, ritmo, tipografía, música) se define una vez. Cada video solo aporta su guion, su título y sus llamadas a la acción.
7. **Cumplir políticas de YouTube desde el diseño** (ver sección 14).

---

## 3. Stack tecnológico

| Capa | Tecnología | Por qué |
|---|---|---|
| Lenguaje | TypeScript (Node.js 20+) | Remotion es TypeScript; un solo lenguaje en todo el proyecto |
| Monorepo | pnpm workspaces | Separar núcleo, proveedores, render y UI |
| Animación y render | Remotion 4 | Animaciones en React, render programático a MP4 |
| Procesamiento de audio | ffmpeg / ffprobe | Normalizar, mezclar y medir audio |
| API local | Fastify | Servidor ligero para la interfaz |
| Interfaz | React + Vite | Revisión de escenas, imágenes y audio |
| Base de datos | SQLite (better-sqlite3) | Proyectos, costos y trabajos; sin servidor aparte |
| Cola de trabajos | Cola propia en SQLite (o BullMQ si se necesita escalar) | Generar imágenes en paralelo con reintentos |
| Validación | Zod | Validar todos los JSON de entrada y salida |
| Pruebas | Vitest | Pruebas unitarias e integración en modo simulado |
| LLM | API de Anthropic (Claude) | Dividir el guion en escenas y escribir los prompts de imagen |

> **Licencia de Remotion:** es gratuita para personas y empresas pequeñas, pero las empresas más grandes necesitan licencia. Revisa las condiciones vigentes en remotion.dev antes de usarlo comercialmente.

---

## 4. Flujo completo (pipeline)

```
guion → escenas → voz → alineación → imágenes → audio_ambiente → composición → render → publicación
```

| # | Paso | Entrada | Salida | Revisión humana |
|---|---|---|---|---|
| 1 | `guion` | Texto del guion (Markdown) | `guion.md` limpio y normalizado | Sí |
| 2 | `escenas` | Guion + estilo | `escenas.json` (lista de escenas con texto, tipo visual y prompt) | Sí |
| 3 | `voz` | Texto de cada escena + voz del estilo | Un archivo de audio por escena | Sí (escuchar) |
| 4 | `alineacion` | Audio + texto | Tiempos por palabra de cada escena | No |
| 5 | `imagenes` | Prompts + estilo + referencias | Imágenes por escena | Sí (aprobar o regenerar) |
| 6 | `audio_ambiente` | Escenas + etiquetas de ambiente | Música y efectos elegidos por escena | Opcional |
| 7 | `composicion` | Todo lo anterior | `timeline.json` para Remotion | No |
| 8 | `render` | `timeline.json` | `video.mp4` + `subtitulos.srt` + miniatura | Sí (ver completo) |
| 9 | `publicacion` | Video + metadatos | Paquete listo para subir a YouTube | Sí |

Cada paso:

- Lee sus entradas de la carpeta del proyecto.
- Calcula su huella (`sha256` de entradas + parámetros + versión del paso).
- Si la huella coincide con la guardada, no hace nada.
- Si no coincide, ejecuta, guarda la salida y marca como **obsoletos** los pasos que dependen de él.
- Registra costo real, duración y errores.

La granularidad es **por escena**: cambiar el texto de la escena 12 solo regenera la voz, la alineación y la composición de la escena 12. Las imágenes solo se regeneran si cambió su prompt.

---

## 5. Modelo de datos

### 5.1 Estructura de carpetas de un proyecto

```
proyectos/
  2026-10-dmg/
    proyecto.json          # metadatos, estado de cada paso, huellas
    guion.md
    escenas.json
    audio/
      escena-001.mp3
      escena-001.alineacion.json
    imagenes/
      escena-001-a.png
      escena-001-a.meta.json   # prompt, modelo, semilla, costo
    ambiente/
      musica.json
      efectos.json
    timeline.json
    salida/
      video.mp4
      subtitulos.srt
      miniatura.png
      descripcion.txt
    costos.json
    bitacora.log
```

### 5.2 `estilo.json` (uno por canal)

```json
{
  "id": "fraudes-latam",
  "nombre": "Fraudes que marcaron a América Latina",
  "idioma": "es",
  "formato": { "ancho": 1920, "alto": 1080, "fps": 30 },
  "voz": {
    "proveedor": "elevenlabs",
    "voz_id": "VOZ_CLONADA_ID",
    "velocidad": 0.95,
    "estabilidad": 0.5
  },
  "imagen": {
    "proveedor_principal": "google-nano-banana-2",
    "proveedor_premium": "openai-gpt-image-2",
    "estilo_prompt": "ilustración editorial estilo documental, pintura digital, luz cinematográfica, paleta ocre y azul oscuro, textura de grano, sin texto",
    "negativo": "fotografía realista de personas reales, logotipos, marcas de agua, texto ilegible",
    "imagenes_referencia": ["estilos/fraudes-latam/ref-01.png", "estilos/fraudes-latam/ref-02.png"],
    "relacion_aspecto": "16:9"
  },
  "ritmo": {
    "segundos_por_imagen_min": 5,
    "segundos_por_imagen_max": 10
  },
  "tipografia": {
    "titulos": "Bebas Neue",
    "subtitulos": "Inter",
    "cifras": "JetBrains Mono"
  },
  "colores": {
    "fondo": "#0E1116",
    "acento": "#E0A526",
    "texto": "#F4F1EA",
    "alerta": "#C2412D"
  },
  "subtitulos": {
    "activos": true,
    "palabras_por_bloque": 6,
    "resaltar_palabra_actual": true,
    "posicion": "inferior"
  },
  "musica": {
    "proveedor": "jamendo",
    "volumen_db": -24,
    "ducking_db": -8
  },
  "intro_outro": {
    "intro": "estilos/fraudes-latam/intro.mp4",
    "outro": "estilos/fraudes-latam/outro.mp4"
  }
}
```

### 5.3 `escenas.json`

```json
{
  "proyecto": "2026-10-dmg",
  "escenas": [
    {
      "id": "escena-001",
      "parte": "Gancho",
      "texto_narracion": "Noviembre de 2008. Es de madrugada en un pueblo del Putumayo...",
      "nota_visual": "Filas larguísimas frente a un local, gente con bolsas de billetes",
      "tipo_visual": "imagen_ia",
      "imagenes": [
        {
          "id": "escena-001-a",
          "prompt": "Madrugada en un pueblo amazónico colombiano en 2008, larga fila de personas frente a un local comercial iluminado, bolsas de plástico con billetes, atmósfera tensa",
          "calidad": "estandar",
          "movimiento": "zoom_lento_entrada"
        }
      ],
      "graficos": [],
      "ambiente": { "musica": "tension_baja", "efectos": ["murmullo_multitud"] },
      "duracion_estimada_s": 18
    },
    {
      "id": "escena-014",
      "parte": "Parte 4: La fiebre",
      "texto_narracion": "Para 2008 tenía presencia en 62 municipios de Colombia...",
      "tipo_visual": "grafico",
      "graficos": [
        { "tipo": "mapa", "pais": "CO", "resaltar": ["Putumayo", "Nariño"], "etiqueta": "62 municipios" }
      ]
    }
  ]
}
```

### 5.4 Tipos visuales soportados

| `tipo_visual` | Qué muestra | Cómo se produce |
|---|---|---|
| `imagen_ia` | Ilustración de una escena | API de imágenes + movimiento Ken Burns en Remotion |
| `cifra` | Un número grande animado ("400.000 clientes") | Componente Remotion |
| `linea_tiempo` | Fechas clave | Componente Remotion |
| `mapa` | País o región resaltada | Componente Remotion con GeoJSON |
| `comparacion` | Barras o dos cifras enfrentadas (prometido vs. devuelto) | Componente Remotion |
| `documento` | Un titular o fragmento de sentencia recreado | Componente Remotion (texto escrito por nosotros, no copias de prensa) |
| `cita` | Frase corta en pantalla | Componente Remotion |
| `archivo` | Foto o video de archivo con licencia | Archivo local subido por el usuario, con su fuente |
| `titulo_parte` | Separador "Parte 3: El truco de las tarjetas" | Componente Remotion |

Regla: **al menos 25 % de las escenas deben ser gráficos animados** (cifras, mapas, líneas de tiempo). Bajan costos y suben retención.

---

## 6. Pasos en detalle

### 6.1 Paso `guion`

- Entrada: el guion en Markdown (como los 8 que ya tenemos).
- Quitar las notas de edición entre corchetes `[...]` del texto que se narra, pero guardarlas como `nota_visual` de la escena.
- Quitar encabezados, la sección de fuentes y las notas en cursiva.
- Normalizar números para la voz: "1.041 billones" → "un billón cuarenta y un mil millones" solo si el proveedor de voz los lee mal (configurable).
- Diccionario de pronunciación del canal (`pronunciacion.json`): "DMG" → "de eme ge", "Telexfree" → "télex fri", "Odebrecht" → "odebrecht".

### 6.2 Paso `escenas`

- Usa Claude (API de Anthropic) para dividir el guion en escenas de 5 a 20 segundos de narración.
- Cada escena tiene un solo tipo visual. Si es `imagen_ia`, Claude escribe el prompt combinando la nota visual + el `estilo_prompt` del canal.
- Claude decide qué escenas deben ser gráficos (cifras, fechas, mapas) en vez de imágenes.
- Reglas para los prompts:
  - Nunca pedir el rostro realista de una persona real identificable.
  - Personas reales se representan de espaldas, en silueta, en sombra o como ilustración claramente no fotográfica.
  - Sin logotipos ni marcas reales.
  - Época y lugar explícitos ("Bogotá en 2012", "París en 1925").
- La salida se valida con Zod. Si no valida, se reintenta una vez con el error.
- El usuario puede editar cualquier escena en la interfaz antes de seguir.

### 6.3 Paso `voz`

- Interfaz `ProveedorVoz`:
  ```ts
  interface ProveedorVoz {
    id: string;
    estimarCosto(texto: string): number;
    sintetizar(params: { texto: string; vozId: string; opciones: OpcionesVoz }): Promise<{
      audio: Buffer;
      formato: "mp3" | "wav";
      alineacion?: AlineacionPalabras; // si el proveedor la entrega
      costoUsd: number;
    }>;
  }
  ```
- Proveedores a implementar: **ElevenLabs** (primero) y **Cartesia** (alternativa).
- Clonar **solo la voz del dueño del canal**, con su consentimiento.
- Generar por escena, no el guion completo de una vez: si una escena suena mal, se regenera solo esa.
- Normalizar cada audio a -16 LUFS con ffmpeg.
- Pausa configurable entre escenas (por defecto 0,4 s) y pausa mayor al cambiar de parte (1,2 s).

### 6.4 Paso `alineacion`

- Si el proveedor de voz devuelve tiempos por carácter o por palabra, usarlos.
- Si no, transcribir el audio con un modelo de reconocimiento de voz con marcas de tiempo por palabra (Whisper vía API o local).
- Salida: lista de `{ palabra, inicio_ms, fin_ms }` por escena.
- Esta alineación alimenta los subtítulos y la duración exacta de cada escena.

### 6.5 Paso `imagenes`

- Interfaz `ProveedorImagen`:
  ```ts
  interface ProveedorImagen {
    id: string;
    modelo: string;
    estimarCosto(params: ParamsImagen): number;
    generar(params: ParamsImagen): Promise<{ imagen: Buffer; costoUsd: number; meta: Record<string, unknown> }>;
  }
  ```
- Proveedores a implementar, en este orden:
  1. **Google Nano Banana 2** (Gemini 3.1 Flash Image) — principal, buena relación calidad-precio y admite imágenes de referencia para mantener el estilo.
  2. **OpenAI GPT Image 2** — calidad premium y texto dentro de la imagen; se usa en escenas marcadas `"calidad": "premium"` y en la miniatura.
  3. **Seedream o FLUX vía fal.ai** — alternativa barata para volumen.
- **No usar** `gpt-image-1.5`, `gpt-image-1-mini` ni Imagen 4: están retirados o se retiran el 1 de diciembre de 2026.
- Los nombres de modelo van en configuración, nunca en el código.
- Generar en paralelo con un límite configurable (por defecto 4 a la vez) y reintentos con espera exponencial.
- Guardar junto a cada imagen un `.meta.json` con prompt, modelo, semilla, costo y fecha.
- En la interfaz: cuadrícula de imágenes por escena con botones **Aprobar**, **Regenerar**, **Editar prompt** y **Subir mi propia imagen**.
- Escalar a 1920×1080 (o 2x para permitir zoom sin perder calidad) con un escalador local si el modelo entrega menor resolución.

### 6.6 Paso `audio_ambiente`

- **Música:** Jamendo (licencias comerciales) o una biblioteca propia de pistas libres de derechos. Una pista por parte del video, con transiciones suaves.
- **Efectos:** FreeSound (solo licencias CC0 o CC-BY, guardando la atribución) o una biblioteca propia.
- Claude etiqueta cada escena con un ambiente (`tension_baja`, `revelacion`, `tribunal`, `nostalgia`) y efectos sugeridos.
- **Ducking:** la música baja automáticamente mientras hay voz.
- Guardar la licencia y la atribución de cada pista en `ambiente/creditos.json` para ponerlas en la descripción del video.

### 6.7 Paso `composicion`

- Une voz, alineación, imágenes, gráficos y ambiente en un `timeline.json` que Remotion lee directamente.
- La duración de cada escena es la duración real de su audio + la pausa.
- Si una escena tiene varias imágenes, se reparte su duración entre ellas.

```json
{
  "fps": 30,
  "ancho": 1920,
  "alto": 1080,
  "pistas": {
    "video": [
      { "desde": 0, "duracion": 540, "tipo": "imagen_ia", "src": "imagenes/escena-001-a.png", "movimiento": "zoom_lento_entrada" },
      { "desde": 540, "duracion": 300, "tipo": "cifra", "props": { "valor": 400000, "etiqueta": "clientes" } }
    ],
    "voz": [{ "desde": 0, "src": "audio/escena-001.mp3" }],
    "musica": [{ "desde": 0, "duracion": 5400, "src": "ambiente/musica-parte-1.mp3", "volumen_db": -24 }],
    "efectos": [{ "desde": 30, "src": "ambiente/murmullo.mp3", "volumen_db": -18 }],
    "subtitulos": [{ "desde": 0, "hasta": 45, "texto": "Noviembre de 2008." }]
  }
}
```

### 6.8 Paso `render`

- Remotion renderiza el `timeline.json` a `video.mp4` (H.264, AAC, 1080p, 30 fps).
- Primero un **render de vista previa** a 540p para revisar rápido; luego el render final.
- Genera además `subtitulos.srt` (para subirlo a YouTube por separado) y la miniatura.
- Render local por defecto. Opción futura: Remotion Lambda para renderizar en la nube.

### 6.9 Paso `publicacion`

- Genera `descripcion.txt` con: resumen, capítulos con marcas de tiempo (a partir de las partes del guion), fuentes del guion, créditos de música y efectos, y la nota de contenido generado con IA.
- Genera 3 opciones de título y 3 de miniatura para elegir.
- La subida a YouTube es manual en la primera versión. En una fase posterior, usar la API de YouTube Data para subir como borrador privado (nunca publicar automáticamente).

---

## 7. Componentes de Remotion

Ubicación: `paquetes/render/src/componentes/`

| Componente | Props principales | Descripción |
|---|---|---|
| `EscenaImagen` | `src`, `movimiento`, `duracion` | Imagen con efecto Ken Burns: `zoom_lento_entrada`, `zoom_lento_salida`, `paneo_izquierda`, `paneo_derecha`, `estatico` |
| `CifraAnimada` | `valor`, `prefijo`, `sufijo`, `etiqueta` | Número que cuenta desde 0 con formato colombiano (puntos de miles) |
| `LineaTiempo` | `eventos: {fecha, texto}[]` | Línea horizontal que se dibuja con los hitos |
| `MapaRegion` | `pais`, `resaltar[]`, `etiqueta` | Mapa con GeoJSON y regiones que se iluminan |
| `Comparacion` | `a: {valor, etiqueta}`, `b: {valor, etiqueta}` | Dos barras o círculos ("reclamado vs. devuelto") |
| `Documento` | `titulo`, `cuerpo`, `sello` | Hoja de papel animada con texto escrito por nosotros |
| `TituloParte` | `numero`, `titulo` | Separador entre partes del video |
| `Subtitulos` | `bloques[]`, `resaltar` | Subtítulos con la palabra actual resaltada en el color de acento |
| `Transicion` | `tipo` | Fundido, corte a negro, barrido |
| `MarcaCanal` | — | Logo pequeño en una esquina |
| `Video` (raíz) | `timeline` | Lee `timeline.json` y monta todo con `<Sequence>` y `<Audio>` |

Reglas de animación:

- Movimiento suave siempre: ninguna imagen totalmente estática más de 3 segundos.
- Transiciones cortas (8–12 frames).
- Gráficos legibles en celular: texto mínimo 48 px en 1080p.
- Paleta y tipografías tomadas del `estilo.json`, nunca escritas a mano en los componentes.

---

## 8. Arquitectura del código

```
guion2video/
  package.json
  pnpm-workspace.yaml
  .env.example
  paquetes/
    nucleo/              # grafo de pasos, huellas, obsolescencia, cola de trabajos, costos
      src/grafo.ts
      src/huella.ts
      src/trabajos.ts
      src/costos.ts
    pasos/               # un archivo por paso: guion, escenas, voz, alineacion, imagenes, ...
    proveedores/
      voz/elevenlabs.ts
      voz/cartesia.ts
      imagen/google-nano-banana.ts
      imagen/openai-gpt-image.ts
      imagen/fal-flux-seedream.ts
      llm/anthropic.ts
      audio/jamendo.ts
      audio/freesound.ts
      transcripcion/whisper.ts
    render/              # proyecto Remotion
      src/Root.tsx
      src/Video.tsx
      src/componentes/...
    api/                 # servidor Fastify
    web/                 # interfaz React + Vite
    cli/                 # comandos de línea
  estilos/
    fraudes-latam/
      estilo.json
      ref-01.png
      pronunciacion.json
  proyectos/             # ignorado en git
  secretos/              # ignorado en git
  docs/
```

Reglas de dependencia:

- `nucleo` no sabe nada de video.
- `pasos` no sabe nada de HTTP.
- `proveedores` no importa nada de `pasos` ni de `api`.
- `render` solo lee `timeline.json` y archivos; no llama a ninguna API de pago.

---

## 9. Línea de comandos (CLI)

La primera versión funciona completa desde la consola, antes de tener interfaz web.

```bash
pnpm guion2video nuevo --estilo fraudes-latam --guion guiones/01-dmg.md --slug 2026-10-dmg
pnpm guion2video estimar 2026-10-dmg              # muestra el costo estimado de cada paso
pnpm guion2video ejecutar 2026-10-dmg --hasta escenas
pnpm guion2video ejecutar 2026-10-dmg --hasta imagenes
pnpm guion2video regenerar 2026-10-dmg --escena escena-014 --paso imagenes
pnpm guion2video preview 2026-10-dmg              # render 540p
pnpm guion2video render 2026-10-dmg               # render final
pnpm guion2video estado 2026-10-dmg               # qué pasos están al día, obsoletos o con error
pnpm guion2video costos 2026-10-dmg
```

---

## 10. Interfaz web (fase 2)

Pantallas:

1. **Proyectos:** lista de videos con estado y costo acumulado.
2. **Guion y escenas:** el guion a la izquierda, las escenas a la derecha; editar texto, tipo visual y prompt.
3. **Voz:** reproductor por escena, botón regenerar, onda de audio.
4. **Imágenes:** cuadrícula por escena; aprobar, regenerar, editar prompt, subir imagen propia, elegir proveedor premium.
5. **Vista previa:** Remotion Player embebido para ver el video sin renderizar.
6. **Render y publicación:** botón de render final, descarga del MP4, SRT, miniatura y descripción.
7. **Configuración:** claves de API (se muestran solo los últimos 4 caracteres), botón "Probar claves", proveedores por defecto, presupuesto máximo por video.

Siempre visible: **costo estimado del siguiente paso** y **costo acumulado del video**.

---

## 11. Configuración y secretos

`.env.example`:

```bash
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GOOGLE_API_KEY=
FAL_API_KEY=
ELEVENLABS_API_KEY=
CARTESIA_API_KEY=
JAMENDO_CLIENT_ID=
FREESOUND_API_KEY=

GUION2VIDEO_PROYECTOS=./proyectos
GUION2VIDEO_ESTILOS=./estilos
GUION2VIDEO_PRESUPUESTO_MAX_USD=15
GUION2VIDEO_PARALELO_IMAGENES=4
GUION2VIDEO_SIMULAR=0          # 1 = no llama a ninguna API de pago; usa respuestas falsas
```

- Las claves nunca se guardan en el repositorio ni se envían al navegador.
- `GUION2VIDEO_SIMULAR=1` es obligatorio en todas las pruebas automáticas.

---

## 12. Costos

### 12.1 Registro

Cada llamada a un proveedor guarda en `costos.json`:

```json
{ "paso": "imagenes", "escena": "escena-014", "proveedor": "google-nano-banana-2", "modelo": "gemini-3.1-flash-image", "costo_usd": 0.067, "fecha": "2026-10-08T14:10:00-05:00", "cache": false }
```

### 12.2 Presupuesto

- Antes de ejecutar un paso, si el costo estimado supera lo que queda del presupuesto del video, se detiene y pide confirmación.
- Tabla de tarifas en `tarifas.json`, editable, porque los precios de las APIs cambian.

### 12.3 Estimación por video de 20 minutos (orientativa, octubre 2026)

| Concepto | Supuesto | Rango USD |
|---|---|---|
| Escenas y prompts (Claude) | 1–2 llamadas largas | 0,50 – 2 |
| Voz clonada | ~3.000 palabras | 2 – 6 (según plan del proveedor) |
| Imágenes estándar | ~130 imágenes a 0,03–0,07 | 4 – 9 |
| Imágenes premium | ~10 imágenes a 0,05–0,21 | 0,50 – 2 |
| Regeneraciones | ~20 % extra | 1 – 2 |
| Música y efectos | Jamendo / FreeSound | 0 – 2 |
| **Total** | | **≈ 8 – 23** |

Los precios deben confirmarse en las páginas oficiales de cada proveedor al configurar `tarifas.json`.

---

## 13. Calidad y validaciones automáticas

Antes del render final, el sistema revisa y avisa si:

- Alguna escena no tiene imagen aprobada.
- Alguna imagen está por debajo de 1280 px de ancho.
- El audio tiene silencios mayores a 2 segundos o picos por encima de -1 dBTP.
- La duración total está fuera del rango 18–28 minutos.
- Hay subtítulos de más de 2 líneas o que duran menos de 0,8 s.
- Más de 6 imágenes seguidas sin un gráfico intermedio.
- Algún prompt contiene nombres de personas reales junto a palabras como "retrato", "foto" o "realista".
- Falta la atribución de alguna pista de música o efecto.

---

## 14. Cumplimiento de políticas (YouTube y legal)

1. **Contenido sintético:** marcar en YouTube Studio la casilla de contenido alterado o sintético cuando haya imágenes realistas generadas con IA.
2. **Personas reales:** no generar rostros realistas de personas reales. Usar ilustración, silueta, espaldas o fotos de archivo con su fuente.
3. **Contenido inauténtico:** cada video lleva guion propio, investigación propia y voz editorial. Nada de plantillas idénticas ni subidas masivas. Variar estructura visual entre videos.
4. **Voz clonada:** solo la del dueño del canal.
5. **Derechos de autor:** música y efectos con licencia comercial y atribución; no reproducir textos de prensa en pantalla (escribir nuestras propias frases).
6. **Riesgo legal:** cada guion debe basarse en sentencias o fuentes públicas y usar "según la Fiscalía" o "presuntamente" en lo que no esté en firme. El sistema muestra la lista de fuentes del guion antes de publicar.

---

## 15. Pruebas

- **Unitarias:** huellas, detección de obsolescencia, cálculo de costos, división en escenas, generación de subtítulos.
- **Integración en modo simulado** (`GUION2VIDEO_SIMULAR=1`): un proyecto de ejemplo de 5 escenas recorre todo el pipeline hasta el MP4 sin gastar dinero.
- **Prueba de caché:** ejecutar dos veces seguidas el mismo proyecto; la segunda vez el costo debe ser 0.
- **Prueba de cambio parcial:** cambiar el texto de una escena; solo deben regenerarse voz, alineación y composición de esa escena.
- **Prueba de render:** un video de 30 segundos con todos los componentes de Remotion.

---

## 16. Plan de construcción por fases

### Fase 0 — Prueba de modelos de imagen (1–2 días)
- Script que genera las mismas 10 escenas del guion de DMG con Nano Banana 2, GPT Image 2 y Seedream/FLUX.
- Tabla comparativa de calidad, consistencia de estilo y costo por imagen útil.
- **Resultado:** elegir el proveedor principal y fijar el `estilo_prompt` y las imágenes de referencia.

### Fase 1 — MVP por consola (1–2 semanas)
- Núcleo: grafo de pasos, huellas, costos, modo simulado.
- Pasos: guion, escenas, voz (ElevenLabs), alineación, imágenes (proveedor elegido), composición, render.
- Remotion: `EscenaImagen`, `Subtitulos`, `TituloParte`, `CifraAnimada`.
- **Resultado:** el video de DMG completo renderizado desde la consola.

### Fase 2 — Calidad visual (1–2 semanas)
- Componentes: `LineaTiempo`, `MapaRegion`, `Comparacion`, `Documento`, transiciones.
- Música, efectos y ducking.
- Validaciones automáticas.
- **Resultado:** los 8 videos de la primera temporada producidos.

### Fase 3 — Interfaz web (2 semanas)
- Pantallas de revisión de escenas, voz e imágenes, vista previa con Remotion Player, configuración de claves.

### Fase 4 — Automatización y escala (opcional)
- Subida como borrador a YouTube con la API de YouTube Data.
- Render en la nube con Remotion Lambda.
- Instalación en un VPS con una sola orden y login delante.
- Segundo idioma (inglés) reutilizando las mismas imágenes.

---

## 17. Criterios de aceptación de la versión 1

- [ ] A partir del guion de DMG se obtiene un MP4 1080p de 18 a 25 minutos.
- [ ] La voz es la voz clonada del creador y no tiene errores de pronunciación en nombres propios.
- [ ] Los subtítulos coinciden con la voz con un desfase menor a 150 ms.
- [ ] Al menos 25 % de las escenas son gráficos animados.
- [ ] Ninguna imagen muestra el rostro realista de una persona real.
- [ ] Cambiar una escena y volver a renderizar no regenera las demás imágenes.
- [ ] El costo total de APIs del video queda registrado y es menor a 15 USD.
- [ ] La descripción incluye capítulos, fuentes, créditos y la nota de contenido con IA.
- [ ] Todas las pruebas pasan en modo simulado sin gastar dinero.

---

## 18. Pendientes por decidir

- Nombre definitivo del canal y del sistema.
- Proveedor de voz definitivo (ElevenLabs o Cartesia) tras escuchar ambas clonaciones.
- Proveedor principal de imágenes tras la Fase 0.
- Estilo visual: ilustración pintada, grabado antiguo, collage de archivo u otro.
- Si se usarán fotos de archivo de prensa y con qué criterio de uso.
- Si el sistema correrá en tu computador o en un VPS desde el inicio.
