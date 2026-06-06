let handler = async (m, { conn, args, usedPrefix, command, isAdmin, isBotAdmin }) => {
  try {
    if (!m.isGroup) return conn.sendMessage(m.chat, { text: '[❗] Este comando solo funciona en grupos.', contextInfo: { ...rcanal.contextInfo } }, { quoted: m })
    if (!isAdmin) return conn.sendMessage(m.chat, { text: '[❗] Solo administradores pueden configurar antiprefijo.', contextInfo: { ...rcanal.contextInfo } }, { quoted: m })

    const action = (args[0] || '').toLowerCase()
    if (!global.db.data.antiprefijo) global.db.data.antiprefijo = {}

    if (action === 'on') {
      global.db.data.antiprefijo[m.chat] = true
      let txt = `ִֶָ☾. *Anti-prefijo activado correctamente*\n> Por: @${m.sender.split('@')[0]}`
      return conn.sendMessage(m.chat, { text: txt, contextInfo: { ...rcanal.contextInfo, mentionedJid: [m.sender] } }, { quoted: m })
    } else if (action === 'off') {
      global.db.data.antiprefijo[m.chat] = false
      let txt = `ִֶָ☾. *Anti-prefijo desactivado correctamente*\n> Por: @${m.sender.split('@')[0]}`
      return conn.sendMessage(m.chat, { text: txt, contextInfo: { ...rcanal.contextInfo, mentionedJid: [m.sender] } }, { quoted: m })
    } else {
      return conn.sendMessage(m.chat, { text: `[❗] Debes poner una acción.\n\n> *Ejemplo:* ${usedPrefix}antiprefijo on\n> *Ejemplo:* ${usedPrefix}antiprefijo off`, contextInfo: { ...rcanal.contextInfo } }, { quoted: m })
    }
  } catch (e) {
    console.error('Error en antiprefijo:', e)
    return conn.sendMessage(m.chat, { text: '[❌] Ocurrió un error al configurar antiprefijo.', contextInfo: { ...rcanal.contextInfo } }, { quoted: m })
  }
}

handler.command = ['antiprefijo']
handler.group = true
handler.admin = true

export default handler
