/**
 * Modo IA Ilegal
 * Respuestas automáticas con contenido sin restricciones usando Gemini AI
 */

import { isModeActive, normalizeChatId, createChatGate, isPlainTextChatMessage } from './modo-utils.js'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const ilegalGate = createChatGate({ label: 'Modo Ilegal' })

export async function handleModoIlegal(m, conn) {
  if (!m.isGroup || !isModeActive('modoIlegal', m.chat) || m.fromMe) return false
  if (!isPlainTextChatMessage(m)) return false
  if (isModeActive('modoHuman', m.chat) || isModeActive('modoSad', m.chat) || isModeActive('modoPsico', m.chat)) return false
  if (isModeActive('modoIA', m.chat) || isModeActive('modoHot', m.chat)) return false

  const text = m.text.trim()
  if (text.length < 4) return false

  return ilegalGate.schedule(
    normalizeChatId(m.chat),
    { m, conn, text },
    (job) => executeModoIlegal(job)
  )
}

async function executeModoIlegal(job) {
  const m = job.m
  const conn = job.conn
  const text = job.text
  const isStale = job.isStale || (() => false)
  if (!m || !conn || !isModeActive('modoIlegal', m.chat)) return false
  if (isStale()) return false

  try {
    const { callGeminiIlegalAPI, isLikelyCommand } = await import('../geminiAPI.js')

    const lastText = job.last?.text || ''
    if (isLikelyCommand(lastText)) return false
    if (lastText.trim().length < 4) return false

    if (isStale()) return false

    const rcanal = global.rcanal || {
      contextInfo: {
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
          newsletterJid: '120363423390538090@newsletter',
          serverMessageId: 100,
          newsletterName: '༼ 𝙋𝙖𝙞𝙣 𝘾𝙤𝙢𝙢𝙪𝙣𝙞𝙩𝙮 ༽'
        }
      }
    }

    const userName = m.pushName || m.name || 'Usuario'
    const groupName = await conn.getName(m.chat) || 'Grupo'

    await conn.sendPresenceUpdate('composing', m.chat).catch(() => {})

    const response = await callGeminiIlegalAPI(text, userName, groupName, m.chat)

    if (isStale()) {
      await conn.sendPresenceUpdate('paused', m.chat).catch(() => {})
      return false
    }

    if (response && response.length > 0) {
      await delay(400 + Math.floor(Math.random() * 500))
      if (isStale()) {
        await conn.sendPresenceUpdate('paused', m.chat).catch(() => {})
        return false
      }

      await conn.sendPresenceUpdate('paused', m.chat).catch(() => {})
      await conn.sendMessage(m.chat, {
        text: response,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
      return true
    }

    await conn.sendPresenceUpdate('paused', m.chat).catch(() => {})
    return false
  } catch (error) {
    console.error('Error en Modo Ilegal:', error)
    return false
  }
}
