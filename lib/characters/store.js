import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { estadisticasPorId, estadisticasCombatePorPrecio } from './rarity.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RUTA_CATALOGO = path.join(process.cwd(), 'storage', 'databases', 'characters-catalog.json')

function almacenVacio() {
  return { updatedAt: 0, characters: {} }
}

export function normalizarIdPersonaje(id) {
  const crudo = String(id || '').trim()
  const m = crudo.match(/(?:kitsu:|jikan:|anilist:|local:)?(\d+)/i)
  return m ? m[1] : crudo.replace(/\D/g, '') || crudo
}

let almacenMemoria = null

function leerDisco() {
  try {
    if (!fs.existsSync(RUTA_CATALOGO)) return almacenVacio()
    const data = JSON.parse(fs.readFileSync(RUTA_CATALOGO, 'utf8'))
    if (!data || typeof data !== 'object') return almacenVacio()
    if (!data.characters || typeof data.characters !== 'object') data.characters = {}
    return data
  } catch {
    return almacenVacio()
  }
}

export function cargarCatalogo() {
  if (!almacenMemoria) almacenMemoria = leerDisco()
  return almacenMemoria
}

let temporizadorEscritura = null

export function guardarCatalogo(almacen = almacenMemoria) {
  almacenMemoria = almacen || cargarCatalogo()
  if (temporizadorEscritura) return
  temporizadorEscritura = setTimeout(() => {
    temporizadorEscritura = null
    try {
      fs.mkdirSync(path.dirname(RUTA_CATALOGO), { recursive: true })
      almacenMemoria.updatedAt = Date.now()
      fs.writeFileSync(RUTA_CATALOGO, JSON.stringify(almacenMemoria, null, 2))
    } catch (e) {
      console.error('characters-catalog save:', e?.message || e)
    }
  }, 250)
}

export function volcarCatalogo() {
  if (temporizadorEscritura) {
    clearTimeout(temporizadorEscritura)
    temporizadorEscritura = null
  }
  try {
    fs.mkdirSync(path.dirname(RUTA_CATALOGO), { recursive: true })
    const data = cargarCatalogo()
    data.updatedAt = Date.now()
    fs.writeFileSync(RUTA_CATALOGO, JSON.stringify(data, null, 2))
  } catch (e) {
    console.error('characters-catalog flush:', e?.message || e)
  }
}

export function contarCatalogo(almacen = cargarCatalogo()) {
  return Object.keys(almacen.characters || {}).length
}

/** Asegura hp/poder en memoria (derivados del precio). */
export function conEstadisticasCombate(entrada) {
  if (!entrada || typeof entrada !== 'object') return entrada
  const combate = estadisticasCombatePorPrecio(entrada.price, entrada.id)
  entrada.maxHp = combate.maxHp
  entrada.hp = combate.maxHp
  entrada.power = combate.power
  return entrada
}

export function obtenerEntradaCatalogo(id, almacen = cargarCatalogo()) {
  const clave = normalizarIdPersonaje(id)
  const entrada = almacen.characters[clave] || null
  return entrada ? conEstadisticasCombate(entrada) : null
}

export function insertarOActualizarEntradaCatalogo(personaje, almacen = cargarCatalogo()) {
  const id = normalizarIdPersonaje(personaje.id || personaje.sourceId)
  if (!id) return null

  const prev = almacen.characters[id]
  const bloqueado = prev
    ? {
        rarity: prev.rarity,
        rarityLabel: prev.rarityLabel,
        price: prev.price,
      }
    : estadisticasPorId(id)

  const combate = estadisticasCombatePorPrecio(bloqueado.price, id)

  const entrada = {
    id,
    name: personaje.name || prev?.name || `Character ${id}`,
    anime: personaje.anime || prev?.anime || 'Sin serie',
    image: personaje.image || prev?.image || '',
    imageAlt: personaje.imageAlt || prev?.imageAlt || '',
    rarity: bloqueado.rarity,
    rarityLabel: bloqueado.rarityLabel,
    price: bloqueado.price,
    maxHp: combate.maxHp,
    hp: combate.maxHp,
    power: combate.power,
    source: 'kitsu',
    updatedAt: Date.now(),
  }

  almacen.characters[id] = entrada
  almacenMemoria = almacen
  guardarCatalogo(almacen)
  return entrada
}

