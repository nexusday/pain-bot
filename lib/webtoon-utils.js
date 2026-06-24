import sharp from 'sharp'
import { PDFDocument } from 'pdf-lib'
import fetch from 'node-fetch'
import https from 'https'
import os from 'os'

sharp.concurrency(Math.max(8, os.cpus().length * 2))
sharp.cache({ memory: 256, files: 20, items: 200 })

const API_TIMEOUT = 45 * 1000
const IMAGE_TIMEOUT = 6 * 1000
const API_RETRIES = 2
const CHUNK_SIZE = 250
const PARALLEL_CHUNKS = Math.min(10, Math.max(4, os.cpus().length + 2))
const PARALLEL_WBDL = 10
const MAX_IMAGE_WIDTH = 720
const JPEG_QUALITY = 58
const MAX_PAGES_PER_PART = 900
const WA_MAX_BYTES = 58 * 1024 * 1024

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 280,
  maxFreeSockets: 80,
  scheduling: 'lifo',
  timeout: IMAGE_TIMEOUT
})

function wtLog(stage, message, extra) {
  const time = new Date().toISOString().slice(11, 19)
  const suffix = extra !== undefined
    ? ` | ${typeof extra === 'object' ? JSON.stringify(extra) : extra}`
    : ''
  console.log(`[WT ${time}] [${stage}] ${message}${suffix}`)
}

function mb(bytes) {
  return `${(Number(bytes) / 1024 / 1024).toFixed(2)} MB`
}

async function fetchWithRetry(url, { timeout = API_TIMEOUT, ...options } = {}, retries = API_RETRIES) {
  let lastError
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      if (attempt > 1) wtLog('RETRY', `Intento ${attempt}/${retries}`, url.slice(0, 120))
      const res = await fetch(url, {
        agent: httpsAgent,
        ...options,
        signal: AbortSignal.timeout(timeout)
      })
      return res
    } catch (e) {
      lastError = e
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 800 * attempt))
      }
    }
  }
  throw lastError
}

