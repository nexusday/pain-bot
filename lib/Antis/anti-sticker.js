/**
 * Sistema Anti-Sticker
 * Bloquea y elimina mensajes que contienen stickers
 */

export async function handleAntiSticker(m, conn, isAdmin) {
  if (!m.isGroup || !global.db.data.antiSticker || !global.db.data.antiSticker[m.chat]) return

  if (!m.message || (!m.message.stickerMessage && !m.message.extendedTextMessage?.contextInfo?.quotedMessage?.stickerMessage)) return


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
      console.error('Error eliminando sticker:', error)
    }
    return true 
  }

  return false
}
