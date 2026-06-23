import fetch from 'node-fetch'

const MAX_CHUNK = 3800

function splitLyrics(text, max = MAX_CHUNK) {
  const chunks = []
  let rest = String(text || '').trim()
  if (!rest) return chunks

  while (rest.length > max) {
    let cut = rest.lastIndexOf('\n', max)
    if (cut < max * 0.4) cut = max
    chunks.push(rest.slice(0, cut).trim())
    rest = rest.slice(cut).trim()
  }

  if (rest) chunks.push(rest)
  return chunks
}

function buildHeader(data, query) {
  return `ִֶָ☾. 𝗟𝘆𝗿𝗶𝗰𝘀 ִֶָ☾.

 𓍯  *Búsqueda:* ${query}
 𓍯  *Título:* ${data.title || 'Desconocido'}
 𓍯  *Artista:* ${data.artists || 'Desconocido'}
 𓍯  *Álbum:* ${data.album || '—'}
 𓍯  *Duración:* ${data.duration || '—'}`
}

const handler = async (m, { conn, text, usedPrefix, command }) => {
  try {
    if (!text?.trim()) {
      return conn.sendMessage(m.chat, {
        text: `ִֶָ☾. Ingresa el nombre de la canción.\n\n> *Ejemplo:*\n${usedPrefix + command} its you`,
        contextInfo: { ...rcanal?.contextInfo }
      }, { quoted: m })
    }

    const query = text.trim()
    const apiUrl = `https://api.delirius.store/search/lyrics?query=${encodeURIComponent(query)}`
    const sres = await fetch(apiUrl).then(r => r.json())

    if (!sres?.status || !sres?.data) {
      throw '[❗] No se encontraron letras para esa búsqueda.'
    }

    const data = sres.data
    const lyrics = String(data.lyrics || '').trim()

    if (!lyrics) {
      throw '[❗] La canción no tiene letra disponible.'
    }

    await conn.sendMessage(m.chat, {
      text: buildHeader(data, query),
      contextInfo: { ...rcanal?.contextInfo }
    }, { quoted: m })

    const parts = splitLyrics(lyrics)
    for (let i = 0; i < parts.length; i++) {
      const prefix = parts.length > 1 ? `*Parte ${i + 1}/${parts.length}*\n\n` : ''
      await conn.sendMessage(m.chat, {
        text: `${prefix}${parts[i]}`,
        contextInfo: { ...rcanal?.contextInfo }
      }, { quoted: m })
    }
  } catch (e) {
    console.error('Error en lyrics:', e)
    return conn.sendMessage(m.chat, {
      text: typeof e === 'string' ? e : `[❗] Error al buscar letras.\n\n${e.message}`,
      contextInfo: { ...rcanal?.contextInfo }
    }, { quoted: m })
  }
}

handler.help = ['ly <canción> → Letra de la canción']
handler.tags = ['descargas', 'busqueda']
handler.command = ['ly', 'lyrics', 'letra', 'letras']

export default handler
