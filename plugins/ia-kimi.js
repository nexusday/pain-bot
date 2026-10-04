import { buildKimiApiUrl, extractKimiResult, formatKimiPrompt } from '../lib/kimi-api.js'
import { tr } from '../lib/lang.js'

const TIMEOUT_MS = 45_000

let handler = async (m, { conn, text, usedPrefix, command }) => {
  const prompt = text?.trim()
  if (!prompt) {
    return conn.sendMessage(m.chat, {
      text: `*[❗] ${tr(conn, 'Escribe una pregunta para Kimi.', 'Write a question for Kimi.', 'Escreva uma pergunta para o Kimi.')}*\n*${tr(conn, 'Ejemplo', 'Example', 'Exemplo')}:* ${usedPrefix + command} ${tr(conn, '¿Qué puedes hacer?', 'What can you do?', 'O que você pode fazer?')}`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  try {
    const url = buildKimiApiUrl(global.APIs.qasim, '/api/kimi/ai', formatKimiPrompt(prompt))
    const respuesta = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!respuesta.ok) throw new Error(`API Kimi respondió HTTP ${respuesta.status}`)

    const resultado = extractKimiResult(await respuesta.json())
    if (!resultado) {
      return conn.sendMessage(m.chat, {
        text: `*[❗] ${tr(conn, 'Kimi no devolvió una respuesta válida.', 'Kimi did not return a valid response.', 'Kimi não retornou uma resposta válida.')}*`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    return conn.sendMessage(m.chat, {
      text: resultado,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  } catch (error) {
    console.error('Error en comando Kimi:', error?.message || error)
    return conn.sendMessage(m.chat, {
      text: `*[❌] ${tr(conn, 'No se pudo consultar Kimi. Inténtalo de nuevo más tarde.', 'Could not reach Kimi. Please try again later.', 'Não foi possível consultar o Kimi. Tente novamente mais tarde.')}*`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }
}

handler.help = ['#kimi <texto>']
handler.tags = ['inteligencia']
handler.command = ['kimi']

export default handler
