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

    const tarjetas = []
    for (const elemento of resultados) {
      const url = elemento.url || (elemento.videoId ? `https://youtu.be/${elemento.videoId}` : '')
      if (!url) continue
      const canal = recortarTexto(elemento.author?.name, 40) || 'YouTube'
      const titulo = recortarTexto(elemento.title, 80) || 'Sin título'
      const miniatura = elemento.image || elemento.thumbnail || (elemento.videoId ? `https://i.ytimg.com/vi/${elemento.videoId}/hqdefault.jpg` : '')
      if (!miniatura) continue
      tarjetas.push({
        image: { url: miniatura },
        caption: `
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *${titulo}*
╰─ ✧  ✩
┊ canal  ·  \`${canal}\`
┊ duración  ·  \`${elemento.duration || '—'}\`
┊ vistas  ·  \`${formatearVistas(elemento.views)}\`
┊ \`${recortarTexto(url, 70) || '—'}\`
╰─────────`.trim(),
        footer: 'audio · video',
        nativeFlow: [
          { text: 'Audio', id: `${usedPrefix}play ${tarjetas.length + 1}` },
          { text: 'Video', id: `${usedPrefix}video ${tarjetas.length + 1}` }
        ]
      })
    }

    if (!tarjetas.length) throw '[❗] Los resultados no traen miniatura o enlace.'

    await conn.sendMessageLia(m.chat, {
      text: `
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *YouTube*
╰─ ✧  ✩
┊ búsqueda  ·  \`${recortarTexto(consulta, 40)}\`
┊ resultados  ·  \`${tarjetas.length}\`
╰─────────`.trim(),
      footer: 'audio · video',
      cards: tarjetas
    }, { quoted: m, keepQuoted: true })
  } catch (e) {
    console.error('Error en búsqueda YouTube:', e)
    return conn.sendMessage(m.chat, {
      text: typeof e === 'string' ? e : `[❗] Ocurrió un error al buscar en YouTube.\n\n${e.message}`,
      contextInfo: { ...rcanal?.contextInfo }
    }, { quoted: m })
  }
}

handler.help = ['yt <búsqueda> → carrusel con Audio y Video']
handler.command = ['yt', 'youtube', 'ytsearch']
handler.tags = ['descargas', 'busqueda']

export default handler
