import { consultarIaDelirius, formatearPensamiento } from '../lib/delirius-ia.js'

let handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text?.trim()) {
    return conn.sendMessage(m.chat, {
      text: `*[❗] Debes ingresar un texto para consultar a ChatGPT.*\n*Ejemplo:* ${usedPrefix + command} ¿Quién eres?`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  try {
    const respuestaApi = await consultarIaDelirius(text.trim(), {
      systemPrompt: 'Eres un asistente útil. Responde en el idioma del usuario.',
      intentosPorProveedor: 2
    })

    if (!respuestaApi) {
      return conn.sendMessage(m.chat, {
        text: '*[❗] No se pudo obtener una respuesta de la API.*',
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    await conn.sendMessage(m.chat, {
      text: formatearPensamiento(respuestaApi),
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  } catch (e) {
    console.error('Error en comando chatgpt:', e)
    conn.sendMessage(m.chat, {
      text: '*[❗] Ocurrió un error al procesar tu consulta. Por favor, inténtalo de nuevo más tarde.*',
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }
}

handler.help = ['#chatgpt <texto>']
handler.tags = ['inteligencia']
handler.command = ['gpt', 'chatgpt', 'ia']

export default handler
