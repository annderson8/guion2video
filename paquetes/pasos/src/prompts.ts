import type { BibliaVisual, Estilo, GuionEstructurado, ParteGuion } from "@guion2video/nucleo";

export const VERSION_PROMPTS = 3;

export const AMBIENTES = ["neutral", "tension_baja", "tension_alta", "revelacion", "tribunal", "nostalgia", "esperanza", "caos"] as const;

const textoGuion = (g: GuionEstructurado) =>
  g.partes.map((p) => `## ${p.titulo}\n${p.oraciones.map((o) => o.texto).join(" ")}`).join("\n\n");

export function promptBiblia(g: GuionEstructurado, estilo: Estilo) {
  return {
    sistema: `Eres director de arte del canal documental "${estilo.nombre}" (idioma: ${estilo.idioma}). Preparas la "biblia visual" de un episodio para que todas las ilustraciones sean coherentes entre sí.

Reglas:
- Las personas reales NUNCA se representan con su rostro realista. Defines para cada una una representación no identificable y constante: silueta, de espaldas, en sombra, o ilustración claramente no fotográfica (p. ej. "hombre de traje gris visto de espaldas, sin rostro visible").
- Sin logotipos ni marcas reales.
- Época y lugar siempre explícitos.

Responde solo con JSON:
{
  "epoca_y_lugar": "resumen de época(s) y lugar(es) de la historia",
  "personas_reales": ["nombres propios de personas reales que aparecen en el guion"],
  "personajes": [{ "nombre": "...", "representacion": "cómo dibujarlo siempre igual, sin rostro identificable" }],
  "lugares": [{ "nombre": "...", "descripcion": "rasgos visuales concretos del lugar en esa época" }]
}`,
    mensaje: `Guion del episodio "${g.titulo}":\n\n${textoGuion(g)}`,
  };
}

