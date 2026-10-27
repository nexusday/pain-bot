/**
 * Sistema Anti-Caracter
 * Bloquea mensajes que exceden el límite de caracteres establecido
 */

import { modoAnti, expulsarParticipante } from './anti-modo.js'
import { debeEnviarAvisoAnti } from './anti-aviso.js'
import { verificarAdminAnti } from './anti-admin.js'
import { esComandoAnti } from './anti-command.js'

export async function manejarAntiCaracter(m, conn, esAdmin, rcanal, participants = []) {
  const cfg = global.db.data.antiCaracter?.[m.chat]
  if (!m.isGroup || !cfg || cfg.enabled !== true) return
  const modo = modoAnti(cfg, 'all')
  if (modo === 'off') return

  if (!m.text || m.text.length <= global.db.data.antiCaracter[m.chat].limit) return

  if (esComandoAnti(m)) return
  const permisos = await verificarAdminAnti(m, conn, participants)
  if (permisos.puedeModerar) {
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
