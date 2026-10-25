# Catálogo moderno de /rw

`/rw`, `/w`, `/personaje` y `/rollchar` comparten catálogo.

- Se conserva Kitsu y todas las colecciones anteriores.
- El 70% de las tiradas que no sean repetidos prioriza personajes principales de
  series estrenadas desde 2020, obtenidas de Jikan (MyAnimeList), ordenadas por
  popularidad. El resto conserva la selección clásica. Si la fuente moderna no
  responde, se usa el catálogo anterior.
- Se mantiene la probabilidad anterior de repetidos (22% por defecto).
- Los IDs nuevos llevan `jikan:` para no sobrescribir IDs numéricos de Kitsu.
  Un mismo personaje presente en ambas fuentes puede tener dos fichas distintas;
  no se fusionan automáticamente colecciones ni precios.

## Importar en producción

### Añadir el catálogo externo AniPersonaCaps

```sh
npm run sync:chars:anipersona
```

Descarga el snapshot público de AniPersonaCaps (CC BY 4.0), comprueba los nombres
y fechas de las series con Kitsu y añade las fichas modernas con imagen real en
el repositorio del dataset. No consulta masivamente AniList ni depende de Jikan.
Cachea las descargas fuera del repositorio y guarda una copia del catálogo antes
de escribir. Se puede elegir el directorio de caché con `PAIN_CATALOG_IMPORT_CACHE`.

Los IDs nuevos `fandom:` se derivan de la URL de origen; no colisionan con los IDs
de Kitsu. Las coincidencias exactas de nombre (independientemente del orden de
las palabras) y serie se reutilizan sin cambiar sus precios ni imágenes. Esto
no garantiza fusionar todos los alias de personajes entre distintas fuentes.

Solo se importan series con fecha de estreno comprobable desde 2020. El snapshot
de AniPersonaCaps no incluye todas las series posteriores a su publicación.
Los metadatos y las imágenes quedan vinculados a una revisión específica.
Conserva `storage/databases/CHARACTERS-SOURCES.md` al subir o distribuir el JSON.

Para recorrer **todas las páginas** de series desde 2020 hasta el año actual y
todos los roles del reparto disponible en Kitsu (no solo principales):

```sh
npm run sync:chars:all-modern
```

Este recorrido guarda un checkpoint en el catálogo al terminar cada año y
reintenta cada página hasta tres veces. Informa cuántas series no tienen reparto
en la fuente. No equivale a todos los personajes existentes: se omiten series
explícitas, fichas sin imagen y datos que Kitsu no tiene. Si algún año falla, el
comando termina con error aunque conserva lo ya importado.

Para la importación rápida y limitada:

```sh
npm run sync:chars:modern
```

Importa de forma aditiva el reparto principal disponible de las 25 series más
populares estrenadas desde 2020. No descarga todo MyAnimeList ni borra el JSON
existente. Espacia las peticiones y se detiene ante un HTTP 429. Si no hay
resultados o hay fallos, termina con código de error y conserva el catálogo
anterior. Es recomendable hacer una copia del catálogo antes de cualquier
importación.

Si Jikan no permite conectar, el importador usa Kitsu como respaldo: consulta
las 20 series más populares de cada año desde 2020 hasta el actual y añade su
reparto principal disponible. Las series sin reparto en Kitsu no se inventan.

Tras importar, reinicia los procesos del bot que usen el catálogo: lo mantienen
en memoria. No hace falta resetear las colecciones ni usar `sync:chars:reset`.
La actualización automática durante el juego permanece en memoria salvo que se
haya habilitado explícitamente `PAIN_CATALOG_RUNTIME_SAVE=1`.

Durante el juego se consulta como máximo una serie cada 30 minutos por proceso
(lista de series cacheada seis horas), con una sola actualización concurrente.
Ante errores espera cinco minutos antes de reintentar. Con catálogo moderno
disponible, sirve desde memoria mientras actualiza en segundo plano.

Fuentes:
- Jikan: https://docs.api.jikan.moe/
- AniList limita la recopilación masiva; no se utiliza como importador:
  https://docs.anilist.co/guide/terms-of-use
