let handler = async (m, { conn, args, participants, isAdmin, isBotAdmin, isOwner, isPrems, usedPrefix, command }) => {
  if (!m.isGroup) return conn.sendMessage(m.chat, {
    text: '[❗] Este comando solo puede ser usado en grupos.',
    contextInfo: {
      ...rcanal.contextInfo
    }
  }, { quoted: m })
  


  if (!m.mentionedJid || m.mentionedJid.length === 0) {
    return conn.sendMessage(m.chat, {
      text: `[❗] Debes mencionar al usuario al que deseas eliminar las advertencias.\n\n> *Ejemplo:* ${usedPrefix + command} @usuario`,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
  
  const quien = m.mentionedJid[0]
  
  if (!global.db.data.warnings) global.db.data.warnings = {}
  if (!global.db.data.warnings[m.chat]) global.db.data.warnings[m.chat] = {}
  
  if (!global.db.data.warnings[m.chat][quien] || global.db.data.warnings[m.chat][quien].count === 0) {
    return conn.sendMessage(m.chat, {
      text: `[❗] @${quien.split('@')[0]} no tiene advertencias registradas.`,
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: [quien]
      }
    }, { quoted: m })
  }

  
  const advertenciasAnteriores = global.db.data.warnings[m.chat][quien].count
  delete global.db.data.warnings[m.chat][quien]
  
  const nombreUsuario = await conn.getName(quien)
  const nombreAdmin = await conn.getName(m.sender)
  const metadatosGrupo = await conn.groupMetadata(m.chat)
  const nombreGrupo = metadatosGrupo.subject

  return conn.sendMessage(m.chat, {
    text: `🌴 𝗔𝗱𝘃𝗲𝗿𝘁𝗲𝗻𝗰𝗶𝗮𝘀 𝗘𝗹𝗶𝗺𝗶𝗻𝗮𝗱𝗮𝘀\n> *Usuario:* @${quien.split('@')[0]}\n> *Por:* @${m.sender.split('@')[0]}\n> *Advertencias eliminadas:* ${advertenciasAnteriores}\n> *Grupo:* ${nombreGrupo}`,
    contextInfo: {
      ...rcanal.contextInfo,
      mentionedJid: [quien, m.sender]
    }
  }, { quoted: m })
}

handler.command = ['delwarn', 'delwarns', 'eliminaradvertencia', 'limpiaradvertencias']
handler.group = true
handler.admin = true

export default handler
