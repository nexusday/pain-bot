import axios from 'axios'

async function consultarRipleai(texto) {
  const { data } = await axios.get(
    `https://api.delirius.online/ia/ripleai?query=${encodeURIComponent(texto)}`,
    { timeout: 45000 }
  )
  if (!data?.status) return ''
  if (typeof data.data?.result === 'string') return data.data.result.trim()
  if (typeof data.data === 'string') return data.data.trim()
  if (typeof data.text === 'string') return data.text.trim()
  return ''
}

async function consultarChatgpt(texto) {
  for (let i = 0; i < 2; i++) {
    const { data } = await axios.get(
      `https://api.delirius.online/ia/chatgpt?q=${encodeURIComponent(texto)}`,
      { timeout: 60000 }
    )
    if (!data?.status) continue
    const t = typeof data.data === 'string' ? data.data.trim() : ''
    if (t && !/^error:/i.test(t)) return t
  }
  return ''
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text?.trim()) {
    return conn.sendMessage(m.chat, {
      text: `*[❗] Debes ingresar un texto para consultar a Replia.*\n*Ejemplo:* ${usedPrefix + command} Hola amigo`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  try {
    const consulta = text.trim()
    let respuestaApi = ''

    try {
      respuestaApi = await consultarRipleai(consulta)
    } catch (e) {
      console.warn('ripleai falló, usando chatgpt:', e?.message || e)
    }

    if (!respuestaApi) {
      respuestaApi = await consultarChatgpt(consulta)
    }

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
