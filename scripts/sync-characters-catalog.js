/**
 * Sync completo de personajes Kitsu -> characters-catalog.json
 * Kitsu max = 20/página, así que baja en OLEADAS de 1000+ (páginas en paralelo).
 *
 *   node scripts/sync-characters-catalog.js
 *   node scripts/sync-characters-catalog.js --reset
 *   node scripts/sync-characters-catalog.js --batch 2000 --concurrency 60
 */

import fs from 'fs'
import path from 'path'
import {
  CATALOG_PATH,
  loadCatalog,
  flushCatalog,
  upsertCatalogEntry,
  catalogCount,
  normalizeCharId,
} from '../lib/characters/store.js'

const KITSU = 'https://kitsu.io/api/edge'
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const PAGE_SIZE = 20
const PROGRESS_PATH = path.join(
  process.cwd(),
  'storage',
  'databases',
  'characters-sync-progress.json'
)

const args = process.argv.slice(2)
const RESET = args.includes('--reset')
const getNum = (name, fallback) => {
  const eq = args.find(a => a.startsWith(`${name}=`))
  if (eq) return Number(eq.split('=')[1]) || fallback
  const i = args.indexOf(name)
  if (i >= 0 && args[i + 1]) return Number(args[i + 1]) || fallback
  return fallback
}

const BATCH = Math.max(PAGE_SIZE, getNum('--batch', 1000))
const CONCURRENCY = Math.max(1, getNum('--concurrency', Math.ceil(BATCH / PAGE_SIZE)))
const DELAY = Math.max(0, getNum('--delay', 40))

const sleep = ms => new Promise(r => setTimeout(r, ms))

function pickImage(image = {}) {
  return {
    image: String(image.original || image.large || image.medium || image.small || ''),
    imageAlt: String(image.large || image.medium || image.original || image.small || ''),
  }
}

function loadProgress() {
  try {
    if (!fs.existsSync(PROGRESS_PATH)) return { offset: 0, total: null, saved: 0, skipped: 0 }
    return JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf8'))
  } catch {
    return { offset: 0, total: null, saved: 0, skipped: 0 }
  }
}

function saveProgress(progress) {
  fs.mkdirSync(path.dirname(PROGRESS_PATH), { recursive: true })
  fs.writeFileSync(PROGRESS_PATH, JSON.stringify(progress, null, 2))
}

function writeCatalogNow(extra = {}) {
  const store = loadCatalog()
  if (extra && typeof extra === 'object') Object.assign(store, extra)
  store.updatedAt = Date.now()
  fs.mkdirSync(path.dirname(CATALOG_PATH), { recursive: true })
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(store, null, 2))
}

async function kitsuPage(offset) {
  const url = `${KITSU}/characters?page[limit]=${PAGE_SIZE}&page[offset]=${offset}`
  for (let attempt = 1; attempt <= 8; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          Accept: 'application/vnd.api+json',
          'Content-Type': 'application/vnd.api+json',
          'User-Agent': UA,
        },
      })
      if (res.status === 429) {
        await sleep(800 * attempt)
        continue
      }
      if (res.status >= 500) {
        await sleep(500 * attempt)
        continue
      }
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.errors?.[0]?.detail || `HTTP ${res.status}`)
      return json
    } catch (e) {
      if (attempt >= 8) throw e
      await sleep(400 * attempt)
    }
  }
  throw new Error(`Falló offset ${offset}`)
}

async function mapPool(items, concurrency, worker) {
  const results = new Array(items.length)
  let idx = 0
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (idx < items.length) {
      const current = idx++
      results[current] = await worker(items[current], current)
    }
  })
  await Promise.all(runners)
  return results
}

