import fetch from "node-fetch"
import yts from "yt-search"

const handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text) {
    return conn.sendMessage(m.chat, {
      text: `[❗] Uso incorrecto.\n> *Ejemplo:* ${usedPrefix}play2 <canción>`,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }


  try {
    
    const busqueda = await yts(text)
    if (!busqueda || !busqueda.videos || busqueda.videos.length === 0) {
      return conn.sendMessage(m.chat, {
        text: `[❗] No se encontró resultados para: ${text}`,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }

    const video = busqueda.videos[0]

    
   
    const apiDescarga = `https://api.delirius.online/download/ytmp3?url=${encodeURIComponent(video.url)}`
    const resDescarga = await fetch(apiDescarga).then(r => r.json())

    if (!resDescarga?.status || !resDescarga.data) {
      return conn.sendMessage(m.chat, {
        text: `[❌] No se pudo descargar el audio.`,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }

  
    const metadatos = {
      title: resDescarga.data.title || video.title,
      author: { name: (video.author && video.author.name) || video.author || "Desconocido" },
      timestamp: video.timestamp,
      thumbnail: resDescarga.data.image || video.image || video.thumbnail,
      url: video.url
    }
    const descarga = {
      url: typeof resDescarga.data.download === "string" ? resDescarga.data.download : resDescarga.data.download?.url,
      filename: `${metadatos.title}.mp3`
    }

    
    await conn.sendMessage(m.chat, {
      audio: { url: descarga.url },
      mimetype: "audio/mpeg",
      ptt: false,
      contextInfo: {
        externalAdReply: {
          title: `ִֶָ☾. 𝐓𝐢𝐭𝐮𝐥𝐨: ${metadatos.title}`,
          body: `ִֶָ☾. 𝐀𝐮𝐭𝐨𝐫: ${metadatos.author.name} | 𝐃𝐮𝐫𝐚𝐜𝐢𝐨́𝐧: ${metadatos.timestamp}`,
          thumbnailUrl: metadatos.thumbnail,
          mediaType: 4,
          renderLargerThumbnail: false,
          sourceUrl: metadatos.url
        }
      }
    }, { quoted: m })

  } catch (e) {
    console.error('Error en play2:', e)
    await conn.sendMessage(m.chat, {
      text: `[❌] *Error:* ${e.message}`,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
}

handler.command = ['play2', 'music2', 'song2', 'audio2']
handler.tags = ['musica', 'audio', 'entretenimiento']
handler.help = ['play2 <canción> - Reproducir música desde YouTube']

export default handler 