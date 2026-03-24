import fetch from 'node-fetch'

let handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text) return conn.sendMessage(m.chat, {
    text: `*[❗] Ingresa un término o un enlace de TikTok.*\nEjemplo: ${usedPrefix + command} https://www.tiktok.com/...`,
    contextInfo: { ...rcanal.contextInfo }
  }, { quoted: m })

  const isUrl = /(?:https:?\/{2})?(?:www\.|vm\.|vt\.|t\.)?tiktok\.com\/([^\s&]+)/gi.test(text)

  try {
    if (isUrl) {

      const res = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(text)}?hd=1`)
      const data = await res.json()
      const video = data?.data

      if (!video?.play) return conn.sendMessage(m.chat, {
        text: '*[❗] Enlace inválido o sin contenido descargable.*',
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })

      const caption = `𝗧𝗜𝗞𝗧𝗢𝗞 𝗩𝗜𝗗𝗘𝗢 

> *[+] Título:* ${video.title || 'Sin título'}
> *[+] Autor:* ${video.author?.nickname || video.author?.unique_id || 'Desconocido'}
> *[+] Duración:* ${video.duration || 'N/A'}s
> *[+] Fecha:* ${video.created_at || 'N/A'}`

      if (video.type === 'image' && Array.isArray(video.images)) {
        const medias = video.images.map(img => ({
          image: { url: img },
          caption,
          contextInfo: { ...rcanal.contextInfo }
        }))
        for (let media of medias) {
          await conn.sendMessage(m.chat, media, { quoted: m })
        }
        if (video.music) {
          await conn.sendMessage(m.chat, {
            audio: { url: video.music },
            mimetype: 'audio/mp4',
            fileName: 'tiktok_audio.mp4',
            contextInfo: { ...rcanal.contextInfo }
          }, { quoted: m })
        }
      } else {
        await conn.sendMessage(m.chat, {
          video: { url: video.play },
          caption,
          contextInfo: { ...rcanal.contextInfo }
        }, { quoted: m })
      }
    } else {

      const res = await fetch('https://tikwm.com/api/feed/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Cookie': 'current_language=en',
          'User-Agent': 'Mozilla/5.0'
        },
        body: new URLSearchParams({ keywords: text, count: 10, cursor: 0, HD: 1 })
      })
      const data = await res.json()
      const results = data?.data?.videos?.filter(v => v.play) || []

      if (results.length < 1) return conn.sendMessage(m.chat, {
        text: '*[❗] No se encontraron resultados válidos.*',
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })

      const medias = results.slice(0, 3).map((vid, i) => ({
        video: { url: vid.play },
        caption: `𝗧𝗜𝗞𝗧𝗢𝗞 ${i + 1} 

> *[+] Título:* ${vid.title || 'Sin título'}
> *[+] Autor:* ${vid.author?.nickname || vid.author?.unique_id || 'Desconocido'}
> *[+] Duración:* ${vid.duration || 'N/A'}s
> *[+] Música:* ${vid.music?.title || 'N/A'}`,
        contextInfo: { ...rcanal.contextInfo }
      }))

      for (let media of medias) {
        await conn.sendMessage(m.chat, media, { quoted: m })
      }
    }
  } catch (e) {
    console.error('Error en tiktok2:', e)
    conn.sendMessage(m.chat, {
      text: '*[❗] Ocurrió un error al procesar TikTok. Inténtalo de nuevo más tarde.*',
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }
}

handler.help = ['tiktok2 <búsqueda | link>']
handler.tags = ['downloader']
handler.command = ['tiktok2', 'tt2', 'tiktoks2', 'tts2']

export default handler