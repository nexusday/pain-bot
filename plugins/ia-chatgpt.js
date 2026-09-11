import axios from 'axios'

let handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text) return conn.sendMessage(m.chat, {
    text: `*[❗] Debes ingresar un texto para consultar a Deepseek.*\n*Ejemplo:* ${usedPrefix + command} ¿Quién eres?`,
    contextInfo: {
      ...rcanal.contextInfo
    }
  }, { quoted: m })
  
  try {
    
    const consultaBusqueda = encodeURIComponent(text)
    const urlApi = `https://api.delirius.online/ia/chatgpt?q=${consultaBusqueda}`

    const { datos } = await axios.get(urlApi)

    if (!datos?.status) {
      return conn.sendMessage(m.chat, {
        text: '*[❗] No se pudo obtener una respuesta de la API.*',
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }

    const respuestaApi = (typeof datos.data === 'string' ? datos.data.trim() : '') || 'No se obtuvo respuesta de la API.'
    
    
    let pensamiento = ''
    let respuestaFinal = respuestaApi
    
    
    const coincidenciaPensamiento = respuestaApi.match(/<think>([\s\S]*?)<\/think>/)
    if (coincidenciaPensamiento) {
      pensamiento = coincidenciaPensamiento[1].trim()
    
      respuestaFinal = respuestaApi.replace(/<think>[\s\S]*?<\/think>/, '').trim()
    }
    
    
        let mensajeFormateado = ''
    if (pensamiento) {
      
      const pensamientoLimpio = pensamiento.replace(/\n+/g, ' ').trim()
      
      mensajeFormateado += `> *Su pensamiento:* ${pensamientoLimpio}\n\n`
    }
    mensajeFormateado += respuestaFinal
    
    await conn.sendMessage(m.chat, {
      text: mensajeFormateado,
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
handler.command = ['gpt', 'chatgpt', 'ia']

export default handler