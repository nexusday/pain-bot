import { consultarIaDelirius } from '../lib/delirius-ia.js'

let handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text?.trim()) {
    return conn.sendMessage(m.chat, {
      text: `*[❗] Debes ingresar un texto para consultar a Copilot.*\n*Ejemplo:* ${usedPrefix + command} Hola, quien eres tu?`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  try {
    const respuestaApi = await consultarIaDelirius(text.trim(), {
      systemPrompt: 'Eres Microsoft Copilot. Responde claro y útil en el idioma del usuario.',
      intentosPorProveedor: 2
    })

    if (!respuestaApi) {
      return conn.sendMessage(m.chat, {
        text: '*[❗] No se pudo obtener una respuesta de Copilot.*',
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    await conn.sendMessage(m.chat, {
      text: respuestaApi,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  } catch (e) {
    console.error('Error en ia-copilot:', e)
    const detalle = e?.response?.data?.message || e.message || 'Intenta de nuevo más tarde.'
    return conn.sendMessage(m.chat, {
      text: `*[❌] Error al consultar a Copilot.*\n\n> ${detalle}`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }
}

handler.help = ['#copilot <texto> → Chat con Copilot IA']
handler.tags = ['inteligencia']
handler.command = ['copilot', 'copi', 'msft', 'bing']

export default handler
