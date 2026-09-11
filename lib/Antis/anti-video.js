/**
 * Sistema Anti-Video
 * Bloquea y elimina mensajes que contienen videos
 */

export async function manejarAntiVideo(m, conn, esAdmin) {
  if (!m.isGroup || !global.db.data.antiVideo || !global.db.data.antiVideo[m.chat]) return

  if (!m.message || (!m.message.videoMessage && !m.message.extendedTextMessage?.contextInfo?.quotedMessage?.videoMessage)) return

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
      console.error('Error eliminando video:', error)
    }
    return true
  }

  return false
}

export {
  manejarAntiVideo as handleAntiVideo
}
