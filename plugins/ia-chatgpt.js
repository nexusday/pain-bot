import axios from 'axios'

function respuestaUtil(valor) {
  const t = typeof valor === 'string' ? valor.trim() : ''
  if (!t) return ''
  if (/^error:/i.test(t)) return ''
  return t
}

function formatearRespuestaChatgpt(respuestaApi) {
  let pensamiento = ''
  let respuestaFinal = respuestaApi

  const coincidenciaPensamiento = respuestaApi.match(/<think>([\s\S]*?)<\/think>/)
  if (coincidenciaPensamiento) {
    pensamiento = coincidenciaPensamiento[1].trim()
    respuestaFinal = respuestaApi.replace(/<think>[\s\S]*?<\/think>/, '').trim()
  }

  let mensajeFormateado = ''
  if (pensamiento) {
    const pensamientoLimpio = pensamiento.replace(/\n+/g, ' ').trim()
    mensajeFormateado += `> *Su pensamiento:* ${pensamientoLimpio}\n\n`
  }
  mensajeFormateado += respuestaFinal
  return mensajeFormateado
}

async function consultarChatgpt(texto, intentos = 2) {
  let ultimo = ''
  for (let i = 0; i < intentos; i++) {
    const { data } = await axios.get(
      `https://api.delirius.online/ia/chatgpt?q=${encodeURIComponent(texto)}`,
      { timeout: 60000 }
    )
    if (!data?.status) continue
    ultimo = respuestaUtil(data.data)
    if (ultimo) return ultimo
  }
  return ultimo
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text) {
    return conn.sendMessage(m.chat, {
      text: `*[❗] Debes ingresar un texto para consultar a ChatGPT.*\n*Ejemplo:* ${usedPrefix + command} ¿Quién eres?`,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }

  try {
    const respuestaApi = await consultarChatgpt(text)

    if (!respuestaApi) {
      return conn.sendMessage(m.chat, {
        text: '*[❗] No se pudo obtener una respuesta de la API.*',
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }

    await conn.sendMessage(m.chat, {
      text: formatearRespuestaChatgpt(respuestaApi),
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  } catch (e) {
    console.error('Error en comando chatgpt:', e)
    conn.sendMessage(m.chat, {
      text: '*[❗] Ocurrió un error al procesar tu consulta. Por favor, inténtalo de nuevo más tarde.*',
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
}

handler.help = ['#chatgpt <texto>']
handler.tags = ['inteligencia']
handler.command = ['gpt', 'chatgpt', 'ia']

export default handler