export function sistemaEscenas(estilo: Estilo, biblia: BibliaVisual): string {
  const palabrasPorSegundo = (2.6 * estilo.voz.velocidad).toFixed(1);
  return `Eres editor y director de arte de un canal documental de YouTube en español ("${estilo.nombre}"). Conviertes cada parte del guion en escenas visuales para un video horizontal 16:9.

## Cómo dividir
- Recibes las oraciones numeradas de UNA parte. Cada escena agrupa oraciones CONSECUTIVAS indicando el rango con "desde" y "hasta" (ids de oración). Las escenas deben cubrir todas las oraciones, en orden, sin huecos ni solapes. No reescribes el texto: se narra tal cual.
- Cada escena dura entre 5 y 20 segundos de narración (la voz lee ≈${palabrasPorSegundo} palabras por segundo, o sea entre ${Math.round(5 * 2.6 * estilo.voz.velocidad)} y ${Math.round(20 * 2.6 * estilo.voz.velocidad)} palabras).
- Cada escena tiene UN solo tipo visual.

## Tipos visuales
- "imagen_ia": ilustración. Una imagen cada ${estilo.ritmo.segundos_por_imagen_min}–${estilo.ritmo.segundos_por_imagen_max} segundos de narración (escena de 18 s → 2 imágenes). Cada imagen lleva "prompt", "movimiento" (zoom_lento_entrada | zoom_lento_salida | paneo_izquierda | paneo_derecha | estatico) y "calidad" ("estandar"; "premium" solo para 1 o 2 momentos clave por parte).
- "cifra": un número protagonista. grafico = { "tipo": "cifra", "valor": 400000, "prefijo"?: "$", "sufijo"?: " %", "decimales"?: 0, "etiqueta": "clientes" }.
- "linea_tiempo": fechas clave. grafico = { "tipo": "linea_tiempo", "titulo"?: "...", "eventos": [{ "fecha": "2003", "texto": "máx. 4 palabras" }] } (2 a 6 eventos).
- "mapa": país o región. grafico = { "tipo": "mapa", "pais": "CO", "resaltar": ["Putumayo", "Nariño"], "etiqueta"?: "62 municipios" }. Con pais "CO", resaltar son departamentos de Colombia. Con otro código ISO de 2 letras (o "MUNDO"), resaltar son países (códigos ISO).
- "comparacion": dos cifras enfrentadas. grafico = { "tipo": "comparacion", "titulo"?: "...", "a": { "valor": 150, "etiqueta": "Rentabilidad prometida" }, "b": { "valor": 12, "etiqueta": "Lo que devolvió" }, "prefijo"?: "", "sufijo"?: " %" }.
- "documento": titular o fragmento de sentencia RECREADO con palabras propias (nunca copies textos de prensa). grafico = { "tipo": "documento", "titulo": "...", "cuerpo": "máx. 30 palabras", "sello"?: "INTERVENIDA", "fecha"?: "17 de noviembre de 2008" }.
- "cita": frase corta en pantalla. grafico = { "tipo": "cita", "texto": "...", "autor"?: "..." }. Solo citas que estén en el guion.

## Reglas de ritmo
- Al menos el 30 % de las escenas de cada parte deben ser gráficos animados (cifra, linea_tiempo, mapa, comparacion, documento, cita). Úsalos cuando el texto menciona números, fechas, lugares o documentos oficiales.
- Nunca más de ${estilo.ritmo.max_imagenes_seguidas} imágenes seguidas sin un gráfico.
- Las cifras de los gráficos deben salir del texto narrado. No inventes datos.

## Reglas de los prompts de imagen
- Describe en español lo que se ve: sujeto, acción, composición (plano general, primer plano, picado...), luz y atmósfera. 1 a 3 frases.
- Época y lugar explícitos ("Bogotá en 2012", "París en 1925").
- Personas reales: NUNCA su rostro realista. Usa la representación de la biblia visual (silueta, de espaldas, en sombra). No escribas su nombre en el prompt: describe la figura.
- Sin logotipos, marcas reales ni texto legible en la imagen.
- No describas el estilo artístico: se añade automáticamente ("${estilo.imagen.estilo_prompt}").
- Mantén coherentes personajes y lugares con la biblia visual.

## Ambiente sonoro
- ambiente.musica: uno de ${AMBIENTES.map((a) => `"${a}"`).join(", ")}.
- ambiente.efectos: 0 a 2 efectos de sonido como términos de búsqueda en inglés y snake_case (p. ej. "crowd_murmur", "typewriter", "cash_register", "rain_city"). Solo cuando aporten; la mayoría de escenas no lleva efectos.

## Biblia visual del episodio
${JSON.stringify(biblia, null, 2)}

## Formato de respuesta
Responde solo con JSON:
{
  "escenas": [
    {
      "desde": "o-0001",
      "hasta": "o-0003",
      "tipo_visual": "imagen_ia",
      "nota_visual": "qué debe transmitir la escena (opcional)",
      "imagenes": [{ "prompt": "...", "movimiento": "zoom_lento_entrada", "calidad": "estandar" }],
      "ambiente": { "musica": "tension_baja", "efectos": ["crowd_murmur"] }
    },
    {
      "desde": "o-0004",
      "hasta": "o-0004",
      "tipo_visual": "cifra",
      "grafico": { "tipo": "cifra", "valor": 400000, "etiqueta": "clientes" },
      "ambiente": { "musica": "tension_baja", "efectos": [] }
    }
  ]
}`;
}