function normalizeApiUrl(url = '') {
  return String(url).replace(/^http:\/\//i, 'https://')
}

function isSkippableImage(url = '') {
  return /warning\.png|5es_warning/i.test(url)
}

export function trimText(text = '', max = 100) {
  const value = String(text).replace(/\s+/g, ' ').trim()
  if (!value || value === '-') return ''
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

export function parseSearchQuery(text = '') {
  let query = String(text).trim()
  let language = 'es'
  const langMatch = query.match(/^(.+?)\s+(en|es|fr|de|id|th|zh-hant|zh-hans)$/i)
  if (langMatch) {
    query = langMatch[1].trim()
    language = langMatch[2].toLowerCase()
  }
  return { query, language }
}

export function isWebtoonListUrl(text = '') {
  return /webtoons\.com\/\w+\/[^/]+\/[^/]+\/list\?title_no=\d+/i.test(text)
}

export function cleanPdfName(title = 'webtoon', suffix = '') {
  const base = String(title)
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 60) || 'webtoon'
  const extra = suffix ? `_${suffix}` : ''
  const name = `${base}${extra}`
  return name.toLowerCase().endsWith('.pdf') ? name : `${name}.pdf`
}

export async function searchWebtoons(query, language = 'es') {
  const url = `https://api.delirius.store/search/webtoons?query=${encodeURIComponent(query)}&language=${encodeURIComponent(language)}`
  const res = await fetch(url).then(r => r.json())
  if (!res?.status || !Array.isArray(res.data) || !res.data.length) {
    throw '[❗] No se encontraron webtoons para esa búsqueda.'
  }
  return res.data
}

export async function fetchWebtoonInfo(listUrl) {
  const started = Date.now()
  wtLog('INFO', 'Obteniendo datos del webtoon', listUrl)
  const api = `https://api.delirius.store/download/webtoon?url=${encodeURIComponent(listUrl)}`
  const res = await fetchWithRetry(api, { timeout: API_TIMEOUT })
  const json = await res.json()
  if (!json?.status || !json.data) {
    wtLog('INFO-ERR', 'Sin datos del webtoon')
    throw '[❗] No se pudo obtener la información del webtoon.'
  }
  const eps = Array.isArray(json.data.episodes) ? json.data.episodes.length : 0
  wtLog('INFO-OK', `${json.data.title || 'Webtoon'} | ${eps} capítulos | ${Date.now() - started}ms`)
  return json.data
}

export async function fetchEpisodeImageUrls(downloadUrl, meta = {}) {
  const started = Date.now()
  const apiUrl = normalizeApiUrl(downloadUrl)
  wtLog('WBDL', `Cap ${meta.chapter ?? '?'} — solicitando páginas`, meta.name || apiUrl.slice(0, 100))
  const res = await fetchWithRetry(apiUrl, { timeout: API_TIMEOUT })
  const json = await res.json()
  if (!json?.status || !Array.isArray(json.data) || !json.data.length) {
    wtLog('WBDL-ERR', `Cap ${meta.chapter ?? '?'} sin imágenes`)
    throw '[❗] No se encontraron páginas para este capítulo.'
  }
  const urls = json.data
    .map(normalizeApiUrl)
    .filter(url => !isSkippableImage(url))
  wtLog('WBDL-OK', `Cap ${meta.chapter ?? '?'} | ${urls.length} imgs | ${Date.now() - started}ms`)
  return urls
}

export function findEpisode(episodes = [], chapter) {
  const num = Number(chapter)
  if (!Number.isFinite(num)) return null
  return episodes.find(ep => Number(ep.chapter) === num) || null
}

function parseEpisodeNo(ep) {
  const source = String(ep?.url || ep?.download || '')
  const match = source.match(/episode_no=(\d+)/i)
  return match ? parseInt(match[1], 10) : Number(ep?.chapter) || 0
}

export function getOrderedEpisodes(episodes = []) {
  return [...episodes]
    .filter(ep => ep?.download)
    .sort((a, b) => {
      const order = parseEpisodeNo(a) - parseEpisodeNo(b)
      if (order !== 0) return order
      return Number(a.chapter) - Number(b.chapter)
    })
}

export function buildEpisodeListText(data, usedPrefix, command) {
  const episodes = getOrderedEpisodes(data.episodes)
  const shown = episodes.slice(-20).reverse()
  let text = `ִֶָ☾. 𝗪𝗲𝗯𝘁𝗼𝗼𝗻 ִֶָ☾.

 𓍯  *Título:* ${data.title || '—'}
 𓍯  *Género:* ${data.genre || '—'}
 𓍯  *Autor:* ${data.author || '—'}
 𓍯  *Vistas:* ${data.views || '—'}
 𓍯  *Capítulos:* ${episodes.length}
 𓍯  *Actualización:* ${data.update || '—'}

> *Sinopsis:* ${trimText(data.synopsis, 280) || '—'}

> *Últimos capítulos:*`

  shown.forEach(ep => {
    const free = ep.isFree ? 'Gratis' : 'Pago'
    text += `\n 𓍯  *Cap. ${ep.chapter}* — ${trimText(ep.name, 50)} (${free})`
  })

  text += `\n\n> Descargar *todos* en PDF:\n> ${usedPrefix + command} ${data.url || '<enlace>'}`
  return text.trim()
}

function isJpegBuffer(buf) {
  return Buffer.isBuffer(buf) && buf.length > 2 && buf[0] === 0xFF && buf[1] === 0xD8
}

function getJpegSize(buffer) {
  let offset = 2
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xFF) break
    const marker = buffer[offset + 1]
    if (marker === 0xC0 || marker === 0xC1 || marker === 0xC2 || marker === 0xC3) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7)
      }
    }
    const segmentLength = buffer.readUInt16BE(offset + 2)
    if (segmentLength < 2) break
    offset += 2 + segmentLength
  }
  return null
}

