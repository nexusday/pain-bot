import fetch from 'node-fetch'

const RESULTS_LIMIT = 4

function trimText(text = '', max = 120) {
  const value = String(text).replace(/\s+/g, ' ').trim()
  if (!value || value === '-') return ''
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

function buildCaption(item, index, query) {
  return `ִֶָ☾. 𝗪𝗮𝗹𝗹𝗽𝗮𝗽𝗲𝗿 ִֶָ☾. *${index + 1}/4*

 𓍯  *Búsqueda:* ${query}
 𓍯  *Descripción:* ${trimText(item.description, 140) || 'Sin descripción'}
 𓍯  *Autor:* ${trimText(item.author, 50) || 'Desconocido'}
 𓍯  *Rating:* ${item.rating ?? '—'}
 𓍯  *Descargas:* ${Number(item.downloads || 0).toLocaleString()}
 𓍯  *Favoritos:* ${Number(item.favorites || 0).toLocaleString()}`
}

async function sendWallpaper(conn, chat, item, caption, quoted) {
  try {
    await conn.sendMessage(chat, {
      image: { url: item.download },
      caption,
      contextInfo: { ...rcanal?.contextInfo }
    }, { quoted })
    return true
  } catch {
    const res = await fetch(item.download)
    if (!res.ok) throw new Error('No se pudo descargar la imagen.')
    const buffer = Buffer.from(await res.arrayBuffer())
    await conn.sendMessage(chat, {
      image: buffer,
      caption,
      contextInfo: { ...rcanal?.contextInfo }
    }, { quoted })
    return true
  }
}

const handler = async (m, { conn, text, usedPrefix, command }) => {
  try {
    if (!text?.trim()) {
      return conn.sendMessage(m.chat, {
        text: `ִֶָ☾. Ingresa qué wallpaper buscar.\n\n> *Ejemplo:*\n${usedPrefix + command} pain`,
        contextInfo: { ...rcanal?.contextInfo }
      }, { quoted: m })
    }

    const query = text.trim()
    const searchUrl = `https://api.delirius.store/search/wallcraft?query=${encodeURIComponent(query)}`
    const sres = await fetch(searchUrl).then(r => r.json())

    if (!sres?.status || !Array.isArray(sres.data) || !sres.data.length) {
      throw '[❗] No se encontraron wallpapers para esa búsqueda.'
    }

    const results = sres.data
      .filter(item => item?.download)
      .slice(0, RESULTS_LIMIT)

    if (!results.length) {
      throw '[❗] No hay imágenes disponibles para descargar.'
    }

   

    for (let i = 0; i < results.length; i++) {
      const item = results[i]
      const caption = buildCaption(item, i, query)
      try {
        await sendWallpaper(conn, m.chat, item, caption, m)
      } catch (err) {
        console.error(`Error enviando wall ${i + 1}:`, err)
        await conn.sendMessage(m.chat, {
          text: `[❗] No se pudo enviar el wallpaper *${i + 1}*.\n 𓍯  *Descripción:* ${trimText(item.description, 100)}`,
          contextInfo: { ...rcanal?.contextInfo }
        }, { quoted: m })
      }
    }
  } catch (e) {
    console.error('Error en wallcraft:', e)
    return conn.sendMessage(m.chat, {
      text: typeof e === 'string' ? e : `[❗] Error al buscar wallpapers.\n\n${e.message}`,
      contextInfo: { ...rcanal?.contextInfo }
    }, { quoted: m })
  }
}

handler.help = ['wall <búsqueda> → 4 wallpapers con descripción']
handler.tags = ['descargas', 'imagenes']
handler.command = ['wall', 'wallcraft', 'wallpaper', 'fondo']

export default handler
