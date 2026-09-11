/**
 * Sistema Anti-Contact
 * Bloquea y elimina mensajes que contienen contactos
 */

export async function manejarAntiContacto(m, conn, esAdmin) {
  if (!m.isGroup || !global.db.data.antiContact || !global.db.data.antiContact[m.chat]) return

  if (!m.message || (!m.message.contactMessage && !m.message.extendedTextMessage?.contextInfo?.quotedMessage?.contactMessage)) return

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
      console.error('Error eliminando contacto:', error)
    }
    return true
  }

  return false
}

export {
  manejarAntiContacto as handleAntiContact
}
