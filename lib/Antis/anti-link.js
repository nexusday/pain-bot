/**
 * Sistema Anti-Link
 * Bloquea y elimina mensajes que contienen links
 */

import { shouldBypassAntiLinkForDescargas } from '../Modos/modo-descargas.js'
import { modoAnti, expulsarParticipante } from './anti-modo.js'
import { debeEnviarAvisoAnti } from './anti-aviso.js'

export async function manejarAntiLink(m, conn, esAdmin, rcanal) {
  if (!m.isGroup || !global.db.data.antiLink) return
  const modo = modoAnti(global.db.data.antiLink[m.chat], 'all')
  if (modo === 'off') return

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
    const quien = `@${m.sender.split('@')[0]}`
    const aviso = modo === 'all'
      ? `${quien} está prohibido links en este grupo, serás eliminado.`
      : `${quien} está prohibido links en este grupo. El mensaje fue eliminado.`
    try {
      await conn.sendMessage(m.chat, { delete: m.key })
    } catch (error) {
      console.error('Error eliminando mensaje con link:', error)
    }
    if (debeEnviarAvisoAnti(m.chat, m.sender, 'antilink')) {
      await conn.sendMessage(m.chat, {
        text: aviso,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [m.sender]
        }
      }).catch(() => {})
    }
    if (modo === 'all') await expulsarParticipante(conn, m.chat, m.sender, 'antilink')
    return true
  }

  return false
}

export {
  manejarAntiLink as handleAntiLink
}
