/**
 * Sistema Anti-Link
 * Bloquea y elimina mensajes que contienen links
 */

import { shouldBypassAntiLinkForDescargas } from '../Modos/modo-descargas.js'

export async function manejarAntiLink(m, conn, esAdmin, rcanal) {
  if (!m.isGroup || !global.db.data.antiLink || !global.db.data.antiLink[m.chat]) return

  const texto = m.text || ''
  const contieneLink = /(https?:\/\/[^\s]+|www\.[^\s]+)/i.test(texto)

  if (!contieneLink) return

  if (shouldBypassAntiLinkForDescargas(texto, m.chat)) return

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
        text: `@${m.sender.split('@')[0]} está prohibido links en este grupo, serás eliminado.`,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [m.sender]
        }
      }, { quoted: m })

      await conn.groupParticipantsUpdate(m.chat, [m.sender], 'remove')

    } catch (error) {
      console.error('Error en anti-link:', error)

      try {
        await conn.sendMessage(m.chat, { delete: m.key })
        await conn.sendMessage(m.chat, {
          text: `@${m.sender.split('@')[0]} está prohibido links en este grupo, serás eliminado.`,
          contextInfo: {
            ...rcanal.contextInfo,
            mentionedJid: [m.sender]
          }
        }, { quoted: m })
      } catch (e) {
        console.error('Error eliminando mensaje con link:', e)
      }
    }
    return true
  }

  return false
}

export {
  manejarAntiLink as handleAntiLink
}
