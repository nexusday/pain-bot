/**
 * Sistema Anti-Document
 * Bloquea y elimina mensajes que contienen documentos
 */

export async function manejarAntiDocumento(m, conn, esAdmin) {
  if (!m.isGroup || !global.db.data.antiDocument || !global.db.data.antiDocument[m.chat]) return

  if (!m.message || (!m.message.documentMessage && !m.message.extendedTextMessage?.contextInfo?.quotedMessage?.documentMessage)) return

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
      console.error('Error eliminando documento:', error)
    }
    return true
  }

  return false
}

export {
  manejarAntiDocumento as handleAntiDocument
}
