/**
 * Sistema Anti-Imagen
 * Bloquea y elimina mensajes que contienen imágenes
 */

export async function manejarAntiImg(m, conn, esAdmin) {
  if (!m.isGroup || !global.db.data.antiImg || !global.db.data.antiImg[m.chat]) return

  if (!m.message || (!m.message.imageMessage && !m.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage)) return

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
      console.error('Error eliminando imagen:', error)
    }
    return true
  }

  return false
}

export {
  manejarAntiImg as handleAntiImg
}
