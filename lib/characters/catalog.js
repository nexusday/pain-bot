import fetch from 'node-fetch'
import {
  cargarCatalogo,
  contarCatalogo,
  insertarOActualizarEntradaCatalogo,
  elegirCatalogoAleatorio,
  elegirDuplicadoPoseido,
  aPersonajeRuntime,
  normalizarIdPersonaje,
} from './store.js'

const KITSU = 'https://kitsu.io/api/edge'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const OFFSET_MAX = 12000

/** Chance base de sacar un personaje que ya tienes (repe). */
export const PROBABILIDAD_DUPLICADO = 0.22

const dormir = ms => new Promise(r => setTimeout(r, ms))

function elegirImagenKitsu(imagen = {}) {
  const principal = imagen.original || imagen.large || imagen.medium || imagen.small || ''
  const alt = imagen.large || imagen.medium || imagen.original || imagen.small || ''
  return {
    image: String(principal || ''),
    imageAlt: String(alt || ''),
  }
}

function animeDesdeIncluidos(incluidos = [], relaciones = {}) {
  const rel = relaciones?.mediaCharacters?.data
  const relIds = Array.isArray(rel) ? rel.map(x => String(x.id)) : rel?.id ? [String(rel.id)] : []
  const mediaChars = incluidos.filter(x => x.type === 'mediaCharacters' && relIds.includes(String(x.id)))
  for (const mc of mediaChars) {
    const mediaRel = mc.relationships?.media?.data
    if (!mediaRel?.id) continue
    const media = incluidos.find(x => String(x.id) === String(mediaRel.id) && (x.type === 'anime' || x.type === 'manga'))
    if (!media) continue
    const title =
      media.attributes?.canonicalTitle ||
      media.attributes?.titles?.en ||
      media.attributes?.titles?.en_jp ||
      media.attributes?.titles?.ja_jp
    if (title) return title
  }
  const media = incluidos.find(x => x.type === 'anime' || x.type === 'manga')
  return (
    media?.attributes?.canonicalTitle ||
    media?.attributes?.titles?.en ||
    media?.attributes?.titles?.en_jp ||
    'Sin serie'
  )
}

