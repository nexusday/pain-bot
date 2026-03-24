let handler = async (m, { conn, args, participants, isAdmin, isBotAdmin, isOwner, isPrems, usedPrefix, command }) => {
  if (!m.isGroup) return conn.sendMessage(m.chat, {
    text: '[❗] Este comando solo puede ser usado en grupos.',
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
        text: '[❗] No hay suficientes usuarios en el grupo para crear el top.',
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }
    
   
    let txt = `😍 𝗧𝗼𝗽 𝗹𝗶𝗻𝗱𝗼𝘀 𝗱𝗲𝗹 𝗴𝗿𝘂𝗽𝗼\n`  
    
    selectedUsers.forEach((user, index) => {
      const position = index + 1
      const emoji = position === 1 ? '🥇' : position === 2 ? '🥈' : position === 3 ? '🥉' : '💖'
      txt += `*${position}.* @${user.id.split('@')[0]}\n`
    })
    
    
   
    const mentionedJid = selectedUsers.map(user => user.id)
    
    return conn.sendMessage(m.chat, {
      text: txt,
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: mentionedJid
      }
    }, { quoted: m })
    
  } catch (e) {
    console.error('Error en top lindos:', e)
    return conn.sendMessage(m.chat, {
      text: '[❗] Ocurrió un error al generar el top de lindos del grupo.',
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
}

handler.help = ['#toplindos']
handler.tags = ['fun', 'grupos']
handler.command = ['toplindos', 'toplindo', 'lindos', 'lindotop']
handler.group = true

export default handler 