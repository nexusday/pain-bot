import axios from 'axios'

let handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text) return conn.sendMessage(m.chat, {
    text: `*[❗] Debes ingresar un texto para consultar a Deepseek.*\n*Ejemplo:* ${usedPrefix + command} ¿Quién eres?`,
    contextInfo: {
      ...rcanal.contextInfo
    }
  }, { quoted: m })
  
  try {
    
    const searchQuery = encodeURIComponent(text)
    const apiUrl = `https://bytebazz-api.koyeb.app/api/ai/model/deepseek?texto=${searchQuery}&apikey=8jkh5icbf05`
    
    const { data } = await axios.get(apiUrl)
    
    if (!data.status) {
      return conn.sendMessage(m.chat, {
        text: '*[❗] No se pudo obtener una respuesta de la API de Deepseek.*',
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }
    
    const response = data.data?.trim() || 'No se obtuvo respuesta de Deepseek.'
    
    
    let thought = ''
    let finalResponse = response
    
    
    const thinkMatch = response.match(/<think>([\s\S]*?)<\/think>/)
    if (thinkMatch) {
      thought = thinkMatch[1].trim()
    
      finalResponse = response.replace(/<think>[\s\S]*?<\/think>/, '').trim()
    }
    
    
        let formattedMessage = ''
    if (thought) {
      
      const cleanThought = thought.replace(/\n+/g, ' ').trim()
      
      formattedMessage += `> *Su pensamiento:* ${cleanThought}\n\n`
    }
    formattedMessage += finalResponse
    
    await conn.sendMessage(m.chat, {
      text: formattedMessage,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
    
  } catch (e) {
    console.error('Error en comando deepseek:', e)
    conn.sendMessage(m.chat, {
      text: '*[❗] Ocurrió un error al procesar tu consulta. Por favor, inténtalo de nuevo más tarde.*',
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
}

handler.help = ['#deep <texto>']
handler.tags = ['inteligencia']
handler.command = ['deepseek', 'deep', 'deepseekia']

export default handler