/**
 * Sistema Anti-Link
 * Bloquea y elimina mensajes que contienen links
 */

export async function handleAntiLink(m, conn, isAdmin, rcanal) {
  if (!m.isGroup || !global.db.data.antiLink || !global.db.data.antiLink[m.chat]) return

  const text = m.text || ''
  const contieneLink = /(https?:\/\/[^\s]+|www\.[^\s]+)/i.test(text)

  if (!contieneLink) return

 
  const str2Regex = str => str.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&')
  let _prefix = global.prefix
  let isCommand = (_prefix instanceof RegExp ?
    _prefix.test(m.text) :
    Array.isArray(_prefix) ?
      _prefix.some(p => new RegExp(str2Regex(p)).test(m.text)) :
      typeof _prefix === 'string' ?
        new RegExp(str2Regex(_prefix)).test(m.text) :
        false
  )

  if (isCommand) return

  if (!isAdmin) {
    try {
      await conn.sendMessage(m.chat, { delete: m.key })

      await conn.sendMessage(m.chat, {
        text: `@${m.sender.split('@')[0]} está prohibido links en este grupo, serás eliminado.`,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [m.sender]
        }
      }, { quoted: m })

      await conn.groupParticipantsUpdate(m.chat, [m.sender], 'remove')

    } catch (error) {
      console.error('Error en anti-link:', error)

      try {
        await conn.sendMessage(m.chat, { delete: m.key })
        await conn.sendMessage(m.chat, {
          text: `@${m.sender.split('@')[0]} está prohibido links en este grupo, serás eliminado.`,
          contextInfo: {
            ...rcanal.contextInfo,
            mentionedJid: [m.sender]
          }
        }, { quoted: m })
      } catch (e) {
        console.error('Error eliminando mensaje con link:', e)
      }
    }
    return true
  }

  return false
}
