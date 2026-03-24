import fetch from 'node-fetch'

let handler = async (m, { conn, usedPrefix, command }) => {
  try {
    const apiUrl = 'https://bytebazz-api.koyeb.app/api/images/waifunekos?apikey=8jkh5icbf05'
    const response = await fetch(apiUrl)
    const data = await response.json()
    
    if (!data.status || !data.resultado || !data.resultado.resultado) {
      return m.reply('*[❗] No se pudo obtener la imagen de waifu. Intenta de nuevo más tarde.*')
    }
    
    const imageUrl = data.resultado.resultado
    await conn.sendMessage(m.chat, {
      image: { url: imageUrl },
      mentions: [m.sender]
    }, { quoted: m })
    
  } catch (e) {
    console.error('Error en comando waifu:', e)
    m.reply('*[❗] Ocurrió un error al obtener la imagen de waifu. Por favor, inténtalo de nuevo más tarde.*')
  }
}

handler.help = ['#neko']
handler.tags = ['nsfw']
handler.command = ['waifu18', 'neko']
export default handler
