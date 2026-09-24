import {
  parseRentalTime,
  saveRental,
  savePermanentRental,
  removeRental,
  buildRentalStatusText,
  formatDuration,
  formatRemainingDetailed,
  resolvePermanentRentalType
} from '../lib/alquiler.js'
import { esOwnerConfig } from '../lib/staff.js'

let handler = async (m, { conn, args, usedPrefix, command, isOwner }) => {
  if (!isOwner) {
    return conn.sendMessage(m.chat, {
      text: '[❗] Este comando solo puede ser usado por el owner del bot.',
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  if (!m.isGroup) {
    return conn.sendMessage(m.chat, {
      text: '[❗] Este comando solo funciona en grupos.',
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  const esPrincipal = esOwnerConfig(m, conn)
  const accion = (args[0] || '').toLowerCase().trim()
  const nombreGrupo = (await conn.groupMetadata(m.chat).catch(() => null))?.subject || await conn.getName(m.chat).catch(() => 'Grupo')

  if (!accion) {
    return conn.sendMessage(m.chat, {
      text: buildRentalStatusText(m.chat, nombreGrupo),
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  if (['del', 'delete', 'remove', 'quitar', 'off'].includes(accion)) {
    await removeRental(m.chat)
    return conn.sendMessage(m.chat, {
      text: `🗑️ *Acceso quitado*\n\n> *Grupo:* ${nombreGrupo}\n> El bot quedó sin activar en este grupo.`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  const tipoPermanente = resolvePermanentRentalType(accion)
  if (tipoPermanente) {
    if (tipoPermanente === 'oficial' && !esPrincipal) {
      return conn.sendMessage(m.chat, {
        text: '[❗] Solo el *owner principal* puede activar el modo *oficial*.',
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    await savePermanentRental(m.chat, tipoPermanente, m.sender)

    const etiqueta = tipoPermanente === 'official' ? 'oficial · permanente' : 'activo · permanente'

    return conn.sendMessage(m.chat, {
      text: `✅ *Bot activado*\n\n> *Grupo:* ${nombreGrupo}\n> *Tipo:* ${etiqueta}\n> *Tiempo:* sin límite\n> *Por:* @${m.sender.split('@')[0]}`,
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: [m.sender]
      }
    }, { quoted: m })
  }

  const duracionMs = parseRentalTime(args.join(' ').trim() || accion)
  if (!duracionMs) {
    const uso = esPrincipal
      ? `*[❗] Uso:*\n\n` +
        `> ${usedPrefix + command} on → permanente\n` +
        `> ${usedPrefix + command} off → desactivar\n` +
        `> ${usedPrefix + command} 1h\n` +
        `> ${usedPrefix + command} 1d\n` +
        `> ${usedPrefix + command} 30m\n` +
        `> ${usedPrefix + command} oficial\n\n` +
        `Sin argumento muestra el estado.`
      : `*[❗] Uso:*\n\n` +
        `> ${usedPrefix + command} on → permanente\n` +
        `> ${usedPrefix + command} off → desactivar\n\n` +
        `Sin argumento muestra el estado.\n` +
        `_Tiempo y oficial solo los pone el owner principal._`

    return conn.sendMessage(m.chat, {
      text: uso,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  if (!esPrincipal) {
    return conn.sendMessage(m.chat, {
      text: '[❗] Solo el *owner principal* puede activar el bot con tiempo limitado.',
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  try {
    const alquiler = await saveRental(m.chat, duracionMs, m.sender)

    return conn.sendMessage(m.chat, {
      text: `✅ *Bot activado*\n\n> *Grupo:* ${nombreGrupo}\n> *Tiempo:* ${formatDuration(duracionMs)}\n> *Restante:* ${formatRemainingDetailed(alquiler.expiresAt)}\n> *Vence:* ${new Date(alquiler.expiresAt).toLocaleString('es-ES')}\n> *Por:* @${m.sender.split('@')[0]}`,
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: [m.sender]
      }
    }, { quoted: m })
  } catch (e) {
    console.error('Error en comando bot:', e)
    return conn.sendMessage(m.chat, {
      text: '[❌] No se pudo guardar la activación en la base de datos.',
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }
}

handler.help = ['.bot on/off → activa el bot · tiempo/oficial solo owner principal']
handler.tags = ['owner']
handler.command = ['bot', 'one']
handler.owner = true

export default handler
