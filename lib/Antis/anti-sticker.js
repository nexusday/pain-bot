/**
 * Sistema Anti-Sticker
 * Bloquea y elimina mensajes que contienen stickers
 */

export async function manejarAntiSticker(m, conn, esAdmin) {
  if (!m.isGroup || !global.db.data.antiSticker || !global.db.data.antiSticker[m.chat]) return

  if (!m.message || (!m.message.stickerMessage && !m.message.extendedTextMessage?.contextInfo?.quotedMessage?.stickerMessage)) return

  const escaparRegex = str => str.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&')
  let prefijo = global.prefix
  let esComando = (prefijo instanceof RegExp ?
    prefijo.test(m.text) :
    Array.isArray(prefijo) ?
      prefijo.some(p => new RegExp(escaparRegex(p)).test(m.text)) :
      typeof prefijo === 'string' ?
        new RegExp(escaparRegex(prefijo)).test(m.text) :
        false
  )

  if (esComando) return

  if (!esAdmin) {
    try {
      await conn.sendMessage(m.chat, { delete: m.key })
    } catch (error) {
      console.error('Error eliminando sticker:', error)
    }
    return true
  }

  return false
}

export {
  manejarAntiSticker as handleAntiSticker
}
