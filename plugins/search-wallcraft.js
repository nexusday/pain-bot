import fetch from 'node-fetch'

const LIMITE_RESULTADOS = 4

function recortarTexto(text = '', max = 120) {
  const valor = String(text).replace(/\s+/g, ' ').trim()
  if (!valor || valor === '-') return ''
  return valor.length > max ? `${valor.slice(0, max - 1)}…` : valor
}

function construirLeyenda(elemento, indice, consulta) {
  return `ִֶָ☾. 𝗪𝗮𝗹𝗹𝗽𝗮𝗽𝗲𝗿 ִֶָ☾. *${indice + 1}/4*

 𓍯  *Búsqueda:* ${consulta}
 𓍯  *Descripción:* ${recortarTexto(elemento.description, 140) || 'Sin descripción'}
 𓍯  *Autor:* ${recortarTexto(elemento.author, 50) || 'Desconocido'}
 𓍯  *Rating:* ${elemento.rating ?? '—'}
 𓍯  *Descargas:* ${Number(elemento.downloads || 0).toLocaleString()}
 𓍯  *Favoritos:* ${Number(elemento.favorites || 0).toLocaleString()}`
}

async function enviarWallpaper(conn, chat, elemento, leyenda, quoted) {
  try {
    await conn.sendMessage(chat, {
      image: { url: elemento.download },
      caption: leyenda,
      contextInfo: { ...rcanal?.contextInfo }
    }, { quoted })
    return true
  } catch {
    const respuesta = await fetch(elemento.download)
    if (!respuesta.ok) throw new Error('No se pudo descargar la imagen.')
    const bufer = Buffer.from(await respuesta.arrayBuffer())
    await conn.sendMessage(chat, {
      image: bufer,
      caption: leyenda,
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

    const consulta = text.trim()
    const urlBusqueda = `https://api.delirius.online/search/wallcraft?query=${encodeURIComponent(consulta)}`
    const resBusqueda = await fetch(urlBusqueda).then(r => r.json())

    if (!resBusqueda?.status || !Array.isArray(resBusqueda.data) || !resBusqueda.data.length) {
      throw '[❗] No se encontraron wallpapers para esa búsqueda.'
    }

    const resultados = resBusqueda.data
      .filter(elemento => elemento?.download)
      .slice(0, LIMITE_RESULTADOS)

    if (!resultados.length) {
      throw '[❗] No hay imágenes disponibles para descargar.'
    }

   

    for (let i = 0; i < resultados.length; i++) {
      const elemento = resultados[i]
      const leyenda = construirLeyenda(elemento, i, consulta)
      try {
        await enviarWallpaper(conn, m.chat, elemento, leyenda, m)
      } catch (err) {
        console.error(`Error enviando wall ${i + 1}:`, err)
        await conn.sendMessage(m.chat, {
          text: `[❗] No se pudo enviar el wallpaper *${i + 1}*.\n 𓍯  *Descripción:* ${recortarTexto(elemento.description, 100)}`,
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
