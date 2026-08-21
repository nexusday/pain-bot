import fetch from 'node-fetch'

const API_BASE = () => (global.APIs?.delirius?.url || 'https://api.delirius.online').replace(/\/$/, '')
const RESULTS_LIMIT = 5

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

function formatPlays(n) {
  const v = Number(n) || 0
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`
  return String(v)
}

function artistOf(item = {}) {
  return (
    trimText(item.artist, 40) ||
    trimText(item.author, 40) ||
    trimText(item.genre, 30) ||
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

async function searchOnce(query) {
  const searchUrl = `${API_BASE()}/search/soundcloud?q=${encodeURIComponent(query)}`
  const res = await fetch(searchUrl, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) PainBot/1.0'
    }
  })
  const raw = await res.text()
  let sres
  try {
    sres = JSON.parse(raw)
  } catch {
    throw `[❗] La API de búsqueda no devolvió JSON válido (${res.status}).`
  }
  if (!res.ok) throw `[❗] Error API SoundCloud (${res.status}).`
  const list = Array.isArray(sres?.data) ? sres.data : []
  return list
    .map(item => ({ ...item, link: trackLink(item) }))
    .filter(t => t.link)
}

async function searchSoundCloud(query) {
  for (const q of buildQueryVariants(query)) {
    const list = await searchOnce(q)
    if (list.length) {
      console.log(`[scsearch] ok q="${q}" (orig="${query}") n=${list.length}`)
      return { queryUsed: q, results: list }
    }
  }
  throw (
    `[❗] No se encontraron resultados en SoundCloud.\n` +
    `> Búsqueda: *${query}*\n` +
    `> Prueba con menos palabras o corrige el nombre.`
  )
}

const handler = async (m, { conn, text, usedPrefix, command }) => {
  try {
    if (!text?.trim()) {
      return conn.sendMessage(m.chat, {
        text: `ִֶָ☾. Ingresa el nombre de la canción.\n\n> *Ejemplo:*\n${usedPrefix + command} como me encanta`,
        contextInfo: { ...rcanal?.contextInfo }
      }, { quoted: m })
    }

    const query = text.trim()
    await conn.sendMessage(m.chat, { react: { text: '', key: m.key } }).catch(() => {})

    const { queryUsed, results: found } = await searchSoundCloud(query)
    const results = found.slice(0, RESULTS_LIMIT)

    if (!global.lastScSearch) global.lastScSearch = {}
    global.lastScSearch[m.sender] = {
      query: queryUsed,
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

    let list =
      `ִֶָ☾. 𝗦𝗼𝘂𝗻𝗱𝗖𝗹𝗼𝘂𝗱 ִֶָ☾.\n\n` +
      `> *Búsqueda:* ${query}\n` +
      (queryUsed !== query ? `> *Usado:* ${queryUsed}\n` : '') +
      `> *Encontrados:* ${results.length}\n\n`

    results.forEach((item, i) => {
      list += `*${i + 1}.* ${trimText(item.title, 70)}\n`
      list += ` 𓍯  *Artista:* ${artistOf(item)}\n`
      list += ` 𓍯  *Duración:* ${formatDuration(item.duration)}\n`
      list += ` 𓍯  *Reproducciones:* ${formatPlays(item.play)}\n`
      list += ` 𓍯  *Enlace:* ${item.link}\n\n`
    })
    list += `> Descargar:\n> ${usedPrefix}sc <número>\n> ${usedPrefix}sc <enlace>`

    const firstCover = results.find(r => r.image)?.image
    if (firstCover) {
      try {
        const imgRes = await fetch(firstCover)
        if (imgRes.ok) {
          const thumb = Buffer.from(await imgRes.arrayBuffer())
          await conn.sendMessage(
            m.chat,
            { image: thumb, caption: list.trim(), contextInfo: { ...rcanal?.contextInfo } },
            { quoted: m }
          )
          await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {})
          return
        }
      } catch {}
    }

    await conn.sendMessage(
      m.chat,
      { text: list.trim(), contextInfo: { ...rcanal?.contextInfo } },
      { quoted: m }
    )
    await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {})
  } catch (e) {
    console.error('Error en scsearch:', e)
    await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {})
    return conn.sendMessage(m.chat, {
      text: typeof e === 'string' ? e : `[❗] Error al buscar en SoundCloud.\n\n${e.message}`,
      contextInfo: { ...rcanal?.contextInfo }
    }, { quoted: m })
  }
}

handler.help = ['scsearch <búsqueda>', 'scs <búsqueda>']
handler.tags = ['descargas']
handler.command = ['scsearch', 'scs', 'soundcloudsearch']
handler.group = true

export default handler
