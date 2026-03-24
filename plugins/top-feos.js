let handler = async (m, { conn, args, participants, isAdmin, isBotAdmin, isOwner, isPrems, usedPrefix, command }) => {
  if (!m.isGroup) return conn.sendMessage(m.chat, {
    text: '《✧》Este comando solo puede ser usado en grupos.',
    contextInfo: {
      ...rcanal.contextInfo
    }
  }, { quoted: m })

  try {
   
    const groupMetadata = await conn.groupMetadata(m.chat)
    const participants = groupMetadata.participants || []
    
    
    const users = participants.filter(p => !p.admin && p.id !== conn.user.jid)
    
    
    const allParticipants = participants.filter(p => p.id !== conn.user.jid)
    
   
    const selectedUsers = []
    const maxUsers = Math.min(10, allParticipants.length)
    
    for (let i = 0; i < maxUsers; i++) {
      const randomIndex = Math.floor(Math.random() * allParticipants.length)
      const user = allParticipants[randomIndex]
      
      
      if (!selectedUsers.find(u => u.id === user.id)) {
        selectedUsers.push(user)
      } else {
        i-- 
      }
    }
    
    if (selectedUsers.length === 0) {
      return conn.sendMessage(m.chat, {
        text: '《✧》No hay suficientes usuarios en el grupo para crear el top.',
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }
    
   
    let txt = `╭─「 ✦ 𓆩🤢𓆪 ᴛᴏᴘ ғᴇᴏs ᴅᴇʟ ɢʀᴜᴘᴏ ✦ 」─╮\n`
    txt += `│\n`
    
    
    selectedUsers.forEach((user, index) => {
      const position = index + 1
      const emoji = position === 1 ? '🥇' : position === 2 ? '🥈' : position === 3 ? '🥉' : '🤢'
      txt += `╰➺ ${emoji} *${position}.* @${user.id.split('@')[0]}\n`
    })
    
    txt += `\n> PAIN COMMUNITY`
    
    
    const mentionedJid = selectedUsers.map(user => user.id)
    
    return conn.sendMessage(m.chat, {
      text: txt,
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: mentionedJid
      }
    }, { quoted: m })
    
  } catch (e) {
    console.error('Error en top feos:', e)
    return conn.sendMessage(m.chat, {
      text: '《✧》Ocurrió un error al generar el top de feos del grupo.',
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
}

handler.help = ['#topfeos']
handler.tags = ['fun', 'grupos']
handler.command = ['topfeos', 'topfeo', 'feos', 'feotop']
handler.group = true

export default handler 