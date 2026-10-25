import fetch from 'node-fetch'

const API = 'https://api.jikan.moe/v4'
export const ANIO_MODERNO_MINIMO = 2020
export const PROBABILIDAD_MODERNO = 0.70

export async function consultarJikan(ruta) {
  const respuesta = await fetch(`${API}${ruta}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  })
  if (!respuesta.ok) throw new Error(`Jikan HTTP ${respuesta.status}`)
  const json = await respuesta.json()
  if (!Array.isArray(json.data)) throw new Error('Respuesta Jikan inválida')
  return json.data
}

export async function listarAnimeModernos(consultar = consultarJikan) {
  // Popularidad entre estrenos recientes, no entre IDs históricos.
  const animes = await consultar(`/anime?start_date=${ANIO_MODERNO_MINIMO}-01-01&order_by=popularity&sort=asc&sfw=true&limit=25`)
  return animes.filter(a => a?.mal_id && a?.aired?.prop?.from?.year >= ANIO_MODERNO_MINIMO)
}

export function normalizarRepartoModerno(anime, reparto = []) {
  const unicos = new Map()
  for (const fila of reparto) {
    const c = fila?.character
    const image = c?.images?.jpg?.image_url || c?.images?.webp?.image_url
    if (!c?.mal_id || !c?.name || !image || /questionmark|apple-touch-icon/i.test(image)) continue
    // Se prioriza el reparto principal; evita llenar /rw de extras sin relevancia.
    if (fila.role !== 'Main') continue
    const id = `jikan:${c.mal_id}`
    unicos.set(id, {
      id, sourceId: String(c.mal_id), source: 'jikan',
      name: c.name, anime: anime.title_english || anime.title,
      image, imageAlt: c.images?.webp?.image_url || image,
      modernYear: anime.aired.prop.from.year,
    })
  }
  return [...unicos.values()]
}

export async function obtenerRepartoModerno(anime, consultar = consultarJikan) {
  return normalizarRepartoModerno(anime, await consultar(`/anime/${anime.mal_id}/characters`))
}

/** Caché compartida por proceso: no consulta la API en cada /rw ni en paralelo. */
export function crearProveedorModerno({ cargar, guardar, consultar = consultarJikan, ahora = Date.now, azar = Math.random }) {
  let pool
  let animes = []
  let hastaLista = 0
  let proximaActualizacion = 0
  let pendiente = null
  const visitados = new Set()

  async function actualizar() {
    try {
      if (!animes.length || ahora() >= hastaLista) {
        animes = await listarAnimeModernos(consultar)
        hastaLista = ahora() + 6 * 60 * 60 * 1000
        visitados.clear()
      }
      let candidatos = animes.filter(a => !visitados.has(a.mal_id))
      if (!candidatos.length) {
        visitados.clear()
        candidatos = animes
      }
      if (!candidatos.length) throw new Error('Sin series modernas disponibles')
      const anime = candidatos[Math.floor(azar() * candidatos.length)]
      visitados.add(anime.mal_id)
      // Dos peticiones como máximo por actualización, separadas para respetar la API.
      await new Promise(resolve => setTimeout(resolve, 1100))
      const personajes = await obtenerRepartoModerno(anime, consultar)
      for (const c of personajes) {
        const entrada = guardar(c)
        if (entrada) pool.set(entrada.id, entrada)
      }
      proximaActualizacion = ahora() + (personajes.length ? 30 * 60_000 : 5 * 60_000)
    } catch {
      // El catálogo existente sigue funcionando aunque la fuente externa caiga.
      proximaActualizacion = ahora() + 5 * 60_000
    } finally {
      pendiente = null
    }
  }

  return async function elegir(excluidos = new Set()) {
    if (!pool) {
      pool = new Map(cargar().filter(c => c.modernYear >= ANIO_MODERNO_MINIMO && c.image).map(c => [c.id, c]))
    }
    if (!pendiente && ahora() >= proximaActualizacion) pendiente = actualizar()
    if (!pool.size && pendiente) await pendiente
    const candidatos = [...pool.values()].filter(c => !excluidos.has(String(c.id)))
    return candidatos.length ? candidatos[Math.floor(azar() * candidatos.length)] : null
  }
}