function ingestPage(json) {
  let saved = 0
  let skipped = 0
  const list = Array.isArray(json?.data) ? json.data : []
  for (const entry of list) {
    const attrs = entry?.attributes || {}
    const id = normalizeCharId(entry?.id)
    if (!id) {
      skipped++
      continue
    }
    const imgs = pickImage(attrs.image || {})
    if (!imgs.image) {
      skipped++
      continue
    }
    upsertCatalogEntry({
      id,
      name: attrs.canonicalName || attrs.name || `Character ${id}`,
      anime: 'Sin serie',
      image: imgs.image,
      imageAlt: imgs.imageAlt,
    })
    saved++
  }
  return { saved, skipped, got: list.length }
}

async function main() {
  console.log('=== Sync catálogo personajes (oleadas paralelas) ===')
  console.log(`Salida: ${CATALOG_PATH}`)
  console.log(`Lote: ${BATCH} | concurrencia: ${CONCURRENCY} páginas x ${PAGE_SIZE} = hasta ${CONCURRENCY * PAGE_SIZE}/oleada`)

  if (RESET) {
    fs.mkdirSync(path.dirname(CATALOG_PATH), { recursive: true })
    fs.writeFileSync(
      CATALOG_PATH,
      JSON.stringify({ updatedAt: Date.now(), characters: {} }, null, 2)
    )
    saveProgress({ offset: 0, total: null, saved: 0, skipped: 0 })
    console.log('Catálogo reiniciado (--reset)')
  }

  loadCatalog()
  const progress = loadProgress()
  let offset = Number(progress.offset) || 0
  let saved = Number(progress.saved) || 0
  let skipped = Number(progress.skipped) || 0

  const probe = await kitsuPage(0)
  const total = Number(probe?.meta?.count) || Number(progress.total) || 0
  console.log(`Total Kitsu: ${total}`)
  console.log(`Reanudando offset=${offset} | JSON actual=${catalogCount()}`)

  const started = Date.now()

  while (offset < total) {
    const pagesInWave = Math.ceil(BATCH / PAGE_SIZE)
    const offsets = []
    for (let i = 0; i < pagesInWave && offset + i * PAGE_SIZE < total; i++) {
      offsets.push(offset + i * PAGE_SIZE)
    }
    if (!offsets.length) break

    const pages = await mapPool(offsets, CONCURRENCY, async off => {
      try {
        return await kitsuPage(off)
      } catch (e) {
        console.error(`  fail offset ${off}: ${e.message}`)
        return null
      }
    })

    let waveSaved = 0
    let waveSkip = 0
    let waveGot = 0
    for (const json of pages) {
      if (!json) continue
      const r = ingestPage(json)
      waveSaved += r.saved
      waveSkip += r.skipped
      waveGot += r.got
    }

    saved += waveSaved
    skipped += waveSkip
    offset += offsets.length * PAGE_SIZE

    flushCatalog()
    writeCatalogNow({
      sync: {
        complete: false,
        offset,
        total,
        at: Date.now(),
      },
    })
    saveProgress({ offset, total, saved, skipped, at: Date.now() })

    const pct = total ? ((Math.min(offset, total) / total) * 100).toFixed(2) : '?'
    const mins = ((Date.now() - started) / 60000).toFixed(1)
    console.log(
      `[${pct}%] +${waveGot} (ok ${waveSaved} / skip ${waveSkip}) | offset=${Math.min(offset, total)}/${total} | catalog=${catalogCount()} | ${mins}m`
    )

    if (DELAY) await sleep(DELAY)
  }

  flushCatalog()
  writeCatalogNow({
    sync: {
      complete: true,
      at: Date.now(),
      totalKitsu: total,
      withImage: catalogCount(),
      skippedNoImage: skipped,
    },
  })
  saveProgress({ offset, total, saved, skipped, done: true, at: Date.now() })

  console.log('=== LISTO ===')
  console.log(`Personajes con imagen: ${catalogCount()}`)
  console.log(`Omitidos sin imagen: ${skipped}`)
  console.log(`Archivo: ${CATALOG_PATH}`)
}

main().catch(e => {
  console.error('Sync fatal:', e)
  try {
    flushCatalog()
    writeCatalogNow({
      sync: { complete: false, error: String(e?.message || e), at: Date.now() },
    })
  } catch {}
  process.exit(1)
})
