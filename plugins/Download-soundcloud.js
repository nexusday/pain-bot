import fetch from 'node-fetch'

const API_BASE = () => (global.APIs?.delirius?.url || 'https://api.delirius.online').replace(/\/$/, '')
const RESULTS_LIMIT = 8

function trimText(text = '', max = 100) {
  const value = String(text).replace(/\s+/g, ' ').trim()
  if (!value || value === '-') return ''
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

function formatDuration(ms) {
  if (!ms || ms <= 0) return '--:--'
  const sec = Math.floor(Number(ms) / 1000)
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function cleanFileName(title = 'audio') {
  return String(title)
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 80) || 'soundcloud'
}

function artistOf(item = {}) {
  return (
    trimText(item.artist, 50) ||
    trimText(item.author, 50) ||
    trimText(item.label_name, 40) ||
    'SoundCloud'
  )
}

function trackLink(item = {}) {
  return item.link || item.url || item.permalink_url || ''
}


function buildQueryVariants(query) {
  const q = String(query || '').replace(/\s+/g, ' ').trim()
  if (!q) return []
  const words = q.split(' ')
  const variants = [q]

  for (let i = words.length - 1; i >= 2; i--) {
    variants.push(words.slice(0, i).join(' '))
  }
  if (words.length >= 2) variants.push(words.slice(-2).join(' '))
  if (words.length >= 3) variants.push(words.slice(0, 3).join(' '))
  if (words.length >= 1) variants.push(words[words.length - 1])

  return [...new Set(variants.filter(Boolean))]
}

async function apiJson(pathWithQuery) {
  const url = `${API_BASE()}${pathWithQuery}`
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) PainBot/1.0'
    }
  })
  const raw = await res.text()
  let json
  try {
    json = JSON.parse(raw)
  } catch {
    throw `[❗] La API de SoundCloud no devolvió JSON válido (${res.status}).\n> ${url}`
  }
  if (!res.ok) {
    throw `[❗] Error API SoundCloud (${res.status}).`
  }
  return json
}

async function searchOnce(query) {
  const sres = await apiJson(`/search/soundcloud?q=${encodeURIComponent(query)}`)
  const list = Array.isArray(sres?.data) ? sres.data : []
  return list
    .map(item => ({ ...item, link: trackLink(item) }))
    .filter(t => t.link)
}

async function searchTracks(query, limit = RESULTS_LIMIT) {
  const variants = buildQueryVariants(query)
  let lastCount = 0

  for (const q of variants) {
    const list = await searchOnce(q)
    lastCount = list.length
    if (list.length) {
      console.log(`[sc] search ok q="${q}" (orig="${query}") n=${list.length}`)
      return list.slice(0, limit)
    }
  }

  throw (
    `[❗] No se encontraron resultados en SoundCloud.\n` +
    `> Búsqueda: *${query}*\n` +
    `> Prueba con menos palabras o corrige el nombre.\n` +
    `> Ej: *como me encanta* / *kevin kaarl*`
  )
}

async function downloadTrack(scUrl) {
  const dres = await apiJson(`/download/soundcloud?url=${encodeURIComponent(scUrl)}`)
  if (!dres?.status || !dres.data) {
    throw '[❗] No se pudo descargar el audio de SoundCloud.'
  }
  if (!dres.data.download) throw '[❗] No se encontró el enlace MP3.'
  return dres.data
}

async function fetchBuffer(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) PainBot/1.0' }
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

function rememberSearch(sender, query, results) {
  if (!global.lastScSearch) global.lastScSearch = {}
  global.lastScSearch[sender] = {
    query,
    results: results.map(r => ({
      title: r.title,
      link: r.link,
      image: r.image,
      artist: artistOf(r),
      duration: r.duration,
      play: r.play
    })),
    at: Date.now()
  }
}

