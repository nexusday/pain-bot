/**
 * Sistema Anti-Spam
 * Detecta y elimina mensajes de spam
 */

export async function handleAntiSpam(m, conn, isAdmin, rcanal) {
  if (!m.isGroup || !global.db.data.antiSpam || !global.db.data.antiSpam[m.chat]) return

  if (isAdmin) return false

  
  if (!global.db.data.spamCount) global.db.data.spamCount = {}
  if (!global.db.data.spamCount[m.chat]) global.db.data.spamCount[m.chat] = {}
  if (!global.db.data.spamCount[m.chat][m.sender]) {
    global.db.data.spamCount[m.chat][m.sender] = {
      count: 0,
      lastMessage: 0,
      messages: []
    }
  }

  const now = Date.now()
  const userSpam = global.db.data.spamCount[m.chat][m.sender]
  const timeDiff = now - userSpam.lastMessage

  if (timeDiff < 2000) {
    userSpam.count++
    userSpam.lastMessage = now
    userSpam.messages.push(m.key)

    if (userSpam.count >= 3) {
      try {
        
        for (const messageKey of userSpam.messages) {
          try {
            await conn.sendMessage(m.chat, { delete: messageKey })
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

       
        userSpam.count = 0
        userSpam.messages = []

      } catch (error) {
        console.error('Error en anti-spam:', error)
      }
      return true
    }
  } else {
   
    userSpam.count = 1
    userSpam.lastMessage = now
    userSpam.messages = [m.key]
  }

  return false
}
