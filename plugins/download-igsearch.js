import fetch from 'node-fetch'

const RESULTS_LIMIT = 4

function trimText(text = '', max = 120) {
  const value = String(text).replace(/\s+/g, ' ').trim()
  if (!value) return ''
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

const handler = async (m, { conn, text, usedPrefix, command }) => {
  try {
    if (!text?.trim()) {
      return conn.sendMessage(m.chat, {
        text: `[❗] Ingresa un texto para buscar reels de Instagram.\n\n> *Ejemplo:*\n${usedPrefix + command} its you`,
        contextInfo: { ...rcanal?.contextInfo }
      }, { quoted: m })
    }

    const query = text.trim()

   

    const searchUrl = `https://api.delirius.store/search/instagramreels?query=${encodeURIComponent(query)}&language=es`
    const sres = await fetch(searchUrl).then(r => r.json())

    if (!sres?.status || !Array.isArray(sres.data) || !sres.data.length) {
      throw '[❗] No se encontraron reels para esa búsqueda.'
    }

    const results = sres.data.slice(0, RESULTS_LIMIT)

    let list = `*Resultados de Instagram*\n\n> *Búsqueda:* ${query}\n> *Encontrados:* ${results.length}\n\n`
    results.forEach((item, i) => {
      list += `*${i + 1}.* ${trimText(item.title, 80)}\n> ${item.url}\n\n`
    })
    list += `> Para descargar usa:\n> ${usedPrefix}ig <enlace>`

    await conn.sendMessage(m.chat, {
      text: list.trim(),
      contextInfo: { ...rcanal?.contextInfo }
    }, { quoted: m })

    for (let i = 0; i < results.length; i++) {
      const item = results[i]
      const caption = `*${i + 1}.* ${trimText(item.title, 100)}\n\n${trimText(item.description, 160)}\n\n> ${item.url}\n\n> Descargar: ${usedPrefix}ig ${item.url}`

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
    console.error('Error en igsearch:', e)
    return conn.sendMessage(m.chat, {
      text: typeof e === 'string'
        ? e
        : `[❗] Error al buscar reels.\n\n${e.message}`,
      contextInfo: { ...rcanal?.contextInfo }
    }, { quoted: m })
  }
}

handler.help = ['igsearch <búsqueda>', 'igs <búsqueda>']
handler.tags = ['downloader']
handler.command = ['igsearch', 'igs', 'igbuscar']
handler.group = true

export default handler
