/**
 * Sistema Anti-Audio
 * Bloquea y elimina mensajes que contienen archivos de audio
 */

export async function manejarAntiAudio(m, conn, esAdmin) {
  if (!m.isGroup || !global.db.data.antiAudio || !global.db.data.antiAudio[m.chat]) return

  if (!m.message || (!m.message.audioMessage && !m.message.extendedTextMessage?.contextInfo?.quotedMessage?.audioMessage)) return

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
      console.error('Error eliminando audio:', error)
    }
    return true
  }

  return false
}

export {
  manejarAntiAudio as handleAntiAudio
}
