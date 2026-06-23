import fetch from 'node-fetch'

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

async function searchFirst(query) {
  const searchUrl = `https://api.delirius.store/search/soundcloud?q=${encodeURIComponent(query)}`
  const sres = await fetch(searchUrl).then(r => r.json())
  if (!sres?.status || !Array.isArray(sres.data) || !sres.data.length) {
    throw '[❗] No se encontraron resultados en SoundCloud.'
  }
  return sres.data[0]
}

async function downloadTrack(scUrl) {
  const api = `https://api.delirius.store/download/soundcloud?url=${encodeURIComponent(scUrl)}`
  const dres = await fetch(api).then(r => r.json())
  if (!dres?.status || !dres.data) {
    throw '[❗] No se pudo descargar el audio de SoundCloud.'
  }
  const audioUrl = dres.data.download
  if (!audioUrl) throw '[❗] No se encontró el enlace MP3.'
  return dres.data
}

const handler = async (m, { conn, text, usedPrefix, command }) => {
  try {
    if (!text?.trim()) {
      return conn.sendMessage(m.chat, {
        text: `ִֶָ☾. Ingresa búsqueda, enlace o número.\n\n> ${usedPrefix + command} <búsqueda>\n> ${usedPrefix + command} <enlace>\n> ${usedPrefix + command} <número>\n\n> *Ejemplo:*\n${usedPrefix + command} lo que construimos`,
        contextInfo: { ...rcanal?.contextInfo }
      }, { quoted: m })
    }

    let input = text.trim()
    let scLink = null
    let preview = null

    const isUrl = /soundcloud\.com/i.test(input)

    if (isUrl) {
      scLink = input
    } else if (/^\d+$/.test(input)) {
      const idx = parseInt(input, 10) - 1
      const cache = global.lastScSearch?.[m.sender]
      if (!cache?.results?.length || Date.now() - cache.at > 10 * 60 * 1000) {
        throw `[❗] No hay búsqueda reciente. Usa primero *${usedPrefix}scsearch <texto>*`
      }
      if (idx < 0 || idx >= cache.results.length) {
        throw `[❗] Elige un número del 1 al ${cache.results.length}.`
      }
      scLink = cache.results[idx].link
      preview = cache.results[idx]
    } else {
      const first = await searchFirst(input)
      scLink = first.link
      preview = first
    }

    await conn.sendPresenceUpdate('composing', m.chat).catch(() => {})

    const data = await downloadTrack(scLink)
    const title = data.title || preview?.title || 'SoundCloud'
    const author = trimText(data.author, 50) || trimText(preview?.artist, 50) || 'SoundCloud'
    const cover = data.image || preview?.image
    const duration = formatDuration(data.duration)

    const info = `ִֶָ☾. 𝗦𝗼𝘂𝗻𝗱𝗖𝗹𝗼𝘂𝗱 ִֶָ☾.
 𓍯  *Título:* ${trimText(title, 90)}
 𓍯  *Autor:* ${author}
 𓍯  *Duración:* ${duration}
 𓍯  *Reproducciones:* ${data.playbacks ?? '—'}
 𓍯  *Enlace:* ${data.link || scLink}`

    if (cover) {
      try {
        const thumb = (await conn.getFile(cover)).data
        await conn.sendMessage(m.chat, {
          image: thumb,
          caption: info,
          contextInfo: { ...rcanal?.contextInfo }
        }, { quoted: m })
      } catch {
        await conn.sendMessage(m.chat, {
          text: info,
          contextInfo: { ...rcanal?.contextInfo }
        }, { quoted: m })
      }
    } else {
      await conn.sendMessage(m.chat, {
        text: info,
        contextInfo: { ...rcanal?.contextInfo }
      }, { quoted: m })
    }

    await conn.sendMessage(m.chat, {
      audio: { url: data.download },
      fileName: `${cleanFileName(title)}.mp3`,
      mimetype: 'audio/mpeg'
    }, { quoted: m })

    await conn.sendPresenceUpdate('paused', m.chat).catch(() => {})
  } catch (e) {
    console.error('Error en soundcloud download:', e)
    return conn.sendMessage(m.chat, {
      text: typeof e === 'string'
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
