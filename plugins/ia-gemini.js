import { consultarGeminiDelirius } from '../lib/delirius-ia.js'

let handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text?.trim()) {
    return conn.sendMessage(m.chat, {
      text: `*[❗] Debes ingresar un texto para consultar a Gemini.*\n*Ejemplo:* ${usedPrefix + command} ¿Quién eres?`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  try {
    const respuesta = await consultarGeminiDelirius(text.trim())
    if (!respuesta) {
      return conn.sendMessage(m.chat, {
        text: '*[❗] No se pudo obtener una respuesta de Gemini.*',
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    return conn.sendMessage(m.chat, {
      text: respuesta,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  } catch (error) {
    console.error('Error en comando Gemini:', error)
    return conn.sendMessage(m.chat, {
      text: '*[❗] Ocurrió un error al consultar a Gemini. Inténtalo de nuevo más tarde.*',
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }
}

handler.help = ['#gemini <texto>']
handler.tags = ['inteligencia']
handler.command = ['gemini', 'gem']

export default handler