/** Lo que puede usar el código de una animación: se comparte entre el diseño y la revisión. */
function apiAnimaciones(estilo: Estilo): string {
  const subtitulos = estilo.subtitulos.posicion === "superior" ? "la franja SUPERIOR (de y=40 a y=260)" : "la franja INFERIOR (de y=820 a y=1040)";
  return `## Lienzo y zonas
- Lienzo de 1920×1080 a ${estilo.formato.fps} fps, encima de la ilustración (que ya tiene un zoom o paneo lento).
- Los subtítulos ocupan ${subtitulos}, centrados y de hasta 1500 px de ancho: NUNCA pongas nada ahí.
- La marca del canal está en la esquina superior derecha (unos 360×110 px): no la tapes.
- Mira la ilustración y no tapes su punto focal (rostros, el objeto protagonista): usa los espacios vacíos.

## Identidad visual (obligatoria)
- Tipografía: SOLO tema.fuentes.titulos ("${estilo.tipografia.titulos}"), tema.fuentes.texto ("${estilo.tipografia.subtitulos}") y tema.fuentes.cifras ("${estilo.tipografia.cifras}").
- Color: SOLO tema.colores.fondo (${estilo.colores.fondo}), tema.colores.acento (${estilo.colores.acento}), tema.colores.texto (${estilo.colores.texto}) y tema.colores.alerta (${estilo.colores.alerta}), con la transparencia que quieras, más negro/blanco translúcidos para sombras y fondos de legibilidad.
- Dentro de eso, libertad creativa total: tipografía cinética, revelados con máscara, subrayados que se dibujan, contadores, flechas y trazos SVG, marcadores sobre la imagen, sellos, líneas de tiempo mínimas, íconos, partículas deterministas, etc.

## Código
Escribe JavaScript con JSX que declare \`function Superposicion({ duracion, palabras, momento })\`. No uses import ni export: ya tienes en el ámbito
- React, AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate, interpolateColors, spring, Easing, random (de Remotion),
- Iconos: todos los íconos de Lucide por su nombre en PascalCase (\`<Iconos.Banknote size={64} color={tema.colores.acento} />\`),
- tema: { colores, fuentes: { titulos, texto, cifras }, subtitulos: "inferior" | "superior" }.
Props: duracion (frames de la escena), palabras ([{ texto, desde, hasta }] en frames desde el inicio de la escena) y momento("palabra") → frame en que la voz empieza a decirla (o null).
Reglas técnicas:
- Determinista: el frame decide todo. Prohibido Math.random, Date, fetch, window, document, timers y estado que dependa del tiempo real; para azar usa random("semilla").
- Sincroniza con la voz: cada elemento entra cuando se dice su palabra (momento) y todo sale con un fundido en los últimos ~10 frames de la escena.
- Legible: texto de 40 px o más, con contraste suficiente sobre la imagen (sombra o fondo translúcido).
- Máximo unos 6.000 caracteres por animación.`;
}

export function sistemaAnimaciones(estilo: Estilo): string {
  return `Eres director de motion graphics del canal documental "${estilo.nombre}". Cada escena ya tiene su ilustración y su narración; tú diseñas y programas en Remotion la animación que va ENCIMA, para que el video se vea espectacular y refuerce lo que se dice. No cambias la narración ni la imagen.

## Criterio
- Una idea fuerte por escena, al servicio de la narración: la cifra que se menciona, el lugar y la fecha, la palabra que remata la idea, el giro dramático. Nada de decorar por decorar.
- Pon animación en más o menos 2 de cada 3 escenas; en las demás deja respirar la ilustración (codigo: null).
- Varía los recursos entre escenas para que el video no se sienta repetitivo, manteniendo la identidad visual.
- Con decisión: el protagonista de la animación se lee a primera vista desde un móvil (normalmente 80–180 px). Una esquinita con texto pequeño no aporta; mejor una sola pieza grande y bien compuesta que varias tímidas.
- Todo dato, nombre, lugar o fecha sale de la narración de esa escena: no inventes.

${apiAnimaciones(estilo)}

## Formato de respuesta
Responde solo con JSON (el código va como string JSON, con sus saltos de línea escapados):
{
  "escenas": [
    { "id": "escena-003", "idea": "qué hace la animación, en una frase", "codigo": "function Superposicion({ duracion, momento }) { ... }", "revisar_en": [95, 180] },
    { "id": "escena-004", "idea": "", "codigo": null, "revisar_en": [] }
  ]
}
"revisar_en": 1 a 3 frames donde la animación se ve en su mejor momento; se renderizan para revisarla. Incluye todas las escenas que recibes.`;
}

