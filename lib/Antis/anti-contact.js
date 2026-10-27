/**
 * Sistema Anti-Contact
 * Bloquea y elimina mensajes que contienen contactos
 */

import { modoAnti, expulsarParticipante } from './anti-modo.js'
import { verificarAdminAnti } from './anti-admin.js'
import { esComandoAnti } from './anti-command.js'

export async function manejarAntiContacto(m, conn, esAdmin, participants = []) {
  if (!m.isGroup || !global.db.data.antiContact) return
  const modo = modoAnti(global.db.data.antiContact[m.chat], 'del')
  if (modo === 'off') return

  if (!m.message || (!m.message.contactMessage && !m.message.extendedTextMessage?.contextInfo?.quotedMessage?.contactMessage)) return

  if (esComandoAnti(m)) return
  const permisos = await verificarAdminAnti(m, conn, participants)
  if (permisos.puedeModerar) {
    try {
      await conn.sendMessage(m.chat, { delete: m.key })
      if (modo === 'all') await expulsarParticipante(conn, m.chat, m.sender, 'anticontact')
    } catch (error) {
      console.error('Error eliminando contacto:', error)
    }
    return true
  }

  return false
}

export {
  manejarAntiContacto as handleAntiContact
}
