/**
 * Modo Psico
 * Misma mecánica que Modo Humano: ignorar, reaccionar (emoji por contexto) o responder.
 * Actitud: psicólogo de alto nivel, humano, neutro/oscuro según el tema.
 */

import { isModeActive, normalizeChatId, createChatGate } from './modo-utils.js'

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))

const psicoGate = createChatGate({ label: 'Modo Psico' })

async function simulatePsicoTyping(conn, chat, message = '') {
  const ms = Math.min(6000, Math.max(2200, 1900 + String(message).length * 50 + Math.floor(Math.random() * 900)))

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

export function isModoPsicoActive(chatId) {
  return isModeActive('modoPsico', chatId)
}

export async function handleModoPsico(m, conn) {
  if (!m.isGroup || !isModoPsicoActive(m.chat) || !m.text || m.fromMe) return false
  if (
    isModeActive('modoIA', m.chat) ||
    isModeActive('modoHot', m.chat) ||
    isModeActive('modoIlegal', m.chat) ||
    isModeActive('modoHuman', m.chat) ||
    isModeActive('modoSad', m.chat)
  ) {
    return false
  }

  const text = m.text.trim()
  if (text.length < 2) return false

  return psicoGate.schedule(
    normalizeChatId(m.chat),
    { m, conn, text },
    (job) => executeModoPsico(job.m, job.conn, job.text)
  )
}

async function executeModoPsico(m, conn, text) {
  if (!isModoPsicoActive(m.chat)) return false

  try {
    const { callGeminiPsicoAPI, isLikelyCommand } = await import('../geminiAPI.js')

    if (isLikelyCommand(text)) return false
    if (/^[\s\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]*$/u.test(text)) {
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

    const decision = await callGeminiPsicoAPI(text, userName, groupName, m.chat)

    if (!decision || decision.action === 'ignore') return false

    // Reacciones solo las que decide la API (como modo humano), sin emoji por defecto
    if (decision.action === 'react' && decision.emoji) {
      await delay(700 + Math.floor(Math.random() * 1300))
      await conn.sendMessage(m.chat, {
        react: { text: decision.emoji, key: m.key }
      }).catch(() => {})
      return true
    }

    if (decision.action === 'reply' && decision.message) {
      await simulatePsicoTyping(conn, m.chat, decision.message)

      await conn.sendMessage(m.chat, {
        text: decision.message,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })

      return true
    }

    return false
  } catch (error) {
    console.error('Error en Modo Psico:', error)
    return false
  }
}
