import axios from 'axios'

let handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text) return conn.sendMessage(m.chat, {
    text: `*[❗] Debes ingresar un texto para consultar a Gemini.*\n*Ejemplo:* ${usedPrefix + command} ¿Quién eres?`,
    contextInfo: {
      ...rcanal.contextInfo
    }
  }, { quoted: m })
  
  try {
    
    const searchQuery = encodeURIComponent(text)
    const apiUrl = `https://bytebazz-api.koyeb.app/api/ai/gemini?texto=${searchQuery}&apikey=8jkh5icbf05`
    
    const { data } = await axios.get(apiUrl)
    
    if (!data.status) {
      return conn.sendMessage(m.chat, {
        text: '*[❗] No se pudo obtener una respuesta de la API de Gemini.*',
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }
    
    const response = data.data?.trim() || 'No se obtuvo respuesta de Gemini.'
    
    await conn.sendMessage(m.chat, {
      text: response
    }, { quoted: m })
    
  } catch (e) {
    console.error('Error en comando gemini:', e)
    conn.sendMessage(m.chat, {
      text: '*[❗] Ocurrió un error al procesar tu consulta. Por favor, inténtalo de nuevo más tarde.*',
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
}

handler.help = ['#gemini <texto>']
handler.tags = ['inteligencia']
handler.command = ['gemini', 'geminiai', 'googleai']

export default handler
