import axios from 'axios'

const URL_API_KORA = 'https://api-kora.netlify.app/.netlify/functions/chat'
const CLAVE_API_KORA = 'kora_ojrQBrFs0TdAzyC1w5gu4CCj7uUiZ8N4XHS7PHpa'

let handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text?.trim()) {
    return conn.sendMessage(m.chat, {
      text: `*[❗] Debes escribir un mensaje para Kora.*\n*Ejemplo:* ${usedPrefix + command} ¿Cómo estás?`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  try {
    const { datos, status } = await axios.post(URL_API_KORA, {
      message: text.trim()
    }, {
      headers: {
        Authorization: `Bearer ${CLAVE_API_KORA}`,
        'Content-Type': 'application/json'
      },
      timeout: 60000
    })

    if (status !== 200) {
      throw new Error(`API código ${status}`)
    }

    const respuestaApi = (typeof datos?.response === 'string' ? datos.response.trim() : '') || ''

    if (!respuestaApi) {
      return conn.sendMessage(m.chat, {
        text: '*[❗] Kora no devolvió una respuesta.*',
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    await conn.sendMessage(m.chat, {
      text: `${respuestaApi}`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  } catch (e) {
    console.error('Error en ia-kora:', e)

    const datosApi = e?.response?.data
    const detalle = typeof datosApi === 'string'
      ? datosApi
      : datosApi?.error || datosApi?.message || e.message || 'Intenta de nuevo más tarde.'

    conn.sendMessage(m.chat, {
      text: `*[❌] Error al consultar a Kora.*`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }
}

handler.help = ['#kora <texto> → Chat con Kora IA']
handler.tags = ['inteligencia']
handler.command = ['kora', 'ia-kora', 'korai']

export default handler
