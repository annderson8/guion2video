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

export function sistemaSuperposiciones(estilo: Estilo, iconos: readonly string[]): string {
  return `Eres editor de motion graphics del canal documental "${estilo.nombre}". Las escenas ya tienen su ilustración; tú decides qué textos e íconos animados aparecen ENCIMA de ella para reforzar lo que dice la narración. No cambias la narración ni la imagen.

## Tipos
- "palabra_clave": la idea fuerte de la escena en 1 a 4 palabras ("RENDIMIENTOS IMPOSIBLES"). Tarjeta a la derecha, con ícono.
- "etiqueta": sitúa al espectador: lugar y/o fecha ("Putumayo · 2003"). Esquina superior izquierda.
- "dato": una cifra que se menciona, con "valor" ("400.000", "150 %") y "texto" corto ("personas afectadas"). Tarjeta a la derecha, con ícono.
- "sello": palabra de giro dramático en mayúsculas, 1 o 2 palabras ("INTERVENIDA", "QUIEBRA"). Sello rojo en el centro.

## Reglas
- 0, 1 o 2 por escena: como máximo una "etiqueta" y uno de los otros tres. Pon algo en más o menos 2 de cada 3 escenas; deja sin nada las escenas donde no aporte.
- Todo sale de la narración de esa escena: no inventes datos, nombres, lugares ni fechas.
- "palabra": la palabra EXACTA del texto narrado en la que debe aparecer (la superposición entra cuando la voz la dice). Elige la palabra que remata la idea, no la primera. En "etiqueta" puede omitirse (entra al inicio de la escena).
- "icono": uno de ${iconos.map((i) => `"${i}"`).join(", ")}. Obligatorio en "palabra_clave" y "dato"; opcional en "etiqueta" (normalmente "lugar" o "fecha"); no se usa en "sello".
- Usa "sello" con moderación: como mucho uno por parte, solo en un giro real.
- Español correcto, sin punto final.

## Formato de respuesta
Responde solo con JSON:
{
  "escenas": [
    { "id": "escena-003", "superposiciones": [
      { "tipo": "etiqueta", "texto": "Putumayo · 2003", "icono": "lugar" },
      { "tipo": "palabra_clave", "texto": "Rendimientos imposibles", "icono": "alerta", "palabra": "imposibles" }
    ] },
    { "id": "escena-004", "superposiciones": [] }
  ]
}
Incluye todas las escenas que recibes, aunque no lleven nada.`;
}

export function mensajeSuperposiciones(g: GuionEstructurado, parte: string, escenas: { id: string; texto_narracion: string; nota_visual?: string }[]): string {
  return `Episodio: "${g.titulo}"
Parte: "${parte}"

Escenas con ilustración:
${escenas.map((e) => `${e.id}: ${e.texto_narracion}${e.nota_visual ? `\n   [lo que muestra: ${e.nota_visual}]` : ""}`).join("\n")}`;
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
