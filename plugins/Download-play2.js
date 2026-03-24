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
    
    const search = await yts(text)
    if (!search || !search.videos || search.videos.length === 0) {
      return conn.sendMessage(m.chat, {
        text: `[❗] No se encontró resultados para: ${text}`,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }

    const video = search.videos[0]

    
   
    const downloadApi = `https://api.delirius.store/download/ytmp3?url=${encodeURIComponent(video.url)}`
    const dres = await fetch(downloadApi).then(r => r.json())

    if (!dres?.status || !dres.data) {
      return conn.sendMessage(m.chat, {
        text: `[❌] No se pudo descargar el audio.`,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }

  
    const meta = {
      title: dres.data.title || video.title,
      author: { name: (video.author && video.author.name) || video.author || "Desconocido" },
      timestamp: video.timestamp,
      thumbnail: dres.data.image || video.image || video.thumbnail,
      url: video.url
    }
    const down = {
      url: typeof dres.data.download === "string" ? dres.data.download : dres.data.download?.url,
      filename: `${meta.title}.mp3`
    }

    
    await conn.sendMessage(m.chat, {
      audio: { url: down.url },
      mimetype: "audio/mpeg",
      ptt: false,
      contextInfo: {
        externalAdReply: {
          title: `ִֶָ☾. 𝐓𝐢𝐭𝐮𝐥𝐨: ${meta.title}`,
          body: `ִֶָ☾. 𝐀𝐮𝐭𝐨𝐫: ${meta.author.name} | 𝐃𝐮𝐫𝐚𝐜𝐢𝐨́𝐧: ${meta.timestamp}`,
          thumbnailUrl: meta.thumbnail,
          mediaType: 4,
          renderLargerThumbnail: false,
          sourceUrl: meta.url
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