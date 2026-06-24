import {
  trimText,
  parseSearchQuery,
  searchWebtoons
} from '../lib/webtoon-utils.js'

const RESULTS_LIMIT = 5

const handler = async (m, { conn, text, usedPrefix, command }) => {
  try {
    if (!text?.trim()) {
      return conn.sendMessage(m.chat, {
        text: `ִֶָ☾. Ingresa el nombre del webtoon.\n\n> *Ejemplo:*\n${usedPrefix + command} cry\n${usedPrefix + command} cry en`,
        contextInfo: { ...rcanal?.contextInfo }
      }, { quoted: m })
    }

    const { query, language } = parseSearchQuery(text)
    if (!query) throw '[❗] Debes ingresar un término de búsqueda.'

    const results = (await searchWebtoons(query, language)).slice(0, RESULTS_LIMIT)

    let list = `ִֶָ☾. 𝗪𝗲𝗯𝘁𝗼𝗼𝗻𝘀 ִֶָ☾.\n\n> *Búsqueda:* ${query}\n> *Idioma:* ${language}\n> *Encontrados:* ${results.length}\n\n`

    results.forEach((item, i) => {
      const authors = Array.isArray(item.authors) ? item.authors.join(', ') : '—'
      list += `*${i + 1}.* ${trimText(item.title, 70)}\n`
      list += ` 𓍯  *Tipo:* ${item.type || 'WEBTOON'}\n`
      list += ` 𓍯  *Autor(es):* ${trimText(authors, 60)}\n`
      list += ` 𓍯  *Vistas:* ${item.views || '—'}\n`
      list += ` 𓍯  *Enlace:* ${item.url}\n\n`
    })

    list += `> Descargar todo en un PDF:\n> ${usedPrefix}wt <número>\n> ${usedPrefix}wt <enlace>`

    await conn.sendMessage(m.chat, {
      text: list.trim(),
      contextInfo: { ...rcanal?.contextInfo }
    }, { quoted: m })

    if (!global.lastWtSearch) global.lastWtSearch = {}
    global.lastWtSearch[m.sender] = {
      query,
      language,
      results: results.map(r => ({
        title: r.title,
        url: r.url,
        image: r.image,
        authors: r.authors,
        views: r.views,
        type: r.type
      })),
      at: Date.now()
    }

    for (let i = 0; i < results.length; i++) {
      const item = results[i]
      const authors = Array.isArray(item.authors) ? item.authors.join(', ') : '—'
      const caption = `*${i + 1}.* ${trimText(item.title, 90)}
 𓍯  *Autor(es):* ${trimText(authors, 60)}
 𓍯  *Vistas:* ${item.views || '—'}
 𓍯  *Enlace:* ${item.url}

> ${usedPrefix}wt ${i + 1}`

      if (item.image) {
        try {
          const image = (await conn.getFile(item.image)).data
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
    console.error('Error en wtsearch:', e)
    return conn.sendMessage(m.chat, {
      text: typeof e === 'string' ? e : `[❗] Error al buscar webtoons.\n\n${e.message}`,
      contextInfo: { ...rcanal?.contextInfo }
    }, { quoted: m })
  }
}

handler.help = ['wtsearch <nombre> [en|es] → Buscar webtoons']
handler.tags = ['descargas', 'busqueda']
handler.command = ['wtsearch', 'webtoonsearch', 'buscarwt', 'wtbuscar']

export default handler
