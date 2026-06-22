/**
 * Modo Humano Digital
 * Decide solo si ignorar, reaccionar o responder corto — como una persona real en WhatsApp
 */

import { isModeActive, normalizeChatId } from './modo-utils.js'

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))

// Serializa mensajes solo dentro del mismo grupo (sin cola global entre grupos).
const chatChains = new Map()
const CHAT_TASK_TIMEOUT_MS = 35000

function runPerChat(chatId, task) {
  const wrapped = () => Promise.race([
    Promise.resolve().then(task),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('timeout')), CHAT_TASK_TIMEOUT_MS)
    })
  ]).catch((err) => {
    console.error(`Modo Humano [${chatId}]:`, err?.message || err)
    return false
  })

  const prev = chatChains.get(chatId) || Promise.resolve()
  const run = prev.catch(() => false).then(wrapped)
  chatChains.set(chatId, run)
  run.finally(() => {
    if (chatChains.get(chatId) === run) chatChains.delete(chatId)
  })
  return run
}

async function simulateHumanTyping(conn, chat, message = '') {
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

export function isModoHumanActive(chatId) {
  return isModeActive('modoHuman', chatId)
}

export async function handleModoHuman(m, conn) {
  if (!m.isGroup || !isModoHumanActive(m.chat) || !m.text || m.fromMe) return false
  if (isModeActive('modoIA', m.chat) || isModeActive('modoHot', m.chat) || isModeActive('modoIlegal', m.chat)) {
    return false
  }

  const text = m.text.trim()
  if (text.length < 2) return false

  return runPerChat(normalizeChatId(m.chat), () => executeModoHuman(m, conn, text))
}

async function executeModoHuman(m, conn, text) {
  if (!isModoHumanActive(m.chat)) return false

  try {
    const { callGeminiHumanAPI, isLikelyCommand } = await import('../geminiAPI.js')

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

    const decision = await callGeminiHumanAPI(text, userName, groupName, m.chat)

    if (!decision || decision.action === 'ignore') return false

    if (decision.action === 'react' && decision.emoji) {
      await delay(700 + Math.floor(Math.random() * 1300))
      await conn.sendMessage(m.chat, {
        react: { text: decision.emoji, key: m.key }
      }).catch(() => {})
      return true
    }

    if (decision.action === 'reply' && decision.message) {
      await simulateHumanTyping(conn, m.chat, decision.message)

      await conn.sendMessage(m.chat, {
        text: decision.message,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })

      return true
    }

    return false
  } catch (error) {
    console.error('Error en Modo Humano:', error)
    return false
  }
}
