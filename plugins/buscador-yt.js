import fetch from 'node-fetch'

const RESULTS_LIMIT = 5

function trimText(text = '', max = 100) {
  const value = String(text).replace(/\s+/g, ' ').trim()
  if (!value || value === '-') return ''
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

function formatViews(n) {
  const v = Number(n) || 0
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`
  return String(v || '—')
}

const handler = async (m, { conn, text, usedPrefix, command }) => {
  try {
    if (!text?.trim()) {
      return conn.sendMessage(m.chat, {
        text: `ִֶָ☾. Ingresa qué buscar en YouTube.\n\n> *Ejemplo:*\n${usedPrefix + command} Twice`,
        contextInfo: { ...rcanal?.contextInfo }
      }, { quoted: m })
    }

    const query = text.trim()
    const searchUrl = `https://api.delirius.store/search/ytsearch?q=${encodeURIComponent(query)}`
    const sres = await fetch(searchUrl).then(r => r.json())

    if (!sres?.status || !Array.isArray(sres.data) || !sres.data.length) {
      throw '[❗] No se encontraron resultados para tu búsqueda.'
    }

    const results = sres.data.slice(0, RESULTS_LIMIT)

    let list = `ִֶָ☾. 𝗬𝗼𝘂𝗧𝘂𝗯𝗲 ִֶָ☾.\n\n> *Búsqueda:* ${query}\n> *Encontrados:* ${results.length}\n\n`
    results.forEach((item, i) => {
      const channel = trimText(item.author?.name, 40) || 'YouTube'
      list += `*${i + 1}.* ${trimText(item.title, 70)}\n`
      list += ` 𓍯  *Canal:* ${channel}\n`
      list += ` 𓍯  *Duración:* ${item.duration || '—'}\n`
      list += ` 𓍯  *Vistas:* ${formatViews(item.views)}\n`
      list += ` 𓍯  *Publicado:* ${item.publishedAt || '—'}\n`
      list += ` 𓍯  *Enlace:* ${item.url}\n\n`
    })
    list += `> Descargar video:\n> ${usedPrefix}video <número>\n> ${usedPrefix}video <enlace>\n> ${usedPrefix}play <número>`

    await conn.sendMessage(m.chat, {
      text: list.trim(),
      contextInfo: { ...rcanal?.contextInfo }
    }, { quoted: m })

    if (!global.lastYtSearch) global.lastYtSearch = {}
    global.lastYtSearch[m.sender] = {
      query,
      results: results.map(r => ({
        title: r.title,
        url: r.url || `https://youtu.be/${r.videoId}`,
        image: r.image || r.thumbnail,
        duration: r.duration,
        views: r.views,
        author: r.author?.name
      })),
      at: Date.now()
    }

    for (let i = 0; i < results.length; i++) {
      const item = results[i]
      const channel = trimText(item.author?.name, 40) || 'YouTube'
      const caption = `*${i + 1}.* ${trimText(item.title, 90)}
 𓍯  *Canal:* ${channel}
 𓍯  *Duración:* ${item.duration || '—'}
 𓍯  *Vistas:* ${formatViews(item.views)}
 𓍯  *Enlace:* ${item.url}

> ${usedPrefix}video ${i + 1}`

      const thumb = item.image || item.thumbnail
      if (thumb) {
        try {
          const image = (await conn.getFile(thumb)).data
          await conn.sendMessage(m.chat, {
            image,
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
    console.error('Error en búsqueda YouTube:', e)
    return conn.sendMessage(m.chat, {
      text: typeof e === 'string' ? e : `[❗] Ocurrió un error al buscar en YouTube.\n\n${e.message}`,
      contextInfo: { ...rcanal?.contextInfo }
    }, { quoted: m })
  }
}

handler.help = ['yt <búsqueda> → 5 resultados de YouTube']
handler.command = ['yt', 'youtube', 'ytsearch']
handler.tags = ['descargas', 'busqueda']

export default handler
