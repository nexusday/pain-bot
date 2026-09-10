/**
 * Modo Sad
 * Misma mecánica que Modo Humano: ignorar, reaccionar o responder corto.
 * Actitud: hombre triste / psicólogo oscuro.
 */

import { isModeActive, normalizeChatId, createChatGate } from './modo-utils.js'

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))

const sadGate = createChatGate({ label: 'Modo Sad' })

async function simulateSadTyping(conn, chat, message = '') {
  const ms = Math.min(5000, Math.max(2000, 1800 + String(message).length * 55 + Math.floor(Math.random() * 900)))

  await conn.sendPresenceUpdate('composing', chat).catch(() => {})

  let remaining = ms
  while (remaining > 0) {
    const wait = Math.min(2500, remaining)
    await delay(wait)
    remaining -= wait
    if (remaining > 0) {
      await conn.sendPresenceUpdate('composing', chat).catch(() => {})
    }
  }

  await conn.sendPresenceUpdate('paused', chat).catch(() => {})
}

export function isModoSadActive(chatId) {
  return isModeActive('modoSad', chatId)
}

export async function handleModoSad(m, conn) {
  if (!m.isGroup || !isModoSadActive(m.chat) || !m.text || m.fromMe) return false
  if (
    isModeActive('modoIA', m.chat) ||
    isModeActive('modoHot', m.chat) ||
    isModeActive('modoIlegal', m.chat) ||
    isModeActive('modoHuman', m.chat) ||
    isModeActive('modoPsico', m.chat)
  ) {
    return false
  }

  const text = m.text.trim()
  if (text.length < 2) return false

  return sadGate.schedule(
    normalizeChatId(m.chat),
    { m, conn, text },
    (job) => executeModoSad(job)
  )
}

async function executeModoSad(job) {
  const m = job.m
  const conn = job.conn
  const text = job.text
  if (!m || !conn || !isModoSadActive(m.chat)) return false

  try {
    const { callGeminiSadAPI, isLikelyCommand } = await import('../geminiAPI.js')

    const lastText = job.last?.text || ''
    if (isLikelyCommand(lastText)) return false
    if (/^[\s\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]*$/u.test(lastText)) {
      return false
    }

    const rcanal = global.rcanal || {
      contextInfo: {
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
          newsletterJid: '',
          serverMessageId: 100,
          newsletterName: ''
        }
      }
    }

    const userName = m.pushName || m.name || 'Usuario'
    const groupName = await conn.getName(m.chat) || 'Grupo'

    const decision = await callGeminiSadAPI(text, userName, groupName, m.chat)

    if (!decision || decision.action === 'ignore') return false

    if (decision.action === 'react' && decision.emoji) {
      await delay(1100 + Math.floor(Math.random() * 1800))
      await conn.sendMessage(m.chat, {
        react: { text: decision.emoji, key: m.key }
      }).catch(() => {})
      return true
    }

    if (decision.action === 'reply' && decision.message) {
      await simulateSadTyping(conn, m.chat, decision.message)

      await conn.sendMessage(m.chat, {
        text: decision.message,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })

      return true
    }

    return false
  } catch (error) {
    console.error('Error en Modo Sad:', error)
    return false
  }
}
