import axios from 'axios'

let handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text?.trim()) {
    return conn.sendMessage(m.chat, {
      text: `*[❗] Debes ingresar un texto para consultar a Copilot.*\n*Ejemplo:* ${usedPrefix + command} Hola, quien eres tu?`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  try {
    const urlApi = `https://api.delirius.online/ia/copilot?query=${encodeURIComponent(text.trim())}`
    const { datos } = await axios.get(urlApi, { timeout: 60000 })

    const respuestaApi = (typeof datos?.text === 'string' ? datos.text.trim() : '') || ''

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
