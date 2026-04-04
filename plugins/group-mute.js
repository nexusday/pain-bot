let handler = async (m, { conn, args, usedPrefix, command, isAdmin, isBotAdmin, participants }) => {
  try {
    if (!m.isGroup) {
      return conn.sendMessage(m.chat, { text: '[❗] Este comando sólo funciona en grupos.', contextInfo: { ...rcanal.contextInfo } }, { quoted: m })
    }

    if (!isAdmin) {
      return conn.sendMessage(m.chat, { text: '[❗] Solo los administradores pueden usar este comando.', contextInfo: { ...rcanal.contextInfo } }, { quoted: m })
    }

    
    let who
    if (m.mentionedJid && m.mentionedJid.length) who = m.mentionedJid[0]
    else if (m.quoted && m.quoted.sender) who = m.quoted.sender
    else if (args && args[0]) {
      const id = args[0].replace(/[^0-9]/g, '')
      who = id + '@s.whatsapp.net'
    }

    if (!who) {
      return conn.sendMessage(m.chat, { text: `Uso: ${usedPrefix}mute @usuario  ó  ${usedPrefix}delmute @usuario`, contextInfo: { ...rcanal.contextInfo } }, { quoted: m })
    }

    if (!global.db.data.muted) global.db.data.muted = {}
    if (!global.db.data.muted[m.chat]) global.db.data.muted[m.chat] = []

    
    const targetParticipant = (participants || []).find(u => (u.id || u.jid) === who || u.id === who)
    const isTargetAdmin = targetParticipant?.admin === 'admin' || targetParticipant?.admin === 'superadmin'
    const ownerNumbers = (global.owner || []).map(v => (typeof v === 'string' ? v.replace(/[^0-9]/g, '') : String(v).replace(/[^0-9]/g, '')) + '@s.whatsapp.net')
    const isTargetOwner = ownerNumbers.includes(who)

    if (who === conn.user.jid) {
      return conn.sendMessage(m.chat, { text: '[❌] No puedes mutear al bot.', contextInfo: { ...rcanal.contextInfo } }, { quoted: m })
    }

    if (isTargetAdmin) {
      return conn.sendMessage(m.chat, { text: '[❌] No puedes mutear a un administrador del grupo.', contextInfo: { ...rcanal.contextInfo } }, { quoted: m })
    }

    if (isTargetOwner) {
      return conn.sendMessage(m.chat, { text: '[❌] No puedes mutear al propietario del bot.', contextInfo: { ...rcanal.contextInfo } }, { quoted: m })
    }

    if (command === 'mute' || command === 'group-mute' || command === 'mutechat') {
      if (global.db.data.muted[m.chat].includes(who)) {
        return conn.sendMessage(m.chat, { text: `El usuario ya está muteado.`, contextInfo: { ...rcanal.contextInfo } }, { quoted: m })
      }
      global.db.data.muted[m.chat].push(who)
      return conn.sendMessage(m.chat, { text: `🔇 Usuario muteado correctamente\n> @${who.split('@')[0]}`, contextInfo: { ...rcanal.contextInfo, mentionedJid: [who, m.sender] } }, { quoted: m })
    }

    
    if (command === 'delmute' || command === 'unmute' || command === 'group-unmute') {
      if (!global.db.data.muted[m.chat].includes(who)) {
        return conn.sendMessage(m.chat, { text: `El usuario no está muteado.`, contextInfo: { ...rcanal.contextInfo } }, { quoted: m })
      }
      global.db.data.muted[m.chat] = global.db.data.muted[m.chat].filter(j => j !== who)
      return conn.sendMessage(m.chat, { text: `🔊 Usuario desmuteado correctamente\n> @${who.split('@')[0]}`, contextInfo: { ...rcanal.contextInfo, mentionedJid: [who, m.sender] } }, { quoted: m })
    }

    return conn.sendMessage(m.chat, { text: `Comando no reconocido. Uso: ${usedPrefix}mute @usuario | ${usedPrefix}delmute @usuario`, contextInfo: { ...rcanal.contextInfo } }, { quoted: m })

  } catch (e) {
    console.error(e)
    return conn.sendMessage(m.chat, { text: '[❌] Error al procesar el comando.', contextInfo: { ...rcanal.contextInfo } }, { quoted: m })
  }
}

handler.command = ['mute', 'delmute', 'unmute', 'group-mute', 'group-unmute']
handler.group = true
handler.admin = true
handler.botAdmin = true

export default handler
