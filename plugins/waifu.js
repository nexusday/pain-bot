import fetch from 'node-fetch'

let handler = async (m, { conn, usedPrefix, command }) => {
  try {
    const apiUrl = 'https://bytebazz-api.koyeb.app/api/images/waifu3?apikey=8jkh5icbf05'
    const response = await fetch(apiUrl)
    const data = await response.json()
    
    if (!data.status || !data.resultado || !data.resultado.resultado) {
      return conn.sendMessage(m.chat, {
        text: '*[❗] No se pudo obtener la imagen de waifu. Intenta de nuevo más tarde.*',
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }
    
    const imageUrl = data.resultado.resultado
    await conn.sendMessage(m.chat, {
      image: { url: imageUrl },
      mentions: [m.sender],
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
    
  } catch (e) {
    console.error('Error en comando waifu-sfw:', e)
    conn.sendMessage(m.chat, {
      text: '*[❗] Ocurrió un error al obtener la imagen de waifu. Por favor, inténtalo de nuevo más tarde.*',
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
}

handler.help = ['#waifu']
handler.tags = ['nsfw']
handler.command = ['waifu', 'waifus']
export default handler