function chunkArray(list, size) {
  const chunks = []
  for (let i = 0; i < list.length; i += size) chunks.push(list.slice(i, i + size))
  return chunks
}

async function runPool(taskFns, concurrency) {
  const results = new Array(taskFns.length)
  let cursor = 0

  async function worker() {
    while (cursor < taskFns.length) {
      const index = cursor++
      results[index] = await taskFns[index]()
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, taskFns.length) }, worker))
  return results
}

async function fetchRawBuffer(imageUrl) {
  const res = await fetch(normalizeApiUrl(imageUrl), {
    agent: httpsAgent,
    signal: AbortSignal.timeout(IMAGE_TIMEOUT)
  })
  if (!res.ok) return null
  return Buffer.from(await res.arrayBuffer())
}

async function prepareRaster(raw) {
  if (!raw?.length) return null

  if (isJpegBuffer(raw)) {
    const size = getJpegSize(raw)
    if (!size?.width || !size?.height) return null
    if (size.width <= MAX_IMAGE_WIDTH) {
      return { raster: raw, width: size.width, height: size.height }
    }
    const { data, info } = await sharp(raw, { failOn: 'none', sequentialRead: true })
      .resize({ width: MAX_IMAGE_WIDTH, withoutEnlargement: true, fastShrinkOnLoad: true })
      .jpeg({ quality: JPEG_QUALITY, progressive: false, mozjpeg: false })
      .toBuffer({ resolveWithObject: true })
    return { raster: data, width: info.width, height: info.height }
  }

  const { data, info } = await sharp(raw, { failOn: 'none' })
    .jpeg({ quality: JPEG_QUALITY, progressive: false, mozjpeg: false })
    .toBuffer({ resolveWithObject: true })
  return { raster: data, width: info.width, height: info.height }
}

async function embedRaster(pdfDoc, raster, width, height) {
  const image = await pdfDoc.embedJpg(raster)
  const page = pdfDoc.addPage([width, height])
  page.drawImage(image, { x: 0, y: 0, width, height })
}

async function buildChunkPdf(urls, chunkNo) {
  const started = Date.now()
  wtLog('CHUNK', `#${chunkNo} | descargando ${urls.length} imgs en paralelo`)

  const raws = await Promise.all(urls.map(url => fetchRawBuffer(url).catch(() => null)))
  const pdfDoc = await PDFDocument.create()
  let added = 0

  for (const raw of raws) {
    if (!raw) continue
    const item = await prepareRaster(raw).catch(() => null)
    if (!item) continue
    try {
      await embedRaster(pdfDoc, item.raster, item.width, item.height)
      added++
    } catch {}
  }

  if (!added) return null

  const bytes = Buffer.from(await pdfDoc.save({ useObjectStreams: true }))
  wtLog('CHUNK-OK', `#${chunkNo} | ${added} pgs | ${mb(bytes)} | ${Date.now() - started}ms`)
  return { pdfBytes: bytes, pageCount: added }
}

async function mergePdfChunks(chunks) {
  const merged = await PDFDocument.create()
  let pages = 0

  for (const chunk of chunks) {
    if (!chunk?.pdfBytes) continue
    const doc = await PDFDocument.load(chunk.pdfBytes, { ignoreEncryption: true })
    const copied = await merged.copyPages(doc, doc.getPageIndices())
    copied.forEach(page => merged.addPage(page))
    pages += copied.length
  }

  const pdfBytes = Buffer.from(await merged.save({ useObjectStreams: true }))
  return { pdfBytes, pageCount: pages }
}

