/**
 * Sistema Anti-Spam
 * Detecta y elimina mensajes de spam
 */

import { modoAnti, expulsarParticipante } from './anti-modo.js'
import { debeEnviarAvisoAnti } from './anti-aviso.js'

export async function manejarAntiSpam(m, conn, esAdmin, rcanal) {
  if (!m.isGroup || !global.db.data.antiSpam) return
  const modo = modoAnti(global.db.data.antiSpam[m.chat], 'all')
  if (modo === 'off') return

  if (esAdmin) return false

  if (!global.db.data.spamCount) global.db.data.spamCount = {}
  if (!global.db.data.spamCount[m.chat]) global.db.data.spamCount[m.chat] = {}
  if (!global.db.data.spamCount[m.chat][m.sender]) {
    global.db.data.spamCount[m.chat][m.sender] = {
      count: 0,
      lastMessage: 0,
      messages: [],
      active: false
    }
  }

  const ahora = Date.now()
  const spamUsuario = global.db.data.spamCount[m.chat][m.sender]
  const diferenciaTiempo = ahora - spamUsuario.lastMessage

  if (diferenciaTiempo >= 2000) {
    spamUsuario.count = 1
    spamUsuario.lastMessage = ahora
    spamUsuario.messages = [m.key]
    spamUsuario.active = false
    return false
  }

  spamUsuario.lastMessage = ahora
  if (spamUsuario.active) {
    await eliminarMensajesSpam([m.key], conn, m.chat)
    if (modo === 'all') await expulsarParticipante(conn, m.chat, m.sender, 'antispam')
    return true
  }

  spamUsuario.count++
  spamUsuario.messages.push(m.key)
  if (spamUsuario.count < 3) return false

  const mensajes = spamUsuario.messages
  spamUsuario.messages = []
  spamUsuario.active = true
  const debeAvisar = debeEnviarAvisoAnti(m.chat, m.sender, 'antispam')

  await eliminarMensajesSpam(mensajes, conn, m.chat)
  if (debeAvisar) {
    const quien = `@${m.sender.split('@')[0]}`
    await conn.sendMessage(m.chat, {
      text: modo === 'all'
        ? `${quien} no está permitido spam y será eliminado.`
        : `${quien} no está permitido el spam. Los mensajes fueron eliminados.`,
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: [m.sender]
      }
    }).catch(() => {})
  }

  if (modo === 'all') await expulsarParticipante(conn, m.chat, m.sender, 'antispam')
  return true
}

async function eliminarMensajesSpam(mensajes, conn, chat) {
  for (const claveMensaje of mensajes) {
    try {
      await conn.sendMessage(chat, { delete: claveMensaje })
    } catch (e) {
      console.error('Error eliminando mensaje de spam:', e)
    }
  }
}

export {
  manejarAntiSpam as handleAntiSpam
}