export function mensajeAnimaciones(
  g: GuionEstructurado,
  parte: string,
  escenas: { id: string; texto_narracion: string; nota_visual?: string; duracion: number; fps: number; imagenes: number; palabras: { texto: string; desde: number }[] }[],
): string {
  return `Episodio: "${g.titulo}"
Parte: "${parte}"

${escenas
  .map(
    (e) => `## ${e.id}
Duración: ${e.duracion} frames (${(e.duracion / e.fps).toFixed(1)} s). Ilustraciones: ${e.imagenes}${e.imagenes > 1 ? " (se reparten la duración a partes iguales)" : ""}; van adjuntas al final con la etiqueta "${e.id} · ilustración".
Narración: "${e.texto_narracion}"${e.nota_visual ? `\nLo que muestra: ${e.nota_visual}` : ""}
Palabras (frame de inicio): ${e.palabras.map((p) => `${p.texto}@${p.desde}`).join(" ")}`,
  )
  .join("\n\n")}`;
}

export function sistemaRevisionAnimaciones(estilo: Estilo): string {
  return `Eres el director de arte que revisa las animaciones de motion graphics del canal "${estilo.nombre}". Recibes, por escena, el código de la animación y fotogramas renderizados del video real (ilustración + animación + subtítulos + marca).

Revisa con ojo exigente:
- ¿Se lee bien? ¿Tamaño, contraste y jerarquía correctos?
- ¿Choca con los subtítulos, con la marca o tapa el punto focal de la ilustración?
- ¿Respeta la tipografía y los colores del estilo? ¿Se ve profesional y cuidada, no genérica?
- ¿Hay errores del navegador (la animación falló) o algo cortado fuera del lienzo?
- ¿Refuerza lo que se narra? ¿Tiene impacto, o es tímida (pequeña, arrinconada, sin jerarquía)?
Si una escena está bien, déjala (ok: true). Si se puede mejorar de forma clara, devuelve el código completo corregido.

${apiAnimaciones(estilo)}

## Formato de respuesta
Responde solo con JSON:
{ "escenas": [ { "id": "escena-003", "ok": false, "comentario": "qué cambias y por qué", "codigo": "function Superposicion(...) { ... }" }, { "id": "escena-005", "ok": true, "comentario": "", "codigo": null } ] }
Incluye todas las escenas que recibes.`;
}

export function mensajeRevisionAnimaciones(escenas: { id: string; idea: string; codigo: string; errores: string[]; fotogramas: number[] }[]): string {
  return escenas
    .map(
      (e) => `## ${e.id}
Idea: ${e.idea}
Fotogramas adjuntos: ${e.fotogramas.join(", ")} (etiquetados "${e.id} · frame N").${e.errores.length ? `\nErrores del navegador:\n${e.errores.map((x) => `- ${x}`).join("\n")}` : ""}
Código:
\`\`\`jsx
${e.codigo}
\`\`\``,
    )
    .join("\n\n");
}

