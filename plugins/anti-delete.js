let handler = async (m, { conn, args, usedPrefix }) => {
  try {
    if (!m.isGroup) {
      return conn.sendMessage(m.chat, {
        text: '[❗] Este comando solo funciona en grupos.',
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    const accion = String(args[0] || '').toLowerCase().trim()
    if (!global.db.data.antiDelete) global.db.data.antiDelete = {}

    if (accion === 'on') {
      global.db.data.antiDelete[m.chat] = true
      return conn.sendMessage(m.chat, {
        text:
          `ִֶָ☾. *Anti-Delete activado*\n` +
          `> Por: @${m.sender.split('@')[0]}`,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [m.sender]
        }
      }, { quoted: m })
    }

    if (accion === 'off') {
      global.db.data.antiDelete[m.chat] = false
      return conn.sendMessage(m.chat, {
        text:
          `ִֶָ☾. *Anti-Delete desactivado*\n` +
          `> Por: @${m.sender.split('@')[0]}`,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [m.sender]
        }
      }, { quoted: m })
    }

    if (['ver', 'status', 'estado'].includes(accion)) {
      const on = !!global.db.data.antiDelete[m.chat]
      return conn.reply(
        m.chat,
        `*[🗑️] Anti-Delete*\n\n› Estado: *${on ? 'activo' : 'apagado'}*`,
        m
      )
    }

    return conn.sendMessage(m.chat, {
      text:
        `[❗] Uso:\n` +
        `> ${usedPrefix}antidelete on\n` +
        `> ${usedPrefix}antidelete off\n` +
        `> ${usedPrefix}antidelete ver`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  } catch (error) {
    console.error('Error en antidelete:', error)
    return conn.sendMessage(m.chat, {
      text: '[❌] Ocurrió un error al configurar el anti-delete.',
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }
}

handler.help = ['#antidelete on/off']
handler.tags = ['grupo', 'admins']
handler.command = ['antidelete', 'antidel', 'antieliminar']
handler.group = true
handler.admin = true
handler.botAdmin = true

export default handler
