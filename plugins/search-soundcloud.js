import fetch from 'node-fetch'

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

const handler = async (m, { conn, text, usedPrefix, command }) => {
  try {
    if (!text?.trim()) {
      return conn.sendMessage(m.chat, {
        text: `ִֶָ☾. Ingresa el nombre de la canción.\n\n> *Ejemplo:*\n${usedPrefix + command} lo que construimos`,
        contextInfo: { ...rcanal?.contextInfo }
      }, { quoted: m })
    }

    const query = text.trim()
    const searchUrl = `https://api.delirius.store/search/soundcloud?q=${encodeURIComponent(query)}`
    const sres = await fetch(searchUrl).then(r => r.json())

    if (!sres?.status || !Array.isArray(sres.data) || !sres.data.length) {
      throw '[❗] No se encontraron resultados en SoundCloud.'
    }

    const results = sres.data.slice(0, RESULTS_LIMIT)

    let list = `ִֶָ☾. 𝗦𝗼𝘂𝗻𝗱𝗖𝗹𝗼𝘂𝗱 ִֶָ☾.\n\n> *Búsqueda:* ${query}\n> *Encontrados:* ${results.length}\n\n`
    results.forEach((item, i) => {
      const artist = trimText(item.artist, 40) || trimText(item.genre, 30) || 'SoundCloud'
      list += `*${i + 1}.* ${trimText(item.title, 70)}\n`
      list += ` 𓍯  *Artista:* ${artist}\n`
      list += ` 𓍯  *Duración:* ${formatDuration(item.duration)}\n`
      list += ` 𓍯  *Reproducciones:* ${formatPlays(item.play)}\n`
      list += ` 𓍯  *Enlace:* ${item.link}\n\n`
    })
    list += `> Descargar:\n> ${usedPrefix}sc <número>\n> ${usedPrefix}sc <enlace>`

    await conn.sendMessage(m.chat, {
      text: list.trim(),
      contextInfo: { ...rcanal?.contextInfo }
    }, { quoted: m })

    if (!global.lastScSearch) global.lastScSearch = {}
    global.lastScSearch[m.sender] = {
      query,
      results: results.map(r => ({ title: r.title, link: r.link, image: r.image })),
      at: Date.now()
    }

    for (let i = 0; i < results.length; i++) {
      const item = results[i]
      const artist = trimText(item.artist, 40) || 'SoundCloud'
      const caption = `*${i + 1}.* ${trimText(item.title, 90)}
 𓍯  *Artista:* ${artist}
 𓍯  *Duración:* ${formatDuration(item.duration)}
 𓍯  *Likes:* ${item.likes || 0}
 𓍯  *Reproducciones:* ${formatPlays(item.play)}
 𓍯  *Enlace:* ${item.link}

> ${usedPrefix}sc ${i + 1}`

      if (item.image) {
        try {
          const thumb = (await conn.getFile(item.image)).data
          await conn.sendMessage(m.chat, {
            image: thumb,
            caption,
            contextInfo: { ...rcanal?.contextInfo }
          }, { quoted: m })
          continue
        } catch {}
      }

      await conn.sendMessage(m.chat, {
        text: caption,
        contextInfo: { ...rcanal?.contextInfo }
      }, { quoted: m })
    }
  } catch (e) {
    console.error('Error en scsearch:', e)
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
