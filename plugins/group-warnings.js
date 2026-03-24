let handler = async (m, { conn, args, participants, isAdmin, isBotAdmin, isOwner, isPrems, usedPrefix, command }) => {
  if (!m.isGroup) return conn.sendMessage(m.chat, {
    text: '[❗] Este comando solo puede ser usado en grupos.',
    contextInfo: {
      ...rcanal.contextInfo
    }
  }, { quoted: m })
  
  if (!global.db.data.warnings) global.db.data.warnings = {}
  if (!global.db.data.warnings[m.chat]) global.db.data.warnings[m.chat] = {}

  const groupMetadata = await conn.groupMetadata(m.chat)
  const groupName = groupMetadata.subject

  if (m.mentionedJid && m.mentionedJid.length > 0) {
    const who = m.mentionedJid[0]
    const userWarnings = global.db.data.warnings[m.chat][who]
    
    if (!userWarnings || userWarnings.count === 0) {
      return conn.sendMessage(m.chat, {
        text: `🌴 𝗔𝗱𝘃𝗲𝗿𝘁𝗲𝗻𝗰𝗶𝗮𝘀\n\n> *Usuario:* @${who.split('@')[0]}\n> *Advertencias:* 0/3`,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [who]
        }
      }, { quoted: m })
    }

    let warningsText = `𝗔𝗱𝘃𝗲𝗿𝘁𝗲𝗻𝗰𝗶𝗮𝘀 𝗱𝗲 𝗨𝘀𝘂𝗮𝗿𝗶𝗼\n> *Usuario:* @${who.split('@')[0]}> *Advertencias:* ${userWarnings.count}/3 ${userWarnings.count >= 2 ? '⚠️' : '📋'}`
    
    userWarnings.warnings.forEach((warn, index) => {
      const date = new Date(warn.timestamp).toLocaleDateString('es-ES')
      const adminName = warn.admin.split('@')[0]
      warningsText += `> *${index + 1}.* ${warn.reason}\n`
      warningsText += `> *Admin:* @${adminName} | ${date}\n`
    })
    
    warningsText += `> *Grupo:* ${groupName}\n`
    if (userWarnings.count >= 2) {
      warningsText += `> ⚠️ *¡Próxima advertencia = Expulsión!* ⚠️\n`
    }
    

    const mentionedUsers = [who, ...userWarnings.warnings.map(w => w.admin)]
    
    return conn.sendMessage(m.chat, {
      text: warningsText,
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: mentionedUsers
      }
    }, { quoted: m })
  }


  const allWarnings = global.db.data.warnings[m.chat]
  const usersWithWarnings = Object.keys(allWarnings).filter(user => allWarnings[user].count > 0)

  if (usersWithWarnings.length === 0) {
    return conn.sendMessage(m.chat, {
      text: `🌴 𝗔𝗱𝘃𝗲𝗿𝘁𝗲𝗻𝗰𝗶𝗮𝘀 𝗱𝗲𝗹 𝗚𝗿𝘂𝗽𝗼\n\n> *Grupo:* ${groupName}\n> *Usuarios con advertencias:* 0`,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }

  let groupWarningsText = `🌴 𝗔𝗱𝘃𝗲𝗿𝘁𝗲𝗻𝗰𝗶𝗮𝘀 𝗱𝗲𝗹 𝗚𝗿𝘂𝗽𝗼\n\n> *Grupo:* ${groupName}\n> *Usuarios con advertencias:* ${usersWithWarnings.length}`

  const mentionedUsers = []
  
  for (let i = 0; i < usersWithWarnings.length; i++) {
    const userId = usersWithWarnings[i]
    const userWarnings = allWarnings[userId]
    const userName = userId.split('@')[0]
    
    mentionedUsers.push(userId)
    
    groupWarningsText += `> *${i + 1}.* @${userName}\n`
    groupWarningsText += `> *Advertencias:* ${userWarnings.count}/3 ${userWarnings.count >= 2 ? '⚠️' : '📋'}\n`
    
    if (i < usersWithWarnings.length - 1) {
      groupWarningsText += `│\n`
    }
  }
  
  groupWarningsText += `\n\n> *Comando:* ${usedPrefix}warnings @usuario\n> *Si deseas ver de un usuario.`

  return conn.sendMessage(m.chat, {
    text: groupWarningsText,
    contextInfo: {
      ...rcanal.contextInfo,
      mentionedJid: mentionedUsers
    }
  }, { quoted: m })
}

handler.command = ['warnings', 'advertencias', 'veradvertencias', 'listwarns']
handler.group = true
handler.admin = true

export default handler
