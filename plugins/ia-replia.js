import { consultarIaDelirius } from '../lib/delirius-ia.js'

let handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text?.trim()) {
    return conn.sendMessage(m.chat, {
      text: `*[❗] Debes ingresar un texto para consultar a Replia.*\n*Ejemplo:* ${usedPrefix + command} Hola amigo`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  try {
    const respuestaApi = await consultarIaDelirius(text.trim(), {
      systemPrompt: 'Eres Replia, una IA amigable. Responde natural y en el idioma del usuario.',
      intentosPorProveedor: 2,
      incluirRipleai: true
    })

    if (!respuestaApi) {
      return conn.sendMessage(m.chat, {
        text: '*[❗] No se pudo obtener una respuesta de Replia.*',
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    await conn.sendMessage(m.chat, {
      text: respuestaApi,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  } catch (e) {
    console.error('Error en ia-replia:', e)
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
