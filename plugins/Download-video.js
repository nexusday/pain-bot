import fetch from "node-fetch"

const BaseYuxinzesite = "http://speedhosting.cloud:2009"

const handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text) {
    return conn.sendMessage(m.chat, {
      text: `╭─「 ✦ 𓆩🎬𓆪 ᴠɪᴅᴇᴏ ᴘʟᴀʏᴇʀ ✦ 」─╮\n│\n╰➺ ✧ *Uso:* ${usedPrefix}video <nombre>\n╰➺ ✧ *Ejemplo:* ${usedPrefix}video carrusel\n\n> PAIN COMMUNITY`,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }

 
  await conn.sendMessage(m.chat, {
    text: `╭─「 ✦ 𓆩🕒𓆪 ᴘʀᴏᴄᴇsᴀɴᴅᴏ ✦ 」─╮\n│\n╰➺ ✧ *Video:* ${text}\n╰➺ ✧ *Estado:* Buscando...\n\n> PAIN COMMUNITY`,
    contextInfo: {
      ...rcanal.contextInfo
    }
  }, { quoted: m })

  try {
   
    const ytsearch = await fetchJson(`${BaseYuxinzesite}/pesquisas/ytsearch?query=${encodeURIComponent(text)}`)
    
    if (!ytsearch.resultado || ytsearch.resultado.length === 0) {
      return conn.sendMessage(m.chat, {
        text: `╭─「 ✦ 𓆩❌𓆪 ɴᴏ ʀᴇsᴜʟᴛᴀᴅᴏs ✦ 」─╮\n│\n╰➺ ✧ *Búsqueda:* ${text}\n╰➺ ✧ *Estado:* No se encontró el video\n\n> PAIN COMMUNITY`,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }

    const videoResult = ytsearch.resultado[0]
    const videoUrl = `${BaseYuxinzesite}/download/play-video?url=${videoResult.url}`

    const caption = `╭─「 ✦ 𓆩🎬𓆪 ᴠɪᴅᴇᴏ ᴅᴇsᴄᴀʀɢᴀᴅᴏ ✦ 」─╮\n│\n╰➺ ✧ *Título:* ${videoResult.title}\n╰➺ ✧ *Autor:* ${videoResult.author.name}\n╰➺ ✧ *Publicado:* ${videoResult.ago}\n╰➺ ✧ *Duración:* ${videoResult.timestamp}\n╰➺ ✧ *Vistas:* ${videoResult.views}\n╰➺ ✧ *Descripción:* ${videoResult.description}\n╰➺ ✧ *URL:* ${videoResult.url}\n\n> PAIN COMMUNITY`

   
    await conn.sendMessage(m.chat, {
      video: { url: videoUrl },
      caption: caption,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })

  } catch (e) {
    console.error('Error en video:', e)
    await conn.sendMessage(m.chat, {
      text: `╭─「 ✦ 𓆩❌𓆪 ᴇʀʀᴏʀ ✦ 」─╮\n│\n╰➺ ✧ *Error:* ${e.message}\n╰➺ ✧ *Sugerencia:* Inténtalo más tarde\n\n> PAIN COMMUNITY`,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
}

handler.command = ['playvideo', 'ytvideo', 'ytv']
handler.tags = ['video', 'descargas', 'entretenimiento']
handler.help = ['video <nombre> - Descargar video desde YouTube']

export default handler

async function fetchJson(url) {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    return await response.json()
  } catch (error) {
    console.error('Error en fetchJson:', error)
    throw error
  }
} 