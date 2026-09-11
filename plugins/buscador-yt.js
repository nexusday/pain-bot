import fetch from 'node-fetch'

const LIMITE_RESULTADOS = 5

function recortarTexto(text = '', max = 100) {
  const valor = String(text).replace(/\s+/g, ' ').trim()
  if (!valor || valor === '-') return ''
  return valor.length > max ? `${valor.slice(0, max - 1)}…` : valor
}

function formatearVistas(n) {
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

    const consulta = text.trim()
    const urlBusqueda = `https://api.delirius.online/search/ytsearch?q=${encodeURIComponent(consulta)}`
    const resBusqueda = await fetch(urlBusqueda).then(r => r.json())

    if (!resBusqueda?.status || !Array.isArray(resBusqueda.data) || !resBusqueda.data.length) {
      throw '[❗] No se encontraron resultados para tu búsqueda.'
    }

    const resultados = resBusqueda.data.slice(0, LIMITE_RESULTADOS)

    let lista = `ִֶָ☾. 𝗬𝗼𝘂𝗧𝘂𝗯𝗲 ִֶָ☾.\n\n> *Búsqueda:* ${consulta}\n> *Encontrados:* ${resultados.length}\n\n`
    resultados.forEach((elemento, i) => {
      const canal = recortarTexto(elemento.author?.name, 40) || 'YouTube'
      lista += `*${i + 1}.* ${recortarTexto(elemento.title, 70)}\n`
      lista += ` 𓍯  *Canal:* ${canal}\n`
      lista += ` 𓍯  *Duración:* ${elemento.duration || '—'}\n`
      lista += ` 𓍯  *Vistas:* ${formatearVistas(elemento.views)}\n`
      lista += ` 𓍯  *Publicado:* ${elemento.publishedAt || '—'}\n`
      lista += ` 𓍯  *Enlace:* ${elemento.url}\n\n`
    })
    lista += `> Descargar video:\n> ${usedPrefix}video <número>\n> ${usedPrefix}video <enlace>\n> ${usedPrefix}play <número>`

    await conn.sendMessage(m.chat, {
      text: lista.trim(),
      contextInfo: { ...rcanal?.contextInfo }
    }, { quoted: m })

    if (!global.lastYtSearch) global.lastYtSearch = {}
    global.lastYtSearch[m.sender] = {
      query: consulta,
      results: resultados.map(r => ({
        title: r.title,
        url: r.url || `https://youtu.be/${r.videoId}`,
        image: r.image || r.thumbnail,
        duration: r.duration,
        views: r.views,
        author: r.author?.name
      })),
      at: Date.now()
    }

    for (let i = 0; i < resultados.length; i++) {
      const elemento = resultados[i]
      const canal = recortarTexto(elemento.author?.name, 40) || 'YouTube'
      const leyenda = `*${i + 1}.* ${recortarTexto(elemento.title, 90)}
 𓍯  *Canal:* ${canal}
 𓍯  *Duración:* ${elemento.duration || '—'}
 𓍯  *Vistas:* ${formatearVistas(elemento.views)}
 𓍯  *Enlace:* ${elemento.url}

> ${usedPrefix}video ${i + 1}`

      const miniatura = elemento.image || elemento.thumbnail
      if (miniatura) {
        try {
          const imagen = (await conn.getFile(miniatura)).data
          await conn.sendMessage(m.chat, {
            image: imagen,
            caption: leyenda,
            contextInfo: { ...rcanal?.contextInfo }
          }, { quoted: m })
          continue
        } catch {}
      }

      await conn.sendMessage(m.chat, {
        text: leyenda,
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
