import {
  getSupport,
  setSupportLink,
  clearSupportLink,
  normalizeGroupLink
} from '../lib/soporte.js'

let handler = async (m, { conn, args, usedPrefix, command, isOwner }) => {
  if (!isOwner) {
    return conn.sendMessage(m.chat, {
      text: '[❗] Solo los dueños pueden usar este comando.',
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  const accion = String(args[0] || '').toLowerCase().trim()
  const actual = getSupport(conn, true)

  if (!accion || ['ver', 'lista', 'status', 'estado'].includes(accion)) {
    if (!actual.link) {
      return conn.reply(
        m.chat,
        `*[💬] Soporte*\n\n` +
          `No hay link configurado.\n\n` +
          `*Uso:*\n` +
          `> ${usedPrefix + command} https://chat.whatsapp.com/XXXX\n` +
          `> ${usedPrefix + command} del`,
        m
      )
    }

    return conn.reply(
      m.chat,
      `*[💬] Soporte*\n\n` +
        `› Link: ${actual.link}\n` +
        `› Botón: ${actual.buttonText}\n\n` +
        `*Cambiar:*\n> ${usedPrefix + command} <link>\n` +
        `*Quitar:*\n> ${usedPrefix + command} del`,
      m
    )
  }

  if (['del', 'delete', 'quitar', 'remove', 'off'].includes(accion)) {
    clearSupportLink(conn)
    return conn.reply(m.chat, '✅ Link de *soporte* eliminado.', m)
  }

  const linkRaw = args.join(' ').trim()
  const link = normalizeGroupLink(linkRaw)
  if (!link) {
    return conn.reply(
      m.chat,
      `*[❗] Link inválido.*\n\n` +
        `Usa un invite de grupo:\n` +
        `> ${usedPrefix + command} https://chat.whatsapp.com/XXXX`,
      m
    )
  }

  try {
    const guardado = setSupportLink(conn, link)
    return conn.reply(
      m.chat,
      `✅ *Soporte actualizado*\n\n` +
        `› Link: ${guardado.link}\n` +
        `› Botón: ${guardado.buttonText}\n\n` +
        `_Se mostrará en los avisos de alquiler (sin plan / expirado)._`,
      m
    )
  } catch {
    return conn.reply(m.chat, '[❌] No se pudo guardar el link de soporte.', m)
  }
}

handler.help = [
  '#soporte <link grupo> → link de soporte (alquiler)',
  '#soporte del → quitar link'
]
handler.tags = ['owner']
handler.command = ['soporte', 'support', 'gruposoporte']
handler.owner = true

export default handler
