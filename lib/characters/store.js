import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { statsForId, combatStatsForPrice } from './rarity.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CATALOG_PATH = path.join(process.cwd(), 'storage', 'databases', 'characters-catalog.json')

function emptyStore() {
  return { updatedAt: 0, characters: {} }
}

export function normalizeCharId(id) {
  const raw = String(id || '').trim()
  const m = raw.match(/(?:kitsu:|jikan:|anilist:|local:)?(\d+)/i)
  return m ? m[1] : raw.replace(/\D/g, '') || raw
}

let memoryStore = null

function readDisk() {
  try {
    if (!fs.existsSync(CATALOG_PATH)) return emptyStore()
    const data = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'))
    if (!data || typeof data !== 'object') return emptyStore()
    if (!data.characters || typeof data.characters !== 'object') data.characters = {}
    return data
  } catch {
    return emptyStore()
  }
}

export function loadCatalog() {
  if (!memoryStore) memoryStore = readDisk()
  return memoryStore
}

let writeTimer = null

export function saveCatalog(store = memoryStore) {
  memoryStore = store || loadCatalog()
  if (writeTimer) return
  writeTimer = setTimeout(() => {
    writeTimer = null
    try {
      fs.mkdirSync(path.dirname(CATALOG_PATH), { recursive: true })
      memoryStore.updatedAt = Date.now()
      fs.writeFileSync(CATALOG_PATH, JSON.stringify(memoryStore, null, 2))
    } catch (e) {
      console.error('characters-catalog save:', e?.message || e)
    }
  }, 250)
}

export function flushCatalog() {
  if (writeTimer) {
    clearTimeout(writeTimer)
    writeTimer = null
  }
  try {
    fs.mkdirSync(path.dirname(CATALOG_PATH), { recursive: true })
    const data = loadCatalog()
    data.updatedAt = Date.now()
    fs.writeFileSync(CATALOG_PATH, JSON.stringify(data, null, 2))
  } catch (e) {
    console.error('characters-catalog flush:', e?.message || e)
  }
}

export function catalogCount(store = loadCatalog()) {
  return Object.keys(store.characters || {}).length
}

/** Asegura hp/poder en memoria (derivados del precio). */
export function withCombatStats(entry) {
  if (!entry || typeof entry !== 'object') return entry
  const combat = combatStatsForPrice(entry.price, entry.id)
  entry.maxHp = combat.maxHp
  entry.hp = combat.maxHp
  entry.power = combat.power
  return entry
}

export function getCatalogEntry(id, store = loadCatalog()) {
  const key = normalizeCharId(id)
  const entry = store.characters[key] || null
  return entry ? withCombatStats(entry) : null
}

export function upsertCatalogEntry(character, store = loadCatalog()) {
  const id = normalizeCharId(character.id || character.sourceId)
  if (!id) return null

  const prev = store.characters[id]
  const locked = prev
    ? {
        rarity: prev.rarity,
        rarityLabel: prev.rarityLabel,
        price: prev.price,
      }
    : statsForId(id)

  const combat = combatStatsForPrice(locked.price, id)

  const entry = {
    id,
    name: character.name || prev?.name || `Character ${id}`,
    anime: character.anime || prev?.anime || 'Sin serie',
    image: character.image || prev?.image || '',
    imageAlt: character.imageAlt || prev?.imageAlt || '',
    rarity: locked.rarity,
    rarityLabel: locked.rarityLabel,
    price: locked.price,
    maxHp: combat.maxHp,
    hp: combat.maxHp,
    power: combat.power,
    source: 'kitsu',
    updatedAt: Date.now(),
  }

  store.characters[id] = entry
  memoryStore = store
  saveCatalog(store)
  return entry
}

export function listCatalogEntries(store = loadCatalog()) {
  return Object.values(store.characters || {}).map(withCombatStats)
}

export function pickCatalogRandom(excludeIds = [], store = loadCatalog()) {
  const exclude = new Set(excludeIds.map(normalizeCharId))
  const pool = listCatalogEntries(store).filter(c => c.image && !exclude.has(String(c.id)))
  if (!pool.length) return null
  return pool[Math.floor(Math.random() * pool.length)]
}

/**
 * Elige un personaje ya poseído (repe).
 * Peso = 1/sqrt(qty): favorece copias de stacks bajos (x1 > x10).
 */
export function pickOwnedDuplicate(ownedStacks = [], store = loadCatalog()) {
  const weighted = []
  for (const row of ownedStacks) {
    const id = normalizeCharId(row?.id)
    if (!id) continue
    const entry = getCatalogEntry(id, store)
    if (!entry?.image) continue
    const qty = Math.max(1, Math.floor(Number(row.qty) || 1))
    const weight = 1 / Math.sqrt(qty)
    weighted.push({ entry, weight })
  }
  if (!weighted.length) return null

  const total = weighted.reduce((s, x) => s + x.weight, 0)
  let roll = Math.random() * total
  for (const item of weighted) {
    roll -= item.weight
    if (roll <= 0) return item.entry
  }
  return weighted[weighted.length - 1].entry
}


/**
 * Rellena hp/poder faltantes en el JSON del catálogo (una pasada).
 */
export function enrichCatalogCombatStats(store = loadCatalog()) {
  let changed = 0
  for (const entry of Object.values(store.characters || {})) {
    if (!entry) continue
    const combat = combatStatsForPrice(entry.price, entry.id)
    if (entry.maxHp !== combat.maxHp || entry.power !== combat.power || entry.hp !== combat.maxHp) {
      entry.maxHp = combat.maxHp
      entry.hp = combat.maxHp
      entry.power = combat.power
      changed++
    }
  }
  if (changed) {
    memoryStore = store
    saveCatalog(store)
  }
  return changed
}

export function toRuntimeCharacter(entry) {
  const e = withCombatStats({ ...entry })
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

export { CATALOG_PATH }
