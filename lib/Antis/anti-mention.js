/**
 * Sistema Anti-Mention
 * Bloquea y elimina mensajes que contienen menciones
 */

import { modoAnti, expulsarParticipante } from './anti-modo.js'

export async function manejarAntiMencion(m, conn, esAdmin, rcanal) {
  if (!m.isGroup || !global.db.data.antiMention) return
  const modo = modoAnti(global.db.data.antiMention[m.chat], 'del')
  if (modo === 'off') return

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
        text: modo === 'all'
          ? `@${m.sender.split('@')[0]} las menciones están prohibidas, serás eliminado.`
          : `@${m.sender.split('@')[0]} las menciones están prohibidas.`,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [m.sender]
        }
      }).catch(() => {})
      if (modo === 'all') await expulsarParticipante(conn, m.chat, m.sender, 'antimention')

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
