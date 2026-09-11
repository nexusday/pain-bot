import axios from 'axios'

let handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text?.trim()) {
    return conn.sendMessage(m.chat, {
      text: `*[❗] Debes ingresar un texto para consultar a Replia.*\n*Ejemplo:* ${usedPrefix + command} Hola amigo`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  try {
    const urlApi = `https://api.delirius.online/ia/ripleai?query=${encodeURIComponent(text.trim())}`
    const { datos } = await axios.get(urlApi, { timeout: 60000 })

    if (!datos?.status) {
      return conn.sendMessage(m.chat, {
        text: '*[❗] No se pudo obtener una respuesta de Replia.*',
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    const respuestaApi = (
      typeof datos.data?.result === 'string' ? datos.data.result.trim()
        : typeof datos.data === 'string' ? datos.data.trim()
          : ''
    ) || 'No se obtuvo respuesta de la API.'

    await conn.sendMessage(m.chat, {
      text: respuestaApi,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  } catch (e) {
    console.error('Error en ia-replia:', e)
    const detalle = e?.response?.data?.message || e.message || 'Intenta de nuevo más tarde.'
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
