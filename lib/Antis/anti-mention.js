/**
 * Sistema Anti-Mention
 * Bloquea y elimina mensajes que contienen menciones
 */

export async function handleAntiMention(m, conn, isAdmin, rcanal) {
  if (!m.isGroup || !global.db.data.antiMention || !global.db.data.antiMention[m.chat]) return

  if (!m.message || !m.message.extendedTextMessage || !m.message.extendedTextMessage.contextInfo || !m.message.extendedTextMessage.contextInfo.mentionedJid || m.message.extendedTextMessage.contextInfo.mentionedJid.length === 0) return

 
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
        text: `@${m.sender.split('@')[0]} las menciones están prohibidas.`,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [m.sender]
        }
      }, { quoted: m })

    } catch (error) {
      console.error('Error en anti-menciones:', error)
    }
    return true 
  }

  return false
}
