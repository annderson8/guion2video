# Formato del guion

Cómo escribir el guion en Markdown para que guion2video lo convierta bien en video: qué se narra, qué no, y qué parámetros controla cada elemento.

> ¿Tienes el texto sin formato? Pégalo al crear el proyecto y usa **Estructurar con Claude**: añade el título, las partes y las fuentes sin cambiar tus palabras. Igual conviene revisarlo con esta guía.

---

## Resumen rápido

| Escribes | Qué pasa | ¿Se narra? |
|---|---|---|
| `# Título` (la primera vez) | Título del video, de la miniatura y del proyecto | No |
| `## Gancho` | Primera parte; entra directo, sin separador | No (el título) |
| `## Parte 1: Nombre` | Nueva parte: separador animado "PARTE 1 · NOMBRE", capítulo de YouTube y su propia música | No (el título) |
| Texto normal | La narración: se divide en oraciones y escenas | **Sí** |
| `[nota entre corchetes]` | Nota visual para la ilustración o el gráfico de esa oración | No |
| Línea entera en `*cursiva*` o entre `(paréntesis)` | Nota visual | No |
| `> línea con mayor que` | Nota para ti, se pega como nota visual a la oración siguiente | No |
| `<!-- comentario -->` | Se ignora por completo | No |
| `## Fuentes` + lista | Va a la descripción de YouTube; se muestra antes de publicar | No |

---

## 1. Título

```markdown
# DMG: la pirámide que casi pone a Colombia de rodillas
```

- Solo el **primer** `#` es el título. Si no lo pones, se usa el título del formulario o el nombre del proyecto.
- Aparece en la miniatura y en el paquete de publicación (donde Claude propone además 3 títulos alternativos).

## 2. Partes

```markdown
## Gancho

## Parte 1: El muchacho del Putumayo

## Parte 2: El truco de las tarjetas

## Cierre
```

- Cada `##` (o `###`) abre una parte. La primera suele ser el **Gancho**: entra sin separador.
- Con el formato **`Parte N: Nombre`** el separador animado muestra "PARTE N · NOMBRE". Con otro nombre ("Cierre"), se numera solo.
- Cada parte es un **capítulo de YouTube** y tiene **su propia pista de música**. Mínimo **3 partes** (YouTube no muestra capítulos con menos).
- El título de la parte **no se narra**: no lo repitas como primera línea del texto (la voz lo leería dos veces).

## 3. Narración

Todo el texto que no es encabezado, nota ni fuente **se lee en voz alta, tal cual**.

- Se divide en **oraciones** (respeta abreviaturas como "Sr." o "EE. UU." y cifras como "400.000") y Claude las agrupa en **escenas** de 5 a 20 segundos.
- Escribe como hablas: frases cortas, una idea por frase. El ritmo de la voz depende de la puntuación.
- El formato en línea se limpia: `**negrita**`, `*cursiva*` dentro de una frase y los enlaces `[texto](url)` se narran como texto plano.
- Las viñetas (`- `, `1. `) dentro de la narración se leen sin el símbolo.
- **Cifras, fechas y lugares** en la narración hacen que Claude elija gráficos animados (contador, línea de tiempo, mapa, comparación). Las cifras de los gráficos salen solo de lo narrado.
- Para lo que no está probado usa "según la Fiscalía", "presuntamente"…

**No pongas en la narración** datos del documento: "Guion 1", "Título sugerido: …", "Duración estimada: …", autor, fecha de redacción. Si quieres conservarlos, ponlos como comentario:

```markdown
<!-- Duración estimada: 21 minutos -->
```

## 4. Notas visuales

Le dicen a Claude qué mostrar en esa escena. Se guardan en la escena ("Nota") y **no se narran**.

```markdown
[Mapa de Colombia, zoom al Putumayo: Puerto Asís, Mocoa, Orito]
Para entender DMG hay que ir al Putumayo de comienzos de los 2000.

*Música: tensión baja*

(Imagen de archivo: filas larguísimas frente a un local)

> Ojo: aquí va el dato de la Superintendencia.
```

- `[corchetes]` dentro o antes de una frase: la nota se asocia a la oración donde aparece.
- Línea entera en cursiva o entre paréntesis, o `> …`: se asocia a la oración siguiente.
- Sirven para pedir un mapa, una cifra, un documento, el ambiente de una imagen o la música de la parte.

## 5. Fuentes

```markdown
## Fuentes

- Transparencia por Colombia — estudio de caso DMG
- Semana — expediente de DMG, 2008
- Supersociedades — resolución de intervención, noviembre de 2008
```

- El encabezado puede ser **Fuentes**, **Referencias**, **Bibliografía**, **Fuentes consultadas** o **Notas y fuentes**.
- **Una fuente por línea de lista.** No se narran: van a la descripción del video.
- Son **obligatorias** antes de publicar (el programa avisa si faltan).

---

## Parámetros que NO van en el guion

Se configuran una vez en el **estilo del canal** (pestaña **Estilos**) y valen para todos los videos:

| Parámetro | Dónde |
|---|---|
| Voz, velocidad, pausas entre escenas y partes | Estilos → Voz |
| Cómo se pronuncia una sigla o nombre ("DMG" → "de eme ge") | Estilos → Pronunciación |
| Estilo de dibujo de las ilustraciones y qué evitar | Estilos → Imágenes |
| Segundos por imagen, % mínimo de gráficos | Estilos → Ritmo |
| Colores, tipografía, subtítulos, marca | Estilos → Colores / Tipografía / Subtítulos |
| Música, volumen, efectos | Estilos → Música y efectos |
| Animaciones de Claude sobre las ilustraciones | Estilos → Subtítulos y marca |

Y por proyecto, al crearlo: título (opcional) y presupuesto máximo.

---

## Extensión

- La voz lee unas **150 palabras por minuto**. Meta habitual: **18–25 minutos ≈ 2.700–3.750 palabras**. Fuera de 15–30 minutos el programa avisa (solo es un aviso).
- Una parte cada **400–700 palabras** funciona bien (3 a 4 minutos por capítulo).

---

## Plantilla

Copia esto en `guiones/mi-video.md` y reemplaza el contenido:

```markdown
# Título del video

<!-- Notas del documento que no se narran: duración estimada, versión, etc. -->

## Gancho

[Imagen: la escena más impactante de la historia]
Primera frase que engancha. Fecha y lugar concretos. Lo que estaba en juego.

Quédate, porque esta historia tiene…

## Parte 1: El origen

[Mapa del lugar donde empieza todo]
Contexto: quién, dónde, cuándo. Frases cortas.

## Parte 2: Cómo funcionaba

[Gráfico: cómo se movía el dinero]
El mecanismo explicado de forma sencilla. Cifras que salen de las fuentes.

## Parte 3: La caída

[Documento: titular o resolución recreada con palabras propias]
Qué pasó, según quién. "Presuntamente" en lo que no esté en firme.

## Cierre

[Imagen tranquila del lugar hoy]
La reflexión final y lo que el espectador debería recordar.

## Fuentes

- Fuente 1 — medio o institución, año
- Fuente 2 — medio o institución, año
```
