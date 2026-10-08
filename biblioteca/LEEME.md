# Biblioteca propia de música y efectos

Se usa cuando el estilo elige `"biblioteca"` o cuando falta la clave de Jamendo o FreeSound.

```
biblioteca/
  musica/<etiqueta>/pista.mp3        etiquetas: neutral, tension_baja, tension_alta, revelacion,
  musica/<etiqueta>/pista.mp3.json              tribunal, nostalgia, esperanza, caos
  efectos/<efecto>/sonido.wav        efecto en inglés y snake_case: crowd_murmur, typewriter…
  efectos/<efecto>/sonido.wav.json
```

Junto a cada archivo va un `.json` con los créditos, que terminan en la descripción del video:

```json
{ "titulo": "Night Ledger", "autor": "Nombre del autor", "licencia": "CC BY 4.0", "url_fuente": "https://…" }
```

Si falta el autor o la licencia, la validación avisa antes del render. Usa solo pistas con licencia comercial.
