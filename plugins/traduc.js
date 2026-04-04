import axios from 'axios'

let handler = async (m, { conn, usedPrefix, command }) => {
  try {
    if (!m.quoted || !m.quoted.text) {
      return conn.sendMessage(m.chat, {
        text: `*[❗] Debes responder a un mensaje que contenga texto para traducir.*\n\nEjemplo: ${usedPrefix + command} (responde al mensaje)` ,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }

    const original = m.quoted.text.trim()
    if (!original) return m.reply('*[❗] El mensaje respondido no contiene texto válido.*')

    const prompt = `Traduce al español el siguiente texto. Responde solo con la traducción, sin explicaciones ni marcas:\n\n${original}`
    const apiUrl = `https://api.delirius.store/ia/chatgpt?q=${encodeURIComponent(prompt)}`

    const { data } = await axios.get(apiUrl)
    if (!data?.status) {
      return conn.sendMessage(m.chat, { text: '*[❗] No se pudo obtener respuesta de la API de traducción.*', contextInfo: { ...rcanal.contextInfo } }, { quoted: m })
    }

    let response = (typeof data.data === 'string' ? data.data.trim() : '') || ''

    // Remove any <think> blocks
    const thinkMatch = response.match(/<think>([\s\S]*?)<\/think>/)
    if (thinkMatch) {
      response = response.replace(/<think>[\s\S]*?<\/think>/, '').trim()
    }

    if (!response) response = 'No se obtuvo traducción.'

    await conn.sendMessage(m.chat, { text: response, contextInfo: { ...rcanal.contextInfo } }, { quoted: m })

  } catch (e) {
    console.error('Error en comando traducir:', e)
    return conn.sendMessage(m.chat, { text: '*[❗] Ocurrió un error al traducir el mensaje.*', contextInfo: { ...rcanal.contextInfo } }, { quoted: m })
  }
}

handler.help = ['traduc <respuesta>']
handler.tags = ['inteligencia']
handler.command = ['traduc', 'traducir']

export default handler
