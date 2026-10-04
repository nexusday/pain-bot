import { buildGrokApiUrl, extractGrokResult, formatGrokPrompt } from '../lib/grok-api.js'
import { tr } from '../lib/lang.js'

const TIMEOUT_MS = 45_000

let handler = async (m, { conn, text, usedPrefix, command }) => {
  const prompt = text?.trim()
  if (!prompt) {
    return conn.sendMessage(m.chat, {
      text: `*[❗] ${tr(conn, 'Escribe una pregunta para Grok.', 'Write a question for Grok.', 'Escreva uma pergunta para o Grok.')}*\n*${tr(conn, 'Ejemplo', 'Example', 'Exemplo')}:* ${usedPrefix + command} ${tr(conn, '¿Qué es la inteligencia artificial?', 'What is artificial intelligence?', 'O que é inteligência artificial?')}`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  try {
    const url = buildGrokApiUrl(global.APIs.qasim, '/api/groq/ai', formatGrokPrompt(prompt))
    const respuesta = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!respuesta.ok) throw new Error(`API Grok respondió HTTP ${respuesta.status}`)

    const resultado = extractGrokResult(await respuesta.json())
    if (!resultado) {
      return conn.sendMessage(m.chat, {
        text: `*[❗] ${tr(conn, 'Grok no devolvió una respuesta válida.', 'Grok did not return a valid response.', 'Grok não retornou uma resposta válida.')}*`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    return conn.sendMessage(m.chat, {
      text: resultado,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  } catch (error) {
    console.error('Error en comando Grok:', error?.message || error)
    return conn.sendMessage(m.chat, {
      text: `*[❌] ${tr(conn, 'No se pudo consultar Grok. Inténtalo de nuevo más tarde.', 'Could not reach Grok. Please try again later.', 'Não foi possível consultar o Grok. Tente novamente mais tarde.')}*`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }
}

handler.help = ['#grok <texto>']
handler.tags = ['inteligencia']
handler.command = ['grok']

export default handler
