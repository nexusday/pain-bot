import { buildQwenApiUrl, extractQwenResult, formatQwenPrompt } from '../lib/qwen-api.js'
import { tr } from '../lib/lang.js'

const TIMEOUT_MS = 45_000

let handler = async (m, { conn, text, usedPrefix, command }) => {
  const prompt = text?.trim()
  if (!prompt) {
    return conn.sendMessage(m.chat, {
      text: `*[❗] ${tr(conn, 'Escribe una pregunta para Qwen.', 'Write a question for Qwen.', 'Escreva uma pergunta para o Qwen.')}*\n*${tr(conn, 'Ejemplo', 'Example', 'Exemplo')}:* ${usedPrefix + command} ${tr(conn, '¿Qué es la inteligencia artificial?', 'What is artificial intelligence?', 'O que é inteligência artificial?')}`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  try {
    const url = buildQwenApiUrl(global.APIs.qasim, '/api/openrouter/qwen', formatQwenPrompt(prompt))
    const respuesta = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!respuesta.ok) throw new Error(`API Qwen respondió HTTP ${respuesta.status}`)

    const resultado = extractQwenResult(await respuesta.json())
    if (!resultado) {
      return conn.sendMessage(m.chat, {
        text: `*[❗] ${tr(conn, 'Qwen no devolvió una respuesta válida.', 'Qwen did not return a valid response.', 'Qwen não retornou uma resposta válida.')}*`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    return conn.sendMessage(m.chat, {
      text: resultado,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  } catch (error) {
    console.error('Error en comando Qwen:', error?.message || error)
    return conn.sendMessage(m.chat, {
      text: `*[❌] ${tr(conn, 'No se pudo consultar Qwen. Inténtalo de nuevo más tarde.', 'Could not reach Qwen. Please try again later.', 'Não foi possível consultar o Qwen. Tente novamente mais tarde.')}*`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }
}

handler.help = ['#qwen <texto>']
handler.tags = ['inteligencia']
handler.command = ['qwen']

export default handler
