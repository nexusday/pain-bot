import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { estadisticasPorId, estadisticasCombatePorPrecio } from './rarity.js'
import { stringifyPorPartes } from '../db-json.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RUTA_CATALOGO = path.join(process.cwd(), 'storage', 'databases', 'characters-catalog.json')

function almacenVacio() {
  return { updatedAt: 0, characters: {} }
}

export function normalizarIdPersonaje(id) {
  const crudo = String(id || '').trim()
  if (/^fandom:[a-f0-9]{24}$/i.test(crudo)) return crudo.toLowerCase()
  // Los IDs numéricos históricos son de Kitsu. No mezclar IDs de otras APIs.
  const externo = crudo.match(/^(jikan|anilist|local):(\d+)$/i)
  if (externo) return `${externo[1].toLowerCase()}:${externo[2]}`
  const m = crudo.match(/(?:kitsu:|jikan:|anilist:|local:)?(\d+)/i)
  return m ? m[1] : crudo.replace(/\D/g, '') || crudo
}

let almacenMemoria = null
let versionCatalogo = 0

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

const INTERVALO_GUARDADO_MS = 10 * 60 * 1000
let temporizadorEscritura = null
// El archivo pesa ~43 MB: serializarlo congela el event-loop varios segundos
// y con 150 subbots jugando gacha pasaba a cada rato ("de pronto lento").
// Por defecto el runtime ya NO vuelca a disco: los descubiertos quedan en
// memoria y se re-piden a Kitsu si hacen falta; el script sync:chars sigue
// siendo el importador oficial. Para el comportamiento anterior:
// PAIN_CATALOG_RUNTIME_SAVE=1
const GUARDADO_RUNTIME_ACTIVO = String(process.env.PAIN_CATALOG_RUNTIME_SAVE ?? '0') === '1'

export function guardarCatalogo(almacen = almacenMemoria) {
  almacenMemoria = almacen || cargarCatalogo()
  if (!GUARDADO_RUNTIME_ACTIVO) return
  if (temporizadorEscritura) return
  // El archivo pesa ~43 MB: serializarlo cada 4 s tras cada personaje nuevo bloqueaba el proceso.
  temporizadorEscritura = setTimeout(() => {
    temporizadorEscritura = null
    volcarCatalogo().catch((e) => {
      console.error('characters-catalog save:', e?.message || e)
    })
  }, INTERVALO_GUARDADO_MS)
  temporizadorEscritura.unref?.()
}

export async function volcarCatalogo() {
  if (temporizadorEscritura) {
    clearTimeout(temporizadorEscritura)
    temporizadorEscritura = null
  }
  fs.mkdirSync(path.dirname(RUTA_CATALOGO), { recursive: true })
  const data = cargarCatalogo()
  data.updatedAt = Date.now()
  const texto = await stringifyPorPartes(data)
  const temporal = `${RUTA_CATALOGO}.tmp`
  await fs.promises.writeFile(temporal, texto)
  await fs.promises.rename(temporal, RUTA_CATALOGO)
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
    source: personaje.source || prev?.source || (id.startsWith('jikan:') ? 'jikan' : 'kitsu'),
    modernYear: personaje.modernYear || prev?.modernYear || null,
    ...(personaje.sourceUrl || prev?.sourceUrl ? { sourceUrl: personaje.sourceUrl || prev.sourceUrl } : {}),
    ...(personaje.dataset || prev?.dataset ? { dataset: personaje.dataset || prev.dataset } : {}),
    ...(personaje.license || prev?.license ? { license: personaje.license || prev.license } : {}),
    updatedAt: Date.now(),
  }

  almacen.characters[id] = entrada
  if (!prev) versionCatalogo++
  almacenMemoria = almacen
  guardarCatalogo(almacen)
  return entrada
}

export function listarEntradasCatalogo(almacen = cargarCatalogo()) {
  return Object.values(almacen.characters || {}).map(conEstadisticasCombate)
}

const VIDA_CLAVES_MS = 10 * 60 * 1000
const INTENTOS_ALEATORIOS = 80
let cacheClaves = { personajes: null, version: -1, hasta: 0, claves: [] }

function clavesDelCatalogo(almacen) {
  const personajes = almacen.characters || {}
  const ahora = Date.now()
  if (
    cacheClaves.personajes !== personajes ||
    cacheClaves.version !== versionCatalogo ||
    ahora > cacheClaves.hasta
  ) {
    cacheClaves = {
      personajes,
      version: versionCatalogo,
      hasta: ahora + VIDA_CLAVES_MS,
      claves: Object.keys(personajes)
    }
  }
  return cacheClaves.claves
}

// El catálogo tiene ~93 000 entradas: se sortea una al azar en vez de recorrerlas todas en cada tirada.
export function elegirCatalogoAleatorio(idsExcluidos = [], almacen = cargarCatalogo()) {
  const excluir = new Set(idsExcluidos.map(normalizarIdPersonaje))
  const claves = clavesDelCatalogo(almacen)
  if (!claves.length) return null
  const personajes = almacen.characters
  const intentos = Math.min(INTENTOS_ALEATORIOS, claves.length)
  for (let i = 0; i < intentos; i++) {
    const entrada = personajes[claves[Math.floor(Math.random() * claves.length)]]
    if (entrada?.image && !excluir.has(String(entrada.id))) return conEstadisticasCombate(entrada)
  }
  const pool = Object.values(personajes).filter(c => c?.image && !excluir.has(String(c.id)))
  if (!pool.length) return null
  return conEstadisticasCombate(pool[Math.floor(Math.random() * pool.length)])
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
