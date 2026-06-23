import axios from 'axios'

let handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text?.trim()) {
    return conn.sendMessage(m.chat, {
      text: `*[❗] Debes ingresar un texto para consultar a Replia.*\n*Ejemplo:* ${usedPrefix + command} Hola amigo`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  try {
    const apiUrl = `https://api.delirius.store/ia/ripleai?query=${encodeURIComponent(text.trim())}`
    const { data } = await axios.get(apiUrl, { timeout: 60000 })

    if (!data?.status) {
      return conn.sendMessage(m.chat, {
        text: '*[❗] No se pudo obtener una respuesta de Replia.*',
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    const response = (
      typeof data.data?.result === 'string' ? data.data.result.trim()
        : typeof data.data === 'string' ? data.data.trim()
          : ''
    ) || 'No se obtuvo respuesta de la API.'

    await conn.sendMessage(m.chat, {
      text: response,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  } catch (e) {
    console.error('Error en ia-replia:', e)
    const detail = e?.response?.data?.message || e.message || 'Intenta de nuevo más tarde.'
    return conn.sendMessage(m.chat, {
      text: `*[❌] Error al consultar a Replia.*`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }
}

handler.help = ['#replia <texto> → Chat con Replia IA']
handler.tags = ['inteligencia']
handler.command = ['replia', 'ripleai', 'repli', 'repliai']

export default handler
