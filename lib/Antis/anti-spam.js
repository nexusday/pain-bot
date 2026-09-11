/**
 * Sistema Anti-Spam
 * Detecta y elimina mensajes de spam
 */

export async function manejarAntiSpam(m, conn, esAdmin, rcanal) {
  if (!m.isGroup || !global.db.data.antiSpam || !global.db.data.antiSpam[m.chat]) return

  if (esAdmin) return false

  if (!global.db.data.spamCount) global.db.data.spamCount = {}
  if (!global.db.data.spamCount[m.chat]) global.db.data.spamCount[m.chat] = {}
  if (!global.db.data.spamCount[m.chat][m.sender]) {
    global.db.data.spamCount[m.chat][m.sender] = {
      count: 0,
      lastMessage: 0,
      messages: []
    }
  }

  const ahora = Date.now()
  const spamUsuario = global.db.data.spamCount[m.chat][m.sender]
  const diferenciaTiempo = ahora - spamUsuario.lastMessage

  if (diferenciaTiempo < 2000) {
    spamUsuario.count++
    spamUsuario.lastMessage = ahora
    spamUsuario.messages.push(m.key)

    if (spamUsuario.count >= 3) {
      try {
        for (const claveMensaje of spamUsuario.messages) {
          try {
            await conn.sendMessage(m.chat, { delete: claveMensaje })
          } catch (e) {
            console.error('Error eliminando mensaje de spam:', e)
          }
        }

        await conn.sendMessage(m.chat, {
          text: `@${m.sender.split('@')[0]} no está permitido spam y será eliminado.`,
          contextInfo: {
            ...rcanal.contextInfo,
            mentionedJid: [m.sender]
          }
        }, { quoted: m })

        await conn.groupParticipantsUpdate(m.chat, [m.sender], 'remove')

        spamUsuario.count = 0
        spamUsuario.messages = []

      } catch (error) {
        console.error('Error en anti-spam:', error)
      }
      return true
    }
  } else {
    spamUsuario.count = 1
    spamUsuario.lastMessage = ahora
    spamUsuario.messages = [m.key]
  }

  return false
}

export {
  manejarAntiSpam as handleAntiSpam
}
