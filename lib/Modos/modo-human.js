/**
 * Modo Humano Digital
 * Decide solo si ignorar, reaccionar o responder corto — como una persona real en WhatsApp
 */

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))

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

export async function handleModoHuman(m, conn) {
  if (!m.isGroup || !global.db.data.modoHuman?.[m.chat] || !m.text || m.fromMe) return false
  if (global.db.data.modoIA?.[m.chat] || global.db.data.modoHot?.[m.chat] || global.db.data.modoIlegal?.[m.chat]) return false

  try {
    const { callGeminiHumanAPI, isLikelyCommand } = await import('../geminiAPI.js')

    if (isLikelyCommand(m.text)) return false

    const text = m.text.trim()

    if (text.length < 2) return false
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
