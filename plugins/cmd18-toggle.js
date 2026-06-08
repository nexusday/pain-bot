let handler = async (m, { conn, args, usedPrefix, command, isAdmin }) => {
  try {
    if (!m.isGroup) {
      return conn.sendMessage(m.chat, {
        text: '[❗] Este comando solo funciona en grupos.',
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    if (!isAdmin) {
      return conn.sendMessage(m.chat, {
        text: '[❗] Solo los administradores pueden usar este comando.',
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    const action = args[0]?.toLowerCase()

    if (!global.db.data.cmd18) global.db.data.cmd18 = {}

    if (action === 'on') {
      global.db.data.cmd18[m.chat] = true
      await global.db.write()

      return conn.sendMessage(m.chat, {
        text: `🔞 *Comandos +18 activados*\n\n> Los comandos +18 ya pueden usarse en este grupo.\n> *Por:* @${m.sender.split('@')[0]}`,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [m.sender]
        }
      }, { quoted: m })
    }

    if (action === 'off') {
      global.db.data.cmd18[m.chat] = false
      await global.db.write()

      return conn.sendMessage(m.chat, {
        text: `🔞 *Comandos +18 desactivados*\n\n> Los comandos +18 ya no pueden usarse en este grupo.\n> *Por:* @${m.sender.split('@')[0]}`,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [m.sender]
        }
      }, { quoted: m })
    }

    const estado = global.db.data.cmd18[m.chat] === true ? 'activados' : 'desactivados'

    return conn.sendMessage(m.chat, {
      text: `[❗] Uso: ${usedPrefix + command} on/off\n\n> *Estado actual:* ${estado}`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  } catch (e) {
    console.error('Error en cmd18:', e)
    return conn.sendMessage(m.chat, {
      text: '[❌] Ocurrió un error al configurar los comandos +18.',
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }
}

handler.command = ['cmd18', 'cmd+18', 'nsfwon']
handler.group = true
handler.admin = true
handler.botAdmin = true

export default handler
