import fetch from 'node-fetch'
import {
  loadCatalog,
  catalogCount,
  upsertCatalogEntry,
  pickCatalogRandom,
  toRuntimeCharacter,
  normalizeCharId,
} from './store.js'

const KITSU = 'https://kitsu.io/api/edge'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const MAX_OFFSET = 12000

const sleep = ms => new Promise(r => setTimeout(r, ms))

function pickKitsuImage(image = {}) {
  const main = image.original || image.large || image.medium || image.small || ''
  const alt = image.large || image.medium || image.original || image.small || ''
  return {
    image: String(main || ''),
    imageAlt: String(alt || ''),
  }
}

function animeFromIncluded(included = [], relationships = {}) {
  const rel = relationships?.mediaCharacters?.data
  const relIds = Array.isArray(rel) ? rel.map(x => String(x.id)) : rel?.id ? [String(rel.id)] : []
  const mediaChars = included.filter(x => x.type === 'mediaCharacters' && relIds.includes(String(x.id)))
  for (const mc of mediaChars) {
    const mediaRel = mc.relationships?.media?.data
    if (!mediaRel?.id) continue
    const media = included.find(x => String(x.id) === String(mediaRel.id) && (x.type === 'anime' || x.type === 'manga'))
    if (!media) continue
    const title =
      media.attributes?.canonicalTitle ||
      media.attributes?.titles?.en ||
      media.attributes?.titles?.en_jp ||
      media.attributes?.titles?.ja_jp
    if (title) return title
  }
  const media = included.find(x => x.type === 'anime' || x.type === 'manga')
  return (
    media?.attributes?.canonicalTitle ||
    media?.attributes?.titles?.en ||
    media?.attributes?.titles?.en_jp ||
    'Sin serie'
  )
}

async function kitsuGet(path) {
  const res = await fetch(`${KITSU}${path}`, {
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

function normalizeApiCharacter(entry, included = []) {
  if (!entry?.id) throw new Error('Personaje inválido')
  const attrs = entry.attributes || {}
  const imgs = pickKitsuImage(attrs.image || {})
  if (!imgs.image) throw new Error('Personaje sin imagen')
  const id = normalizeCharId(entry.id)
  return {
    id,
    sourceId: id,
    name: attrs.canonicalName || attrs.name || `Character ${id}`,
    anime: animeFromIncluded(included, entry.relationships || {}),
    image: imgs.image,
    imageAlt: imgs.imageAlt,
  }
}

function persistAndRuntime(raw) {
  const entry = upsertCatalogEntry(raw)
  return toRuntimeCharacter(entry)
}

async function fetchBatchAndStore(offset, limit = 20) {
  const safeLimit = Math.min(20, Math.max(1, limit))
  const json = await kitsuGet(
    `/characters?page[limit]=${safeLimit}&page[offset]=${offset}&include=mediaCharacters.media`
  )
  const list = Array.isArray(json?.data) ? json.data : []
  const included = json.included || []
  const saved = []
  for (const entry of list) {
    try {
      const raw = normalizeApiCharacter(entry, included)
      saved.push(persistAndRuntime(raw))
    } catch {}
  }
  return saved
}

export async function syncCatalogBatches(batches = 4) {
  const out = []
  for (let i = 0; i < batches; i++) {
    const offset = Math.floor(Math.random() * Math.max(1, MAX_OFFSET - 20))
    try {
      const saved = await fetchBatchAndStore(offset, 20)
      out.push(...saved)
    } catch (e) {
      console.error('catalog sync batch:', e?.message || e)
    }
    await sleep(350)
  }
  return out
}

export async function ensureCatalogWarm(min = 80) {
  if (catalogCount() >= min) return catalogCount()
  await syncCatalogBatches(5)
  return catalogCount()
}

async function fetchFreshCharacter(excludeIds = new Set()) {
  for (let i = 0; i < 6; i++) {
    const offset = Math.floor(Math.random() * Math.max(1, MAX_OFFSET - 20))
    const saved = await fetchBatchAndStore(offset, 20)
    const pick = saved.find(c => !excludeIds.has(String(c.id)))
    if (pick) return pick
    await sleep(200)
  }
  throw new Error('No se pudo obtener personaje nuevo')
}

export async function downloadCharacterImage(character) {
  const urls = [...new Set([character?.image, character?.imageAlt].filter(Boolean))]
  let lastErr
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
        lastErr = new Error(`Imagen HTTP ${res.status}`)
        continue
      }
      const buf = Buffer.from(await res.arrayBuffer())
      if (!buf.length || buf.length < 800) {
        lastErr = new Error('Imagen inválida')
        continue
      }
      return buf
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr || new Error('No se pudo descargar la imagen')
}

export async function fetchRandomCharacter(opts = {}) {
  const excludeIds = new Set((opts.excludeIds || []).map(normalizeCharId))
  await ensureCatalogWarm(60)

  const store = loadCatalog()
  const fromStore = pickCatalogRandom([...excludeIds], store)
  const preferStore = fromStore && (catalogCount(store) > 40) && Math.random() < 0.72

  if (preferStore) return toRuntimeCharacter(fromStore)

  try {
    return await fetchFreshCharacter(excludeIds)
  } catch (e) {
    if (fromStore) return toRuntimeCharacter(fromStore)
    throw new Error(`No se pudo obtener personaje (${e?.message || e})`)
  }
}

export function characterKey(char) {
  return normalizeCharId(char?.id)
}
