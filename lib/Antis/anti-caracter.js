/**
 * Sistema Anti-Caracter
 * Bloquea mensajes que exceden el límite de caracteres establecido
 */

import { modoAnti, expulsarParticipante } from './anti-modo.js'
import { debeEnviarAvisoAnti } from './anti-aviso.js'

export async function manejarAntiCaracter(m, conn, esAdmin, rcanal) {
  const cfg = global.db.data.antiCaracter?.[m.chat]
  if (!m.isGroup || !cfg || cfg.enabled !== true) return
  const modo = modoAnti(cfg, 'all')
  if (modo === 'off') return

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
    const limite = global.db.data.antiCaracter[m.chat].limit
    const quien = `@${m.sender.split('@')[0]}`
    const aviso = modo === 'all'
      ? `${quien} el mensaje excede el límite de ${limite} caracteres permitidos, serás eliminado.`
      : `${quien} el mensaje excede el límite de ${limite} caracteres permitidos. El mensaje fue eliminado.`
    try {
      await conn.sendMessage(m.chat, { delete: m.key })
    } catch (error) {
      console.error('Error eliminando mensaje con caracteres excesivos:', error)
    }
    if (debeEnviarAvisoAnti(m.chat, m.sender, 'anticaracter')) {
      await conn.sendMessage(m.chat, {
        text: aviso,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [m.sender]
        }
      }).catch(() => {})
    }
    if (modo === 'all') await expulsarParticipante(conn, m.chat, m.sender, 'anticaracter')
    return true
  }

  return false
}

export {
  manejarAntiCaracter as handleAntiCaracter
}
