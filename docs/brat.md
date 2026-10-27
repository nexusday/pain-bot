# Stickers Brat

## `/brat`

Genera un sticker estático de 512×512 con fondo blanco, texto negro y desenfoque.

- Conserva **exactamente** el texto escrito, incluidas mayúsculas y minúsculas.
- Normaliza saltos de línea (`\n`, `\r\n`) y elimina espacios al inicio/final.
- Acepta el texto como argumento o respondiendo a un mensaje.
- Máximo: 320 caracteres.
- Alias: `sp`, `stickerplain`, `memetext`, `bratgen`.

Ejemplos:

```
/brat So Brat
/brat 365 party girl
/brat HOLA Mundo
```

## `/brat2 segundos|texto`

Genera un sticker **animado** que va revelando el texto de izquierda a derecha
y de arriba abajo, respetando el diseño y la posición final de cada línea.

- Sintaxis obligatoria: `segundos|texto`.
- Duración: entre **2 y 10 segundos** (número entero).
- FPS de salida: 12 (máximo 96 fotogramas; en duraciones largas se reparten
  para conservar la duración total).
- El texto se revela durante el 82 % de la duración y el resto se mantiene
  completo para poder leerlo.
- WebP animado en bucle infinito, 512×512, con EXIF de sticker.
- Máximo: 200 caracteres.
- También funciona respondiendo a un mensaje con `/brat2 5|`.

Ejemplos:

```
/brat2 4|Hola mundo
/brat2 6|BRAT con MAYÚSCULAS
/brat2 8|Línea uno\nLínea dos
```

Si el texto es muy largo o la duración está fuera de rango, el bot responde con
un error de validación y no genera el sticker.

## Notas técnicas

- El layout completo se calcula antes de animar, así que las palabras no se
  mueven ni cambian de línea durante el revelado.
- Se reutilizan los fotogramas repetidos para reducir el tiempo de render.
- Si el WebP supera 1 MB, se vuelve a codificar con menor calidad.
- `addExif` conserva los fotogramas y los retrasos de la animación.
