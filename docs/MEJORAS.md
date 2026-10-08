# Mejoras sobre la especificación

Cambios hechos al construir el sistema, con su motivo. Todo lo demás sigue la especificación.

## Fidelidad del texto y coherencia visual

1. **Las escenas se definen por rangos de oraciones.** El guion se divide en oraciones numeradas y Claude solo agrupa rangos (`"desde": "o-0012", "hasta": "o-0014"`). El texto narrado es siempre el del guion, sin palabras perdidas ni reescritas. Una validación comprueba que las escenas cubren todas las oraciones en orden; si falla, se reintenta una vez con el error, como pide la especificación.
2. **Biblia visual del episodio.** Antes de las escenas, Claude prepara una lista de personas reales, de cómo representarlas siempre igual sin rostro identificable (silueta, de espaldas…) y de los lugares con su época. Cada parte la recibe, así las imágenes son coherentes entre sí. La lista de personas reales alimenta la validación de prompts riesgosos.
3. **Separadores de parte automáticos.** Entre partes se inserta una escena `titulo_parte` (2,5 s, paso por negro). No depende de que Claude se acuerde de ponerla.
4. **`tipo_visual` + `grafico` unificados.** En la especificación, el ejemplo usaba `"tipo_visual": "grafico"` con `graficos[]`, pero la tabla define cada gráfico como su propio tipo. Se usa la tabla: `tipo_visual` es `cifra`, `mapa`… y `grafico` lleva sus datos (validados con Zod).

## Caché y revisión

5. **Caché por contenido.** Voz, imágenes y respuestas de Claude se guardan en `cache/<tipo>/<huella>`. Si las escenas se renumeran (p. ej. por insertar una), lo que ya existía no se vuelve a pagar. Si una parte falla al dividir en escenas, al reintentar solo se paga esa parte.
6. **Las aprobaciones van atadas al contenido.** Aprobar guarda la huella de lo aprobado. Si se regenera una imagen o la voz de una escena, solo eso vuelve a pedir revisión. Editar escenas o prompts en la interfaz cuenta como revisión y no obliga a reaprobar todo.
7. **La estimación tiene en cuenta la caché.** `estimar` solo cuenta lo que de verdad hay que generar.
8. **Protección de ediciones manuales.** Si `escenas.json` se editó a mano y luego cambia el guion, el paso se niega a sobrescribirlo sin `--forzar`.

## Voz, subtítulos y audio

9. **La pronunciación solo afecta a la voz.** Con el diccionario aplicado en el paso `guion`, los subtítulos dirían "de eme ge". Ahora se aplica al enviar el texto a la voz, y la alineación vuelve del texto hablado al escrito: los subtítulos dicen "DMG".
10. **Alineación tolerante.** Los tiempos del proveedor o de Whisper se alinean con el texto esperado por programación dinámica: tolera palabras mal transcritas, de más o de menos. Sin clave de OpenAI, los tiempos se reparten de forma proporcional a la duración real.
11. **Mezcla final con ffmpeg.** La voz, la música (con *ducking* real y rampas de 0,3 s / 0,8 s) y los efectos se mezclan en un WAV normalizado a **-14 LUFS y ≤ -1,5 dBTP** (el estándar de YouTube). Remotion reproduce una sola pista: el render es más rápido y la mezcla, predecible.
12. **Música y efectos normalizados a la voz.** Cada pista descargada se lleva a la sonoridad de la voz, así `volumen_db` significa lo mismo con cualquier pista. Por eso los valores por defecto pasan a `-6` (música) y `-10` (efectos): con los `-24` originales sobre pistas ya normalizadas, la música quedaba prácticamente inaudible.
13. **Voz por escena en WAV** (no MP3) para no recomprimir dos veces.
14. **Voz local gratuita (macOS `say`)** como proveedor `local-say`, para borradores de ritmo y duración sin gastar.
15. **Subtítulos**: los bloques cortan en final de frase, comas y pausas; los de menos de 0,8 s se unen al vecino; máximo 2 líneas equilibradas.

## Imágenes y publicación

16. **Imágenes a 2560×1440 en JPG** (calidad 92, recorte inteligente a 16:9). Da margen para el zoom Ken Burns y ocupa ~10 veces menos que PNG (unas 150 imágenes por video).
17. **Miniaturas con Remotion**, no con IA: imagen clave del video + título con una palabra resaltada, en 3 composiciones. Cuestan $0, son coherentes con la marca y el texto siempre es legible. Si alguna vez se quiere una miniatura generada, el proveedor premium sigue disponible.
18. **Capítulos válidos para YouTube**: el primero en 0:00, al menos 3 y de 10 s o más (las partes cortas se fusionan).
19. **Lista de publicación** (`salida/LISTA-PUBLICACION.md`) con los puntos de cumplimiento de la sección 14.
20. **Respaldo ante rechazos de Claude.** Los guiones tratan sobre delitos financieros, y un clasificador podría rechazar alguna petición. Se usa el *fallback* del servidor (`fallbacks: "default"`), que reintenta en el modelo recomendado en vez de fallar.

## Infraestructura

21. **Sin SQLite.** La especificación ya exige `proyecto.json`, `costos.json` y los `.meta.json`. Una base de datos duplicaría ese estado y podría desincronizarse. Cada proyecto es una carpeta autocontenida, copiable y versionable. La cola de trabajos es en memoria, con concurrencia y reintentos con espera exponencial, porque cada ejecución termina en un solo proceso. Si se pasa a un VPS con varios trabajadores, ahí sí conviene BullMQ o SQLite.
22. **Bundle de Remotion en caché**, por huella del código de render. Los renders siguientes no vuelven a empaquetar.
23. **Proveedores simulados que "cobran" en las pruebas** con tarifas de prueba, para verificar de verdad que la segunda ejecución cuesta $0.

## Pendiente (fases futuras de la especificación)

- Subida a YouTube como borrador (API de YouTube Data), Remotion Lambda, instalación en VPS con login y segundo idioma.
- Escalado de imágenes con un modelo de superresolución local. Hoy se usa lanczos, suficiente porque los modelos ya entregan 2K.
