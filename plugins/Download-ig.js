import fetch from 'node-fetch'

const IG_URL_REGEX = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:reel|reels|p|tv)\/[\w-]+/i

const handler = async (m, { conn, text, usedPrefix, command }) => {
  try {
    if (!text?.trim()) {
      return conn.sendMessage(m.chat, {
        text: `[❗] Ingresa un enlace o búsqueda de Instagram Reels.\n\n> *URL:*\n${usedPrefix + command} https://www.instagram.com/reel/...\n\n> *Búsqueda:*\n${usedPrefix + command} its you`,
        contextInfo: { ...rcanal?.contextInfo }
      }, { quoted: m })
    }

    const query = text.trim()
    let reelUrl = query.match(IG_URL_REGEX)?.[0]
    let title = 'Instagram Reel'
    let description = ''
    let thumbUrl

    if (!reelUrl) {
      const searchUrl = `https://api.delirius.store/search/instagramreels?query=${encodeURIComponent(query)}&language=es`
      const sres = await fetch(searchUrl).then(r => r.json())

      if (!sres?.status || !Array.isArray(sres.data) || !sres.data.length) {
        throw '[❗] No se encontraron reels para esa búsqueda.'
      }

      const first = sres.data[0]
      reelUrl = first.url
      title = first.title || title
      description = first.description || ''
      thumbUrl = first.image
    }

    if (!reelUrl) throw '[❗] No se pudo obtener el enlace del reel.'

    const downloadApi = `https://api.delirius.store/download/instagram?url=${encodeURIComponent(reelUrl)}`
    const dres = await fetch(downloadApi).then(r => r.json())

    if (!dres?.status || !Array.isArray(dres.data) || !dres.data.length) {
      throw '[❗] No se pudo descargar el contenido de Instagram.'
    }

    const media = dres.data[0]
    const mediaUrl = media?.url

    if (!mediaUrl) throw '[❗] No se encontró la URL del video.'

    let caption = `> *${title}*`
    if (description) caption += `\n> ${description}`
    caption += `\n> *Enlace:* ${reelUrl}`

    if (thumbUrl) {
      try {
        const thumb = (await conn.getFile(thumbUrl)).data
        await conn.sendMessage(m.chat, {
          image: thumb,
          caption,
          contextInfo: { ...rcanal?.contextInfo }
        }, { quoted: m })
      } catch {}
    }

    if (media.type === 'video') {
      await conn.sendMessage(m.chat, {
        video: { url: mediaUrl },
        fileName: 'instagram.mp4',
        caption: thumbUrl ? '' : caption,
        contextInfo: { ...rcanal?.contextInfo }
      }, { quoted: m })
    } else {
      await conn.sendMessage(m.chat, {
        image: { url: mediaUrl },
        caption: thumbUrl ? '' : caption,
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
