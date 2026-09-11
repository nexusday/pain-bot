/**
 * Sistema Anti-Caracter
 * Bloquea mensajes que exceden el límite de caracteres establecido
 */

export async function manejarAntiCaracter(m, conn, esAdmin, rcanal) {
  if (!m.isGroup || !global.db.data.antiCaracter || !global.db.data.antiCaracter[m.chat] || global.db.data.antiCaracter[m.chat].enabled !== true) return

  if (!m.text || m.text.length <= global.db.data.antiCaracter[m.chat].limit) return

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
        text: `@${m.sender.split('@')[0]} el mensaje excede el límite de ${global.db.data.antiCaracter[m.chat].limit} caracteres permitidos, serás eliminado.`,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [m.sender]
        }
      }, { quoted: m })

      await conn.groupParticipantsUpdate(m.chat, [m.sender], 'remove')

    } catch (error) {
      console.error('Error en anti-caracteres:', error)

      try {
        await conn.sendMessage(m.chat, { delete: m.key })
        await conn.sendMessage(m.chat, {
          text: `@${m.sender.split('@')[0]} el mensaje excede el límite de ${global.db.data.antiCaracter[m.chat].limit} caracteres permitidos, serás eliminado.`,
          contextInfo: {
            ...rcanal.contextInfo,
            mentionedJid: [m.sender]
          }
        }, { quoted: m })
      } catch (e) {
        console.error('Error eliminando mensaje con caracteres excesivos:', e)
      }
    }
    return true
  }

  return false
}

export {
  manejarAntiCaracter as handleAntiCaracter
}
