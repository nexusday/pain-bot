/**
 * Sistema Anti-Mention
 * Bloquea y elimina mensajes que contienen menciones
 */

export async function manejarAntiMencion(m, conn, esAdmin, rcanal) {
  if (!m.isGroup || !global.db.data.antiMention || !global.db.data.antiMention[m.chat]) return

  if (!m.message || !m.message.extendedTextMessage || !m.message.extendedTextMessage.contextInfo || !m.message.extendedTextMessage.contextInfo.mentionedJid || m.message.extendedTextMessage.contextInfo.mentionedJid.length === 0) return

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

export {
  manejarAntiMencion as handleAntiMention
}