export function listarEntradasCatalogo(almacen = cargarCatalogo()) {
  return Object.values(almacen.characters || {}).map(conEstadisticasCombate)
}

export function elegirCatalogoAleatorio(idsExcluidos = [], almacen = cargarCatalogo()) {
  const excluir = new Set(idsExcluidos.map(normalizarIdPersonaje))
  const pool = listarEntradasCatalogo(almacen).filter(c => c.image && !excluir.has(String(c.id)))
  if (!pool.length) return null
  return pool[Math.floor(Math.random() * pool.length)]
}

/**
 * Elige un personaje ya poseído (repe).
 * Peso = 1/sqrt(qty): favorece copias de stacks bajos (x1 > x10).
 */
export function elegirDuplicadoPoseido(pilasPoseidas = [], almacen = cargarCatalogo()) {
  const ponderados = []
  for (const fila of pilasPoseidas) {
    const id = normalizarIdPersonaje(fila?.id)
    if (!id) continue
    const entrada = obtenerEntradaCatalogo(id, almacen)
    if (!entrada?.image) continue
    const qty = Math.max(1, Math.floor(Number(fila.qty) || 1))
    const peso = 1 / Math.sqrt(qty)
    ponderados.push({ entry: entrada, weight: peso })
  }
  if (!ponderados.length) return null

  const total = ponderados.reduce((s, x) => s + x.weight, 0)
  let tiro = Math.random() * total
  for (const item of ponderados) {
    tiro -= item.weight
    if (tiro <= 0) return item.entry
  }
  return ponderados[ponderados.length - 1].entry
}


/**
 * Rellena hp/poder faltantes en el JSON del catálogo (una pasada).
 */
export function enriquecerEstadisticasCombateCatalogo(almacen = cargarCatalogo()) {
  let cambiados = 0
  for (const entrada of Object.values(almacen.characters || {})) {
    if (!entrada) continue
    const combate = estadisticasCombatePorPrecio(entrada.price, entrada.id)
    if (entrada.maxHp !== combate.maxHp || entrada.power !== combate.power || entrada.hp !== combate.maxHp) {
      entrada.maxHp = combate.maxHp
      entrada.hp = combate.maxHp
      entrada.power = combate.power
      cambiados++
    }
  }
  if (cambiados) {
    almacenMemoria = almacen
    guardarCatalogo(almacen)
  }
  return cambiados
}

export function aPersonajeRuntime(entrada) {
  const e = conEstadisticasCombate({ ...entrada })
  return {
    id: String(e.id),
    source: e.source || 'kitsu',
    sourceId: String(e.id),
    name: e.name,
    anime: e.anime,
    image: e.image,
    imageAlt: e.imageAlt || '',
    rarity: e.rarity,
    rarityLabel: e.rarityLabel,
    price: e.price,
    maxHp: e.maxHp,
    hp: e.hp,
    power: e.power,
    favorites: 0,
  }
}

export {
  RUTA_CATALOGO,
  RUTA_CATALOGO as CATALOG_PATH,
  normalizarIdPersonaje as normalizeCharId,
  cargarCatalogo as loadCatalog,
  guardarCatalogo as saveCatalog,
  volcarCatalogo as flushCatalog,
  contarCatalogo as catalogCount,
  conEstadisticasCombate as withCombatStats,
  obtenerEntradaCatalogo as getCatalogEntry,
  insertarOActualizarEntradaCatalogo as upsertCatalogEntry,
  listarEntradasCatalogo as listCatalogEntries,
  elegirCatalogoAleatorio as pickCatalogRandom,
  elegirDuplicadoPoseido as pickOwnedDuplicate,
  enriquecerEstadisticasCombateCatalogo as enrichCatalogCombatStats,
  aPersonajeRuntime as toRuntimeCharacter,
}