const handler = async (m, { conn, text, usedPrefix, command }) => {
  try {
    if (!text?.trim()) {
      return conn.sendMessage(m.chat, {
        text:
          `ִֶָ☾. Ingresa búsqueda, enlace o número.\n\n` +
          `> ${usedPrefix + command} <búsqueda>\n` +
          `> ${usedPrefix + command} <enlace>\n` +
          `> ${usedPrefix + command} <número>\n\n` +
          `> Lista: *${usedPrefix}scsearch <texto>*\n` +
          `> *Ejemplo:*\n${usedPrefix + command} como me encanta`,
        contextInfo: { ...rcanal?.contextInfo }
      }, { quoted: m })
    }

    const input = text.trim()
    let scLink = null
    let preview = null

    const isUrl = /soundcloud\.com/i.test(input)

    if (isUrl) {
      scLink = input.split(/\s+/)[0]
    } else if (/^\d+$/.test(input)) {
      const idx = parseInt(input, 10) - 1
      const cache = global.lastScSearch?.[m.sender]
      if (!cache?.results?.length || Date.now() - cache.at > 10 * 60 * 1000) {
        throw `[❗] No hay búsqueda reciente. Usa primero *${usedPrefix}scsearch <texto>* o *${usedPrefix}sc <búsqueda>*.`
      }
      if (idx < 0 || idx >= cache.results.length) {
        throw `[❗] Elige un número del 1 al ${cache.results.length}.`
      }
      scLink = cache.results[idx].link
      preview = cache.results[idx]
    } else {
      await conn.sendMessage(m.chat, { react: { text: '', key: m.key } }).catch(() => {})
      const results = await searchTracks(input)
      rememberSearch(m.sender, input, results)
      const first = results[0]
      scLink = first.link
      preview = first
    }

    await conn.sendMessage(m.chat, { react: { text: '', key: m.key } }).catch(() => {})
    await conn.sendPresenceUpdate('composing', m.chat).catch(() => {})

    const data = await downloadTrack(scLink)
    const title = data.title || preview?.title || 'SoundCloud'
    const author = trimText(data.author, 50) || artistOf(preview || {}) || 'SoundCloud'
    const cover = data.image || preview?.image
    const duration = formatDuration(data.duration)
    const isPreview = Number(data.duration) > 0 && Number(data.duration) <= 35000

    const info =
      `ִֶָ☾. 𝗦𝗼𝘂𝗻𝗱𝗖𝗹𝗼𝘂𝗱 ִֶָ☾.\n` +
      ` 𓍯  *Título:* ${trimText(title, 90)}\n` +
      ` 𓍯  *Autor:* ${author}\n` +
      ` 𓍯  *Duración:* ${duration}${isPreview ? ' _(preview)_' : ''}\n` +
      ` 𓍯  *Reproducciones:* ${data.playbacks ?? preview?.play ?? '—'}\n` +
      ` 𓍯  *Enlace:* ${data.link || scLink}`

    if (cover) {
      try {
        const thumb = await fetchBuffer(cover)
        await conn.sendMessage(
          m.chat,
          { image: thumb, caption: info, contextInfo: { ...rcanal?.contextInfo } },
          { quoted: m }
        )
      } catch {
        await conn.sendMessage(
          m.chat,
          { text: info, contextInfo: { ...rcanal?.contextInfo } },
          { quoted: m }
        )
      }
    } else {
      await conn.sendMessage(
        m.chat,
        { text: info, contextInfo: { ...rcanal?.contextInfo } },
        { quoted: m }
      )
    }

    const audio = await fetchBuffer(data.download)
    await conn.sendMessage(
      m.chat,
      {
        audio,
        fileName: `${cleanFileName(title)}.mp3`,
        mimetype: 'audio/mpeg'
      },
      { quoted: m }
    )

    await conn.sendMessage(m.chat, { react: { text: '', key: m.key } }).catch(() => {})
    await conn.sendPresenceUpdate('paused', m.chat).catch(() => {})
  } catch (e) {
    console.error('Error en soundcloud download:', e)
    await conn.sendMessage(m.chat, { react: { text: '', key: m.key } }).catch(() => {})
    return conn.sendMessage(m.chat, {
      text:
        typeof e === 'string'
          ? e
          : `[❌] Se ha producido un problema.\n> Usa *${usedPrefix}report* para informarlo.\n\n${e.message}`,
      contextInfo: { ...rcanal?.contextInfo }
    }, { quoted: m })
  }
}

handler.help = ['sc <búsqueda/url/número>', 'soundcloud <búsqueda>']
handler.tags = ['descargas']
handler.command = ['sc', 'soundcloud', 'scdl', 'scloud']
handler.group = true

export default handler
