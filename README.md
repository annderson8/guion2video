# guion2video

[![pruebas](https://github.com/annderson8/guion2video/actions/workflows/pruebas.yml/badge.svg)](https://github.com/annderson8/guion2video/actions/workflows/pruebas.yml)
[![Licencia MIT](https://img.shields.io/badge/licencia-MIT-blue.svg)](LICENSE)

Convierte un **guion en Markdown** en un **video documental narrado** (16:9, español) con voz clonada, ilustraciones con IA, gráficos animados en Remotion, subtítulos palabra por palabra, música con *ducking* y paquete de publicación para YouTube. Sirve para cualquier canal: el estilo (voz, dibujo, colores, tipografía, música) se define una vez y cada video solo aporta su guion.

> **English:** guion2video turns a Markdown script into a narrated documentary video (Spanish-first) using AI voice, AI illustrations, Remotion animations and word-level subtitles, with content-hash caching, human review gates and cost estimates before spending. Self-hosted, bring your own API keys. MIT licensed.

Funciona como un sistema de compilación: cada paso guarda la huella de sus entradas y solo se vuelve a ejecutar (y a pagar) lo que cambió. Entre los pasos clave hay revisión humana obligatoria, y el costo se estima antes de gastar.

```
guion → escenas → voz → alineación → imágenes → música/efectos → composición → render → publicación
```

Todo corre en tu computador con tus propias claves de API (Anthropic, ElevenLabs, Google, OpenAI…). Puedes probarlo completo **sin claves y sin gastar** en modo simulado.

El diseño está en [docs/ESPECIFICACIONES.md](docs/ESPECIFICACIONES.md), y los cambios que se hicieron sobre ella al construirlo, en [docs/MEJORAS.md](docs/MEJORAS.md).

---

## Requisitos

- Node.js 20 o superior (probado con 24)
- pnpm: `corepack enable` (o `npm i -g pnpm`)
- ffmpeg y ffprobe: `brew install ffmpeg` (macOS) o `sudo apt install ffmpeg` (Linux)
- Remotion descarga Chrome Headless solo la primera vez que renderiza.

## Instalación

```bash
corepack enable
git clone https://github.com/annderson8/guion2video.git
cd guion2video
pnpm install
cp .env.example .env        # pon tus claves aquí (o desde la interfaz → Configuración)
```

## Primer video en modo simulado (sin gastar)

Con `GUION2VIDEO_SIMULAR=1` (o `--simular`) ningún paso llama a una API de pago: la voz es un tono, las imágenes son marcadores de posición y Claude se reemplaza por una respuesta determinista. Sirve para probar todo el flujo de punta a punta.

```bash
export GUION2VIDEO_SIMULAR=1
pnpm guion2video nuevo --estilo fraudes-latam --guion guiones/ejemplo-el-dorado.md --slug prueba
pnpm guion2video ejecutar prueba --hasta escenas   # se detiene: revisa el guion
pnpm guion2video aprobar prueba --paso guion
pnpm guion2video ejecutar prueba --hasta escenas   # revisa proyectos/prueba/escenas.json
pnpm guion2video aprobar prueba --paso escenas
pnpm guion2video ejecutar prueba --hasta imagenes
pnpm guion2video aprobar prueba --paso imagenes
pnpm guion2video ejecutar prueba --hasta composicion   # se detiene en la voz
pnpm guion2video aprobar prueba --paso voz
pnpm guion2video preview prueba                    # 540p rápido
pnpm guion2video render prueba                     # 1080p + SRT + miniatura
pnpm guion2video aprobar prueba --paso render
pnpm guion2video publicar prueba                   # descripción, capítulos, 3 títulos y 3 miniaturas
```

## Producción con APIs reales

1. **Claves**: llena `.env` y verifica con `pnpm guion2video probar-claves` (no gasta: solo lista modelos o voces).
2. **Estilo de tu canal**: crea el tuyo (ver [Crear tu propio estilo](#crear-tu-propio-estilo)) y pon en `voz.voz_id` el ID de tu voz en ElevenLabs o Cartesia.
3. **Pronunciación**: en `pronunciacion.json` del estilo (`"DMG": "de eme ge"`). Solo afecta a la voz; los subtítulos muestran el texto escrito.
4. **Modelos**: los IDs están en [configuracion.json](configuracion.json) y las tarifas en [tarifas.json](tarifas.json). **Confirma ambos en la documentación de cada proveedor** antes de producir: los precios y los IDs cambian.
5. **Fase 0**: compara proveedores de imagen con las mismas escenas antes de fijar el principal:
   ```bash
   pnpm guion2video comparar-imagenes 2026-10-dmg --n 10 --proveedores google-nano-banana-2,openai-gpt-image-2,fal-seedream
   # abre proyectos/2026-10-dmg/comparacion/index.html
   ```
6. **Estimar antes de gastar**: `pnpm guion2video estimar <slug>` muestra el costo de lo que falta (lo que ya está en caché no cuenta). Si un paso supera el presupuesto del video, se detiene y pide confirmación (`--si` para aceptar).

## Crear tu propio estilo

Un estilo es la identidad fija de un canal; cada video solo aporta su guion. El repositorio trae un ejemplo, [estilos/fraudes-latam](estilos/fraudes-latam/estilo.json) (documentales de fraudes financieros). Para crear el tuyo:

```bash
cp -r estilos/fraudes-latam estilos/mi-canal
# edita estilos/mi-canal/estilo.json y pronunciacion.json
pnpm guion2video nuevo --estilo mi-canal --guion mi-guion.md --slug 2026-11-mi-video
```

En `estilo.json` defines:

- **voz**: proveedor (`elevenlabs`, `cartesia` o `local-say` para borradores gratis en macOS), ID de voz, velocidad y pausas.
- **imagen**: proveedores principal y premium, el `estilo_prompt` que se añade a cada ilustración, lo que hay que evitar e imágenes de referencia.
- **ritmo**: segundos por imagen y porcentaje mínimo de gráficos animados.
- **colores, tipografía** (fuentes de Google disponibles en [fuentes.ts](paquetes/render/src/fuentes.ts)), **subtítulos**, **música**, intro/outro y marca.
- **publicación**: la nota sobre el uso de IA y las llamadas a la acción de la descripción.

Las instrucciones que recibe Claude para dividir en escenas son genéricas para documentales narrados. Si tu canal es de otro género, ajústalas en [prompts.ts](paquetes/pasos/src/prompts.ts).

## Interfaz web

```bash
pnpm dev            # API (127.0.0.1:4310) + interfaz (http://localhost:5173)
```

O compilada, servida por la propia API: `pnpm --filter @guion2video/web build && pnpm api` → http://127.0.0.1:4310

Pantallas: proyectos, resumen del pipeline (estado, costo estimado, ejecutar, aprobar), guion y escenas (edición), voz (reproductor y regenerar por escena), imágenes (aprobar, regenerar, editar prompt, subir imagen propia, pasar a premium), vista previa con Remotion Player, render y publicación (validaciones, descargas, títulos, miniaturas, descripción), costos y configuración (claves enmascaradas, probar claves, proveedores, presupuesto). El costo acumulado y el del siguiente paso están siempre visibles.

La API escucha solo en `127.0.0.1` y nunca envía las claves al navegador.

## Comandos

| Comando | Qué hace |
|---|---|
| `nuevo --estilo --guion --slug [--titulo] [--presupuesto]` | Crea el proyecto (copia el guion dentro) |
| `estado <slug>` | Pasos al día, obsoletos, por revisar o con error |
| `estimar <slug> [--hasta paso]` | Costo de lo que falta |
| `ejecutar <slug> --hasta <paso> [--si]` | Ejecuta lo necesario para llegar a ese paso; se detiene en cada revisión |
| `aprobar <slug> --paso <paso> [--imagen id] [--escena id]` | Aprueba (en imágenes, también una a una) |
| `regenerar <slug> --paso <paso> --escena <id> \| --imagen <id>` | Regenera solo esas unidades, ignorando la caché |
| `editar-prompt <slug> --imagen <id> --prompt "…" [--calidad premium]` | Cambia el prompt de una imagen |
| `subir-imagen <slug> --imagen <id> --archivo foto.jpg [--fuente "…"]` | Reemplaza con una imagen propia (queda aprobada) |
| `validar <slug>` | Revisiones automáticas antes del render |
| `preview <slug>` / `render <slug> [--forzar]` | Render 540p / 1080p |
| `publicar <slug>` | Muestra las fuentes y genera el paquete de publicación |
| `costos <slug>` | Gasto real por paso y proveedor |
| `comparar-imagenes <slug>` | Fase 0 |
| `probar-claves` | Verifica las claves sin gastar |
| `demo [--salida demo.mp4]` | Renderiza la demo de 30 s con todos los componentes |

Opciones globales: `--simular`, `--verbose`, `--si`. Para ver la pila de un error: `GUION2VIDEO_DEBUG=1`.

## Cómo escribir el guion

```markdown
# Título del episodio

> Notas para ti: las líneas que empiezan con ">" no se narran.

## Gancho

[Nota visual: fila larga frente a un local, madrugada]
Noviembre de 2008. Es de madrugada en un pueblo del Putumayo…

*Música: tensión baja*        ← línea en cursiva: nota, no se narra

## Parte 1: El truco de las tarjetas

Texto narrado. Usa "según la Fiscalía" o "presuntamente" en lo que no esté en firme.

## Fuentes

- Sentencia del Juzgado …, 2012.
- Informe de la Superintendencia …
```

- `#` es el título; cada `##` abre una parte (y un capítulo de YouTube). Si el título es "Parte N: Nombre", el separador animado muestra "PARTE N · NOMBRE".
- Las `[notas entre corchetes]` y las líneas en cursiva se quitan de la narración y se guardan como nota visual de la escena donde aparecían.
- La sección **Fuentes** no se narra: va a la descripción del video y se muestra antes de publicar.

## Carpeta de un proyecto

```
proyectos/2026-10-dmg/
  proyecto.json            estado de cada paso, huellas y aprobaciones
  fuente/guion-original.md copia del guion (el proyecto es autocontenido)
  guion.md, guion.json     guion limpio y dividido en oraciones numeradas
  escenas.json             escenas (editable a mano o desde la interfaz)
  audio/escena-001.wav     voz normalizada (-16 LUFS) + .meta.json + .alineacion.json
  audio/mezcla.wav         voz + música con ducking + efectos, a -14 LUFS
  imagenes/escena-001-a.jpg  2560×1440 (2x para el zoom) + .meta.json (prompt, modelo, costo, aprobación)
  ambiente/                música y efectos por parte + creditos.json
  timeline.json            lo único que lee Remotion
  salida/                  video.mp4, preview.mp4, subtitulos.srt, miniatura*.png,
                           descripcion.txt, titulos.txt, LISTA-PUBLICACION.md, validacion.json
  cache/                   caché por contenido (voz, imágenes, respuestas de Claude)
  costos.json, bitacora.log
```

## Música y efectos

- `jamendo` y `freesound` necesitan clave; sin ella se usa la **biblioteca propia** (ver [biblioteca/LEEME.md](biblioteca/LEEME.md)).
- Jamendo solo acepta pistas CC BY / CC BY-SA (sin NC ni ND). Para monetizar, revisa también las condiciones de Jamendo Licensing.
- Cada pista se normaliza a la sonoridad de la voz al descargarla, así `volumen_db` (relativo a la voz) significa lo mismo con cualquier pista. Con los valores por defecto la música suena 6 dB por debajo de la voz en las pausas y 14 dB por debajo mientras se narra.

## Arquitectura

```
paquetes/
  nucleo/       esquemas Zod, huellas, costos y presupuesto, cola de trabajos, proyecto (no sabe nada de video)
  proveedores/  voz (ElevenLabs, Cartesia, voz local de macOS), imagen (Nano Banana 2, GPT Image 2, fal.ai),
                LLM (Claude), transcripción (Whisper), música/efectos (Jamendo, FreeSound, biblioteca) y sus simulados
  pasos/        un archivo por paso + orquestador (estado, dependencias, revisión, presupuesto) + validaciones
  render/       proyecto Remotion: componentes, timeline.json → MP4 (no llama a ninguna API de pago)
  api/          Fastify (solo 127.0.0.1)
  web/          React + Vite
  cli/          línea de comandos
```

Reglas de dependencia de la especificación: `nucleo` no sabe de video, `pasos` no sabe de HTTP, `proveedores` no importa `pasos` ni `api`, y `render` solo lee `timeline.json` y archivos.

Para editar los componentes visuales: `pnpm studio` abre Remotion Studio con la composición de demostración.

## Pruebas

```bash
pnpm test          # siempre en modo simulado
pnpm typecheck
```

Incluyen: unitarias (huellas, texto y números, guion, cobertura de escenas, subtítulos, alineación, ducking, capítulos, costos, cola de trabajos); integración (un proyecto corto recorre todo el pipeline hasta el MP4); caché (la segunda ejecución no ejecuta nada y cuesta $0); cambio parcial (cambiar el texto de una escena solo regenera su voz y su alineación); y render (demo de 30 s con todos los componentes).

## Estado del proyecto

El pipeline completo está probado de punta a punta **en modo simulado**. Las integraciones con las APIs reales siguen la documentación de cada proveedor, pero aún no se han validado en producción. Antes de tu primer video real:

- Confirma los IDs de modelo de [configuracion.json](configuracion.json). `gemini-3.1-flash-image-preview` es el ID que publica Google Cloud para Nano Banana 2; `gpt-image-2`, `sonic-3` y la versión de API de Cartesia (`2026-03-01`) también deben verificarse.
- Ajusta [tarifas.json](tarifas.json) a tu plan (ElevenLabs cobra según el plan).
- Haz una prueba corta con `guiones/ejemplo-el-dorado.md` antes del guion completo.

## Licencia

[MIT](LICENSE). Puedes usarlo, modificarlo y distribuirlo libremente, también con fines comerciales.

Ten en cuenta las licencias de terceros:

- Remotion es gratis para personas y empresas pequeñas; las más grandes necesitan licencia (remotion.dev).
- Mapas: Natural Earth (dominio público) y departamentos de Colombia (ver [paquetes/render/src/mapas/LEEME.md](paquetes/render/src/mapas/LEEME.md)).
- Cada proveedor de IA tiene sus propios términos de uso. Usa solo voces clonadas con el consentimiento de su dueño y música o efectos con licencia comercial.

## Contribuir

Lee [CONTRIBUTING.md](CONTRIBUTING.md). Los *issues* y *pull requests* son bienvenidos.