async function obtenerKitsu(ruta) {
  const res = await fetch(`${KITSU}${ruta}`, {
    headers: {
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
      'User-Agent': UA,
    },
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new Error(json?.errors?.[0]?.detail || `Kitsu HTTP ${res.status}`)
  return json
}

function normalizarPersonajeApi(entrada, incluidos = []) {
  if (!entrada?.id) throw new Error('Personaje inválido')
  const attrs = entrada.attributes || {}
  const imgs = elegirImagenKitsu(attrs.image || {})
  if (!imgs.image) throw new Error('Personaje sin imagen')
  const id = normalizarIdPersonaje(entrada.id)
  return {
    id,
    sourceId: id,
    name: attrs.canonicalName || attrs.name || `Character ${id}`,
    anime: animeDesdeIncluidos(incluidos, entrada.relationships || {}),
    image: imgs.image,
    imageAlt: imgs.imageAlt,
  }
}

function persistirYRuntime(crudo) {
  const entrada = insertarOActualizarEntradaCatalogo(crudo)
  return aPersonajeRuntime(entrada)
}

async function obtenerLoteYGuardar(offset, limite = 20) {
  const limiteSeguro = Math.min(20, Math.max(1, limite))
  const json = await obtenerKitsu(
    `/characters?page[limit]=${limiteSeguro}&page[offset]=${offset}&include=mediaCharacters.media`
  )
  const lista = Array.isArray(json?.data) ? json.data : []
  const incluidos = json.included || []
  const guardados = []
  for (const entrada of lista) {
    try {
      const crudo = normalizarPersonajeApi(entrada, incluidos)
      guardados.push(persistirYRuntime(crudo))
    } catch {}
  }
  return guardados
}

export async function sincronizarLotesCatalogo(lotes = 4) {
  const salida = []
  for (let i = 0; i < lotes; i++) {
    const offset = Math.floor(Math.random() * Math.max(1, OFFSET_MAX - 20))
    try {
      const guardados = await obtenerLoteYGuardar(offset, 20)
      salida.push(...guardados)
    } catch (e) {
      console.error('catalog sync batch:', e?.message || e)
    }
    await dormir(350)
  }
  return salida
}

export async function asegurarCatalogoCaliente(minimo = 80) {
  if (contarCatalogo() >= minimo) return contarCatalogo()
  await sincronizarLotesCatalogo(5)
  return contarCatalogo()
}

async function obtenerPersonajeFresco(idsExcluidos = new Set()) {
  for (let i = 0; i < 6; i++) {
    const offset = Math.floor(Math.random() * Math.max(1, OFFSET_MAX - 20))
    const guardados = await obtenerLoteYGuardar(offset, 20)
    const elegido = guardados.find(c => !idsExcluidos.has(String(c.id)))
    if (elegido) return elegido
    await dormir(200)
  }
  throw new Error('No se pudo obtener personaje nuevo')
}

export async function descargarImagenPersonaje(personaje) {
  const urls = [...new Set([personaje?.image, personaje?.imageAlt].filter(Boolean))]
  let ultimoError
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': UA,
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
          Referer: 'https://kitsu.io/',
        },
      })
      if (!res.ok) {
        ultimoError = new Error(`Imagen HTTP ${res.status}`)
        continue
      }
      const buf = Buffer.from(await res.arrayBuffer())
      if (!buf.length || buf.length < 800) {
        ultimoError = new Error('Imagen inválida')
        continue
      }
      return buf
    } catch (e) {
      ultimoError = e
    }
  }
  throw ultimoError || new Error('No se pudo descargar la imagen')
}

export async function obtenerPersonajeAleatorio(opts = {}) {
  const idsExcluidos = new Set((opts.excludeIds || []).map(normalizarIdPersonaje))
  const pilasPoseidas = Array.isArray(opts.ownedStacks) ? opts.ownedStacks : []
  await asegurarCatalogoCaliente(60)

  const almacen = cargarCatalogo()

  // Soft pity de repetición: ~22% si el usuario ya tiene colección
  const chanceDup = Number.isFinite(opts.duplicateChance)
    ? Math.min(0.85, Math.max(0, opts.duplicateChance))
    : PROBABILIDAD_DUPLICADO

  if (pilasPoseidas.length > 0 && Math.random() < chanceDup) {
    const elegidoPoseido = elegirDuplicadoPoseido(pilasPoseidas, almacen)
    if (elegidoPoseido && !idsExcluidos.has(String(elegidoPoseido.id))) {
      return aPersonajeRuntime(elegidoPoseido)
    }
  }

  const desdeAlmacen = elegirCatalogoAleatorio([...idsExcluidos], almacen)
  const preferirAlmacen = desdeAlmacen && (contarCatalogo(almacen) > 40) && Math.random() < 0.72

  if (preferirAlmacen) return aPersonajeRuntime(desdeAlmacen)

  try {
    return await obtenerPersonajeFresco(idsExcluidos)
  } catch (e) {
    if (desdeAlmacen) return aPersonajeRuntime(desdeAlmacen)
    throw new Error(`No se pudo obtener personaje (${e?.message || e})`)
  }
}

export function clavePersonaje(personaje) {
  return normalizarIdPersonaje(personaje?.id)
}

export {
  PROBABILIDAD_DUPLICADO as DUPLICATE_CHANCE,
  sincronizarLotesCatalogo as syncCatalogBatches,
  asegurarCatalogoCaliente as ensureCatalogWarm,
  descargarImagenPersonaje as downloadCharacterImage,
  obtenerPersonajeAleatorio as fetchRandomCharacter,
  clavePersonaje as characterKey,
}
