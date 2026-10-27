/**
 * Sistema Anti-Mention
 * Bloquea y elimina mensajes que contienen menciones
 */

import { modoAnti, expulsarParticipante } from './anti-modo.js'
import { debeEnviarAvisoAnti } from './anti-aviso.js'
import { verificarAdminAnti } from './anti-admin.js'
import { esComandoAnti } from './anti-command.js'

export async function manejarAntiMencion(m, conn, esAdmin, rcanal, participants = []) {
  if (!m.isGroup || !global.db.data.antiMention) return
  const modo = modoAnti(global.db.data.antiMention[m.chat], 'del')
  if (modo === 'off') return

  if (!m.message || !m.message.extendedTextMessage || !m.message.extendedTextMessage.contextInfo || !m.message.extendedTextMessage.contextInfo.mentionedJid || m.message.extendedTextMessage.contextInfo.mentionedJid.length === 0) return

  if (esComandoAnti(m)) return
  const permisos = await verificarAdminAnti(m, conn, participants)
  if (permisos.puedeModerar) {
    try {
      await conn.sendMessage(m.chat, { delete: m.key })

      if (debeEnviarAvisoAnti(m.chat, m.sender, 'antimention')) {
        await conn.sendMessage(m.chat, {
          text: modo === 'all'
            ? `@${m.sender.split('@')[0]} las menciones están prohibidas, serás eliminado.`
            : `@${m.sender.split('@')[0]} las menciones están prohibidas.`,
          contextInfo: {
            ...rcanal.contextInfo,
            mentionedJid: [m.sender]
          }
        }).catch(() => {})
      }
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
