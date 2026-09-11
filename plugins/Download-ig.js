import fetch from 'node-fetch'

const REGEX_URL_IG = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:reel|reels|p|tv)\/[\w-]+/i

const handler = async (m, { conn, text, usedPrefix, command }) => {
  try {
    if (!text?.trim()) {
      return conn.sendMessage(m.chat, {
        text: `[❗] Ingresa un enlace o búsqueda de Instagram Reels.\n\n> *URL:*\n${usedPrefix + command} https://www.instagram.com/reel/...\n\n> *Búsqueda:*\n${usedPrefix + command} its you`,
        contextInfo: { ...rcanal?.contextInfo }
      }, { quoted: m })
    }

    const consulta = text.trim()
    let urlReel = consulta.match(REGEX_URL_IG)?.[0]
    let titulo = 'Instagram Reel'
    let descripcion = ''
    let urlMiniatura

    if (!urlReel) {
      const urlBusqueda = `https://api.delirius.online/search/instagramreels?query=${encodeURIComponent(consulta)}&language=es`
      const resBusqueda = await fetch(urlBusqueda).then(r => r.json())

      if (!resBusqueda?.status || !Array.isArray(resBusqueda.data) || !resBusqueda.data.length) {
        throw '[❗] No se encontraron reels para esa búsqueda.'
      }

      const primero = resBusqueda.data[0]
      urlReel = primero.url
      titulo = primero.title || titulo
      descripcion = primero.description || ''
      urlMiniatura = primero.image
    }

    if (!urlReel) throw '[❗] No se pudo obtener el enlace del reel.'

    const apiDescarga = `https://api.delirius.online/download/instagram?url=${encodeURIComponent(urlReel)}`
    const resDescarga = await fetch(apiDescarga).then(r => r.json())

    if (!resDescarga?.status || !Array.isArray(resDescarga.data) || !resDescarga.data.length) {
      throw '[❗] No se pudo descargar el contenido de Instagram.'
    }

    const medio = resDescarga.data[0]
    const urlMedio = medio?.url

    if (!urlMedio) throw '[❗] No se encontró la URL del video.'

    let leyenda = `> *${titulo}*`
    if (descripcion) leyenda += `\n> ${descripcion}`
    leyenda += `\n> *Enlace:* ${urlReel}`

    if (urlMiniatura) {
      try {
        const miniatura = (await conn.getFile(urlMiniatura)).data
        await conn.sendMessage(m.chat, {
          image: miniatura,
          caption: leyenda,
          contextInfo: { ...rcanal?.contextInfo }
        }, { quoted: m })
      } catch {}
    }

    if (medio.type === 'video') {
      await conn.sendMessage(m.chat, {
        video: { url: urlMedio },
        fileName: 'instagram.mp4',
        caption: urlMiniatura ? '' : leyenda,
        contextInfo: { ...rcanal?.contextInfo }
      }, { quoted: m })
    } else {
      await conn.sendMessage(m.chat, {
        image: { url: urlMedio },
        caption: urlMiniatura ? '' : leyenda,
        contextInfo: { ...rcanal?.contextInfo }
      }, { quoted: m })
    }
  } catch (e) {
    console.error('Error en Instagram:', e)
    return conn.sendMessage(m.chat, {
      text: typeof e === 'string'
        ? e
        : `[❗] Se produjo un error al procesar Instagram.\n> Usa *${usedPrefix}report* para informarlo.\n\n${e.message}`,
      contextInfo: { ...rcanal?.contextInfo }
    }, { quoted: m })
  }
}

handler.help = ['instagram <url|búsqueda>', 'ig <url|búsqueda>']
handler.tags = ['downloader']
handler.command = ['instagram', 'ig']
handler.group = true

export default handler
