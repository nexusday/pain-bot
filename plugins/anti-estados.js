let handler = async (m, { conn, args, usedPrefix }) => {
  try {
    if (!m.isGroup) {
      return conn.sendMessage(m.chat, {
        text: '[❗] Este comando solo funciona en grupos.',
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    const accion = String(args[0] || '').toLowerCase().trim()
    if (!global.db.data.antiEstados) global.db.data.antiEstados = {}

    if (accion === 'on') {
      global.db.data.antiEstados[m.chat] = true
      return conn.sendMessage(m.chat, {
        text:
          `ִֶָ☾. *Anti-Estados activado*\n` +
          `> Por: @${m.sender.split('@')[0]}`,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [m.sender]
        }
      }, { quoted: m })
    }

    if (accion === 'off') {
      global.db.data.antiEstados[m.chat] = false
      return conn.sendMessage(m.chat, {
        text:
          `ִֶָ☾. *Anti-Estados desactivado*\n` +
          `> Por: @${m.sender.split('@')[0]}`,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [m.sender]
        }
      }, { quoted: m })
    }

    if (['ver', 'status', 'estado'].includes(accion)) {
      const on = !!global.db.data.antiEstados[m.chat]
      return conn.reply(
        m.chat,
        `*[👁️] Anti-Estados*\n\n› Estado: *${on ? 'activo' : 'apagado'}*`,
        m
      )
    }

    return conn.sendMessage(m.chat, {
      text:
        `[❗] Uso:\n` +
        `> ${usedPrefix}antiestados on\n` +
        `> ${usedPrefix}antiestados off\n` +
        `> ${usedPrefix}antiestados ver`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  } catch (error) {
    console.error('Error en antiestados:', error)
    return conn.sendMessage(m.chat, {
      text: '[❌] Ocurrió un error al configurar el anti-estados.',
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }
}

handler.help = ['#antiestados on/off']
handler.tags = ['grupo', 'admins']
handler.command = ['antiestados', 'antiestado', 'antistatus', 'antistatusmention']
handler.group = true
handler.admin = true
handler.botAdmin = true

export default handler
