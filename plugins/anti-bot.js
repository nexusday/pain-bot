let handler = async (m, { conn, args, usedPrefix }) => {
  try {
    if (!m.isGroup) {
      return conn.sendMessage(m.chat, {
        text: '[❗] Este comando solo funciona en grupos.',
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    const accion = String(args[0] || '').toLowerCase().trim()

    if (!global.db.data.antiBot) global.db.data.antiBot = {}

    if (accion === 'on') {
      global.db.data.antiBot[m.chat] = true
      return conn.sendMessage(m.chat, {
        text:
          `ִֶָ☾. *Anti-Bot activado*\n` +
          `> Por: @${m.sender.split('@')[0]}`,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [m.sender]
        }
      }, { quoted: m })
    }

    if (accion === 'off') {
      global.db.data.antiBot[m.chat] = false
      return conn.sendMessage(m.chat, {
        text:
          `ִֶָ☾. *Anti-Bot desactivado*\n` +
          `> Por: @${m.sender.split('@')[0]}`,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [m.sender]
        }
      }, { quoted: m })
    }

    if (['ver', 'status', 'estado'].includes(accion)) {
      const on = !!global.db.data.antiBot[m.chat]
      return conn.reply(
        m.chat,
        `*[🤖] Anti-Bot*\n\n› Estado: *${on ? 'activo' : 'apagado'}*`,
        m
      )
    }

    return conn.sendMessage(m.chat, {
      text:
        `[❗] Uso:\n` +
        `> ${usedPrefix}antibot on\n` +
        `> ${usedPrefix}antibot off\n` +
        `> ${usedPrefix}antibot ver`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  } catch (error) {
    console.error('Error en antibot:', error)
    return conn.sendMessage(m.chat, {
      text: '[❌] Ocurrió un error al configurar el anti-bot.',
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }
}

handler.help = ['#antibot on/off']
handler.tags = ['grupo', 'admins']
handler.command = ['antibot', 'antibots', 'nobots']
handler.group = true
handler.admin = true
handler.botAdmin = true

export default handler
