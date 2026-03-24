/**
 * Sistema Anti-Caracter
 * Bloquea mensajes que exceden el límite de caracteres establecido
 */

export async function handleAntiCaracter(m, conn, isAdmin, rcanal) {
  if (!m.isGroup || !global.db.data.antiCaracter || !global.db.data.antiCaracter[m.chat] || global.db.data.antiCaracter[m.chat].enabled !== true) return

  if (!m.text || m.text.length <= global.db.data.antiCaracter[m.chat].limit) return


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