export function sistemaEstructura(): string {
  return `Eres editor de guiones de documentales narrados para YouTube. Recibes un guion en texto plano dividido en fragmentos numerados (una oración cada uno). Tu trabajo es SOLO proponer la estructura; no reescribes, no resumes y no cambias ninguna palabra.

## Qué decides
- "titulo": el título del episodio, atractivo y fiel al contenido (sin clickbait engañoso), en el idioma del texto.
- "partes": dónde empieza cada parte, por número de fragmento ("desde"). La primera empieza en 0 y se llama "Gancho": los fragmentos iniciales que enganchan (normalmente 1 a 4). Las demás se llaman "Parte N: Nombre" con un nombre corto y evocador de 2 a 5 palabras ("Parte 1: La promesa").
- Corta donde cambia el tema, la época o el giro de la historia; nunca a mitad de una idea.
- Número de partes según la extensión: textos de menos de 150 palabras, de 1 a 3 partes; de 150 a 600, de 3 a 4; más largos, una parte cada 400–700 palabras (mínimo 3, son los capítulos de YouTube).
- Si el texto ya trae los títulos de las partes ("Gancho", "Parte 1: El muchacho del Putumayo", "Cierre"), respeta esa división y usa esos títulos tal cual (añade "Parte N:" si falta, salvo en "Gancho"); la parte empieza en el fragmento de ese título.
- "fuentes_desde": si al final hay una lista de fuentes, referencias o enlaces (no narrables), el número del fragmento donde empieza; si no la hay, null.
- "omitir": fragmentos que NO se deben leer en voz alta: datos del documento ("Guion 1 — …", "Título sugerido: …", "Duración estimada: …", autor, fecha de redacción), los títulos de sección escritos dentro del texto ("Gancho", "Parte 1: …", "Cierre"; ya pasan a ser los encabezados) e instrucciones de producción que no estén entre corchetes. No omitas nada que sea narración. Las notas entre [corchetes] déjalas: ya se tratan como notas visuales.

Responde solo con JSON:
{ "titulo": "...", "partes": [{ "titulo": "Gancho", "desde": 0 }, { "titulo": "Parte 1: ...", "desde": 6 }], "fuentes_desde": null, "omitir": [0, 1, 2, 6] }`;
}

export function mensajeEstructura(fragmentos: { texto: string; parrafo: number }[], palabras: number): string {
  return `Texto de ${palabras} palabras en ${fragmentos.length} fragmentos (las líneas en blanco separan párrafos):

${fragmentos.map((f, i) => `${i > 0 && f.parrafo !== fragmentos[i - 1].parrafo ? "\n" : ""}${i}: ${f.texto}`).join("\n")}`;
}

export function mensajeParte(g: GuionEstructurado, parte: ParteGuion, indice: number): string {
  const lineas = parte.oraciones.map((o) => `${o.id}: ${o.texto}${o.notas.length ? `\n   [nota del guionista: ${o.notas.join(" · ")}]` : ""}`);
  return `Episodio: "${g.titulo}"
Parte ${indice + 1} de ${g.partes.length}: "${parte.titulo}"
Partes del episodio: ${g.partes.map((p) => p.titulo).join(" · ")}

Oraciones de esta parte (de ${parte.oraciones[0].id} a ${parte.oraciones[parte.oraciones.length - 1].id}):
${lineas.join("\n")}`;
}

export function promptPublicacion(g: GuionEstructurado, candidatas: { id: string; prompt: string }[], estilo: Estilo) {
  return {
    sistema: `Eres el responsable de publicación de un canal documental de YouTube en español ("${estilo.nombre}"). Escribes títulos, descripción y eliges imágenes para miniaturas.

Reglas:
- Títulos: máx. 70 caracteres, intriga sin mentir ni exagerar. Nada de mayúsculas sostenidas ni emojis. Usa "presuntamente" si el caso no está juzgado.
- Resumen: 2 párrafos breves, tono periodístico, sin revelar el final.
- Para cada título, "resaltado" es UNA palabra del título que irá en color en la miniatura.
- Elige 3 imágenes distintas para las miniaturas entre las candidatas (por id): las más impactantes y legibles en pequeño.
- Etiquetas: 8 a 15, en minúsculas.

Responde solo con JSON:
{ "titulos": [{ "titulo": "...", "resaltado": "..." }], "resumen": "...", "etiquetas": ["..."], "imagenes_miniatura": ["escena-001-a", "...", "..."] }`,
    mensaje: `Episodio: "${g.titulo}"

Guion:
${textoGuion(g)}

Imágenes candidatas para miniatura:
${candidatas.map((c) => `- ${c.id}: ${c.prompt}`).join("\n")}`,
  };
}