async function splitPdfForSend(pdfBytes, chapters, pageCount) {
  if (pdfBytes.length <= WA_MAX_BYTES) {
    return [{ pdfBytes, pageCount, chapters }]
  }

  wtLog('SPLIT', `PDF ${mb(pdfBytes)} > límite WA, dividiendo...`)
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })
  const total = doc.getPageCount()
  const parts = []

  for (let start = 0; start < total; start += MAX_PAGES_PER_PART) {
    const end = Math.min(start + MAX_PAGES_PER_PART, total)
    const partDoc = await PDFDocument.create()
    const indices = Array.from({ length: end - start }, (_, i) => start + i)
    const copied = await partDoc.copyPages(doc, indices)
    copied.forEach(page => partDoc.addPage(page))
    parts.push({
      pdfBytes: Buffer.from(await partDoc.save({ useObjectStreams: true })),
      pageCount: copied.length,
      chapters
    })
  }

  return parts
}

async function collectAllImageUrls(ordered, onProgress) {
  const allUrls = []
  wtLog('WBDL-ALL', `Obteniendo listas wbdl | ${ordered.length} caps | paralelo ${PARALLEL_WBDL}`)

  for (let i = 0; i < ordered.length; i += PARALLEL_WBDL) {
    const group = ordered.slice(i, i + PARALLEL_WBDL)
    const lists = await Promise.all(group.map(ep =>
      fetchEpisodeImageUrls(ep.download, { chapter: ep.chapter, name: ep.name }).catch(() => [])
    ))

    group.forEach((ep, j) => {
      const urls = lists[j]
      allUrls.push(...urls)
      onProgress?.(i + j + 1, ordered.length, ep, allUrls.length, urls.length)
    })
  }

  wtLog('WBDL-ALL-OK', `Total ${allUrls.length} imágenes listadas`)
  return allUrls
}

export async function buildFullWebtoonPdf(episodes = [], onProgress, title = 'Webtoon') {
  const ordered = getOrderedEpisodes(episodes)
  if (!ordered.length) {
    throw new Error('No hay capítulos disponibles para descargar.')
  }

  const globalStart = Date.now()
  const chapterNums = ordered.map(ep => ep.chapter)
  wtLog('START', `"${title}" | ${ordered.length} caps | bloques ${CHUNK_SIZE} | paralelo x${PARALLEL_CHUNKS}`)

  const allUrls = await collectAllImageUrls(ordered, onProgress)
  if (!allUrls.length) {
    throw new Error('No se encontraron imágenes para descargar.')
  }

  const urlChunks = chunkArray(allUrls, CHUNK_SIZE)
  wtLog('PLAN', `${allUrls.length} imgs → ${urlChunks.length} bloques de hasta ${CHUNK_SIZE}`)

  const chunkResults = await runPool(
    urlChunks.map((urls, index) => () => buildChunkPdf(urls, index + 1)),
    PARALLEL_CHUNKS
  )

  const validChunks = chunkResults.filter(Boolean)
  if (!validChunks.length) {
    throw new Error('No se pudieron procesar las páginas del webtoon.')
  }

  const totalChunkPages = validChunks.reduce((n, c) => n + c.pageCount, 0)
  wtLog('MERGE', `Uniendo ${validChunks.length} bloques | ~${totalChunkPages} páginas`)

  const merged = await mergePdfChunks(validChunks)
  wtLog('MERGE-OK', `PDF unificado | ${merged.pageCount} pgs | ${mb(merged.pdfBytes)}`)

  const sendParts = await splitPdfForSend(merged.pdfBytes, chapterNums, merged.pageCount)

  const parts = sendParts.map(part => ({
    pdfBytes: part.pdfBytes,
    pageCount: part.pageCount,
    chapters: part.chapters
  }))

  wtLog(
    'DONE',
    `"${title}" | ${parts.length} archivo(s) | ${merged.pageCount} pgs | ${ordered.length} caps | ${((Date.now() - globalStart) / 1000).toFixed(1)}s`
  )

  return {
    parts,
    pageCount: merged.pageCount,
    chapterCount: ordered.length,
    totalChapters: ordered.length
  }
}
