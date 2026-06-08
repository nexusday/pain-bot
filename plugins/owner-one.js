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

  const action = (args[0] || '').toLowerCase().trim()
  const groupName = (await conn.groupMetadata(m.chat).catch(() => null))?.subject || await conn.getName(m.chat).catch(() => 'Grupo')

  if (!action) {
    return conn.sendMessage(m.chat, {
      text: buildRentalStatusText(m.chat, groupName),
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  if (['del', 'delete', 'remove', 'quitar', 'off'].includes(action)) {
    await removeRental(m.chat)
    return conn.sendMessage(m.chat, {
      text: `🗑️ *Alquiler eliminado*\n\n> *Grupo:* ${groupName}\n> El bot quedó sin plan activo en este grupo.`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  const permanentType = resolvePermanentRentalType(action)
  if (permanentType) {
    await savePermanentRental(m.chat, permanentType, m.sender)

    const label = permanentType === 'official' ? 'Grupo Oficial ♾️' : 'Infinito ♾️'

    return conn.sendMessage(m.chat, {
      text: `✅ *Alquiler activado*\n\n> *Grupo:* ${groupName}\n> *Tipo:* ${label}\n> *Tiempo:* Sin expiración\n> *Por:* @${m.sender.split('@')[0]}`,
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: [m.sender]
      }
    }, { quoted: m })
  }

  const durationMs = parseRentalTime(args.join(' ').trim() || action)
  if (!durationMs) {
    return conn.sendMessage(m.chat, {
      text: `*[❗] Tiempo inválido.*\n\nUsá:\n> ${usedPrefix + command} 1h\n> ${usedPrefix + command} 1d\n> ${usedPrefix + command} 30m\n> ${usedPrefix + command} 7d\n> ${usedPrefix + command} infinito\n> ${usedPrefix + command} oficial\n\nSin tiempo muestra el estado.\n> ${usedPrefix + command} del → quitar límite`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  try {
    const rental = await saveRental(m.chat, durationMs, m.sender)

    return conn.sendMessage(m.chat, {
      text: `✅ *Alquiler activado*\n\n> *Grupo:* ${groupName}\n> *Tiempo establecido:* ${formatDuration(durationMs)}\n> *Restante:* ${formatRemainingDetailed(rental.expiresAt)}\n> *Vence:* ${new Date(rental.expiresAt).toLocaleString('es-ES')}\n> *Por:* @${m.sender.split('@')[0]}`,
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: [m.sender]
      }
    }, { quoted: m })
  } catch (e) {
    console.error('Error en comando one:', e)
    return conn.sendMessage(m.chat, {
      text: '[❌] No se pudo guardar el alquiler en la base de datos.',
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }
}

handler.help = ['.one 1h → activa alquiler del bot en el grupo (solo owner)']
handler.tags = ['owner']
handler.command = ['one', 'alquiler', 'rent']
handler.owner = true

export default handler
