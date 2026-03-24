/**
 * Sistema Anti-Document
 * Bloquea y elimina mensajes que contienen documentos
 */

export async function handleAntiDocument(m, conn, isAdmin) {
  if (!m.isGroup || !global.db.data.antiDocument || !global.db.data.antiDocument[m.chat]) return

  if (!m.message || (!m.message.documentMessage && !m.message.extendedTextMessage?.contextInfo?.quotedMessage?.documentMessage)) return

  
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
    } catch (error) {
      console.error('Error eliminando documento:', error)
    }
    return true
  }

  return false
}
