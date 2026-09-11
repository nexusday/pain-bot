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

    const indicacion = `Traduce al español el siguiente texto. Responde solo con la traducción, sin explicaciones ni marcas:\n\n${original}`
    const urlApi = `https://api.delirius.online/ia/chatgpt?q=${encodeURIComponent(indicacion)}`

    const { datos } = await axios.get(urlApi)
    if (!datos?.status) {
      return conn.sendMessage(m.chat, { text: '*[❗] No se pudo obtener respuesta de la API de traducción.*', contextInfo: { ...rcanal.contextInfo } }, { quoted: m })
    }

    let respuestaApi = (typeof datos.data === 'string' ? datos.data.trim() : '') || ''

    
    const coincidenciaPensamiento = respuestaApi.match(/<think>([\s\S]*?)<\/think>/)
    if (coincidenciaPensamiento) {
      respuestaApi = respuestaApi.replace(/<think>[\s\S]*?<\/think>/, '').trim()
    }

    if (!respuestaApi) respuestaApi = 'No se obtuvo traducción.'

    await conn.sendMessage(m.chat, { text: respuestaApi, contextInfo: { ...rcanal.contextInfo } }, { quoted: m })

  } catch (e) {
    console.error('Error en comando traducir:', e)
    return conn.sendMessage(m.chat, { text: '*[❗] Ocurrió un error al traducir el mensaje.*', contextInfo: { ...rcanal.contextInfo } }, { quoted: m })
  }
}

handler.help = ['traduc <respuesta>']
handler.tags = ['inteligencia']
handler.command = ['traduc', 'traducir']

export default handler
