import axios from 'axios'

const KORA_API_URL = 'https://api-kora.netlify.app/.netlify/functions/chat'
const KORA_API_KEY = 'kora_ojrQBrFs0TdAzyC1w5gu4CCj7uUiZ8N4XHS7PHpa'

let handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text?.trim()) {
    return conn.sendMessage(m.chat, {
      text: `*[❗] Debes escribir un mensaje para Kora.*\n*Ejemplo:* ${usedPrefix + command} ¿Cómo estás?`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  try {
    const { data, status } = await axios.post(KORA_API_URL, {
      message: text.trim()
    }, {
      headers: {
        Authorization: `Bearer ${KORA_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 60000
    })

    if (status !== 200) {
      throw new Error(`API código ${status}`)
    }

    const response = (typeof data?.response === 'string' ? data.response.trim() : '') || ''

    if (!response) {
      return conn.sendMessage(m.chat, {
        text: '*[❗] Kora no devolvió una respuesta.*',
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    await conn.sendMessage(m.chat, {
      text: `${response}`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  } catch (e) {
    console.error('Error en ia-kora:', e)

    const apiData = e?.response?.data
    const detail = typeof apiData === 'string'
      ? apiData
      : apiData?.error || apiData?.message || e.message || 'Intenta de nuevo más tarde.'

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
