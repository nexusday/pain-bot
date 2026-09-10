/**
 * Modo Sad
 * Misma mecánica que Modo Humano: ignorar, reaccionar o responder corto.
 * Actitud: hombre triste / psicólogo oscuro.
 */

import { isModeActive, normalizeChatId, createChatGate, isPlainTextChatMessage } from './modo-utils.js'

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))

const sadGate = createChatGate({ label: 'Modo Sad' })

async function simulateSadTyping(conn, chat, message = '', isStale) {
  const ms = Math.min(4200, Math.max(1800, 1600 + String(message).length * 50 + Math.floor(Math.random() * 800)))

  await conn.sendPresenceUpdate('composing', chat).catch(() => {})

  let remaining = ms
  while (remaining > 0) {
    if (typeof isStale === 'function' && isStale()) {
      await conn.sendPresenceUpdate('paused', chat).catch(() => {})
      return false
    }
    const wait = Math.min(1200, remaining)
    await delay(wait)
    remaining -= wait
    if (remaining > 0) {
      await conn.sendPresenceUpdate('composing', chat).catch(() => {})
    }
  }

  await conn.sendPresenceUpdate('paused', chat).catch(() => {})
  return true
}

export function isModoSadActive(chatId) {
  return isModeActive('modoSad', chatId)
}

export async function handleModoSad(m, conn) {
  if (!m.isGroup || !isModoSadActive(m.chat) || m.fromMe) return false
  if (!isPlainTextChatMessage(m)) return false
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
  const isStale = job.isStale || (() => false)
  if (!m || !conn || !isModoSadActive(m.chat)) return false
  if (isStale()) return false

  try {
    const { callGeminiSadAPI, isLikelyCommand } = await import('../geminiAPI.js')

    const lastText = job.last?.text || ''
    if (isLikelyCommand(lastText)) return false
    if (/^[\s\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]*$/u.test(lastText)) {
      return false
    }

    if (isStale()) return false

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

    if (isStale()) return false
    if (!decision || decision.action === 'ignore') return false

    if (decision.action === 'react' && decision.emoji) {
      await delay(700 + Math.floor(Math.random() * 1100))
      if (isStale()) return false
      await conn.sendMessage(m.chat, {
        react: { text: decision.emoji, key: m.key }
      }).catch(() => {})
      return true
    }

    if (decision.action === 'reply' && decision.message) {
      const ok = await simulateSadTyping(conn, m.chat, decision.message, isStale)
      if (!ok || isStale()) return false

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
