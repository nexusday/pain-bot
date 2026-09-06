import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { statsForId } from './rarity.js'

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

export function getCatalogEntry(id, store = loadCatalog()) {
  const key = normalizeCharId(id)
  return store.characters[key] || null
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

  const entry = {
    id,
    name: character.name || prev?.name || `Character ${id}`,
    anime: character.anime || prev?.anime || 'Sin serie',
    image: character.image || prev?.image || '',
    imageAlt: character.imageAlt || prev?.imageAlt || '',
    rarity: locked.rarity,
    rarityLabel: locked.rarityLabel,
    price: locked.price,
    source: 'kitsu',
    updatedAt: Date.now(),
  }

  store.characters[id] = entry
  memoryStore = store
  saveCatalog(store)
  return entry
}

export function listCatalogEntries(store = loadCatalog()) {
  return Object.values(store.characters || {})
}

export function pickCatalogRandom(excludeIds = [], store = loadCatalog()) {
  const exclude = new Set(excludeIds.map(normalizeCharId))
  const pool = listCatalogEntries(store).filter(c => c.image && !exclude.has(String(c.id)))
  if (!pool.length) return null
  return pool[Math.floor(Math.random() * pool.length)]
}

export function toRuntimeCharacter(entry) {
  return {
    id: String(entry.id),
    source: entry.source || 'kitsu',
    sourceId: String(entry.id),
    name: entry.name,
    anime: entry.anime,
    image: entry.image,
    imageAlt: entry.imageAlt || '',
    rarity: entry.rarity,
    rarityLabel: entry.rarityLabel,
    price: entry.price,
    favorites: 0,
  }
}

export { CATALOG_PATH }
