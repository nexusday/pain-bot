import fetch from 'node-fetch'
import { ANIO_MODERNO_MINIMO } from './modern.js'

export function extraerModernosKitsu(json, anio, { soloPrincipales = true } = {}) {
  const incluidos = new Map((json.included || []).map(c => [`${c.type}:${c.id}`, c]))
  const salida = new Map()
  for (const anime of json.data || []) {
    const attrs = anime.attributes || {}
    if (attrs.nsfw || !attrs.startDate || Number(attrs.startDate.slice(0, 4)) < ANIO_MODERNO_MINIMO) continue
    for (const rel of anime.relationships?.characters?.data || []) {
      const reparto = incluidos.get(`${rel.type}:${rel.id}`)
      if (!reparto || (soloPrincipales && reparto.attributes?.role !== 'main')) continue
      const referencia = reparto.relationships?.character?.data
      const personaje = referencia && incluidos.get(`${referencia.type}:${referencia.id}`)
      const c = personaje?.attributes
      const imagen = c?.image
      if (!c?.canonicalName || !imagen) continue
      const image = imagen.original || imagen.large || imagen.medium
      if (!image) continue
      salida.set(String(personaje.id), {
        id: String(personaje.id), source: 'kitsu', name: c.canonicalName,
        anime: attrs.titles?.en || attrs.canonicalTitle,
        image, imageAlt: imagen.large || image, modernYear: anio,
      })
    }
  }
  return [...salida.values()]
}

export async function descargarModernosKitsu(anio) {
  const json = await consultarPaginaKitsu(anio, 0, 'popularityRank')
  return extraerModernosKitsu(json, anio)
}

async function consultarPaginaKitsu(anio, offset, orden = 'id') {
  let ultimoError
  for (let intento = 0; intento < 3; intento++) {
    if (intento) await new Promise(resolve => setTimeout(resolve, 3000 * intento))
    try {
      const respuesta = await fetch(`https://kitsu.io/api/edge/anime?filter[seasonYear]=${anio}&sort=${orden}&page[limit]=20&page[offset]=${offset}&include=characters.character`, {
        headers: { Accept: 'application/vnd.api+json' },
        signal: AbortSignal.timeout(30_000),
      })
      if (!respuesta.ok) throw new Error(`Kitsu HTTP ${respuesta.status}`)
      const json = await respuesta.json()
      if (!Array.isArray(json.data)) throw new Error('Respuesta Kitsu inválida')
      return json
    } catch (error) {
      ultimoError = error
    }
  }
  throw ultimoError
}

/** Recorre el año entero, sin tope de páginas ni filtro de rol. */
export async function* recorrerModernosKitsu(anio, { consultar = consultarPaginaKitsu, pausa = 1200 } = {}) {
  let offset = 0
  const vistas = new Set()
  while (true) {
    if (pausa) await new Promise(resolve => setTimeout(resolve, pausa))
    const json = await consultar(anio, offset)
    if (!json.data.length) break
    const firma = JSON.stringify(json.data.map(a => a.id))
    // Algunos filtros Kitsu repiten la primera página para offset=20.
    // No contar dos veces sus fichas, pero continuar el recorrido.
    if (vistas.has(firma)) {
      offset += 20
      if (offset > 40) throw new Error(`La fuente repite páginas: ${anio}/${offset}`)
      continue
    }
    vistas.add(firma)
    yield {
      personajes: extraerModernosKitsu(json, anio, { soloPrincipales: false }),
      series: json.data.length,
      sinReparto: json.data.filter(a => !a.relationships?.characters?.data?.length).length,
      offset,
      total: json.meta?.count,
    }
    // El enlace next de Kitsu puede faltar aunque aún haya resultados.
    offset += 20
  }
}
