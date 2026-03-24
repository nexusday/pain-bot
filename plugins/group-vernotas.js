let handler = async (m, { conn, args, participants, isAdmin, isBotAdmin, isOwner, isPrems, usedPrefix, command }) => {
  if (!m.isGroup) return conn.sendMessage(m.chat, {
    text: '《✧》Este comando solo puede ser usado en grupos.',
    contextInfo: {
      ...rcanal.contextInfo
    }
  }, { quoted: m })

  
  if (!global.db.data.notes) global.db.data.notes = {}
  if (!global.db.data.notes[m.chat]) global.db.data.notes[m.chat] = []

  const groupMetadata = await conn.groupMetadata(m.chat)
  const groupName = groupMetadata.subject

  
  const now = Date.now()
  global.db.data.notes[m.chat] = global.db.data.notes[m.chat].filter(note => note.expiresAt > now)

 
  if (m.mentionedJid && m.mentionedJid.length > 0) {
    const who = m.mentionedJid[0]
    const userNotes = global.db.data.notes[m.chat].filter(note => note.author === who)
    
    if (userNotes.length === 0) {
      return conn.sendMessage(m.chat, {
        text: `╭─「 📝 𝗡𝗼𝘁𝗮𝘀 𝗱𝗲 𝗨𝘀𝘂𝗮𝗿𝗶𝗼 📝 」─╮\n│\n╰➺ ✧ *Usuario:* @${who.split('@')[0]}\n╰➺ ✧ *Notas:* 0 📝\n╰➺ ✧ *Estado:* Sin notas activas\n│\n╰➺ ✧ *Grupo:* ${groupName}\n\n> PAIN COMMUNITY`,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [who]
        }
      }, { quoted: m })
    }

    let notesText = `╭─「 📝 𝗡𝗼𝘁𝗮𝘀 𝗱𝗲 𝗨𝘀𝘂𝗮𝗿𝗶𝗼 📝 」─╮\n│\n`
    notesText += `╰➺ ✧ *Usuario:* @${who.split('@')[0]}\n`
    notesText += `╰➺ ✧ *Notas:* ${userNotes.length} 📝\n│\n`
    
    userNotes.forEach((note, index) => {
      const timeLeft = note.expiresAt - now
      const hoursLeft = Math.floor(timeLeft / (60 * 60 * 1000))
      const minutesLeft = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000))
      
      notesText += `╰➺ ✧ *${index + 1}.* ${note.content}\n`
      notesText += `   ↳ Tiempo restante: ${hoursLeft}h ${minutesLeft}m\n`
    })
    
    notesText += `│\n╰➺ ✧ *Grupo:* ${groupName}\n\n> PAIN COMMUNITY`

    const mentionedUsers = [who, ...userNotes.map(n => n.author)]
    
    return conn.sendMessage(m.chat, {
      text: notesText,
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: mentionedUsers
      }
    }, { quoted: m })
  }


  const allNotes = global.db.data.notes[m.chat]

  if (allNotes.length === 0) {
    return conn.sendMessage(m.chat, {
      text: `╭─「 📝 𝗡𝗼𝘁𝗮𝘀 𝗱𝗲𝗹 𝗚𝗿𝘂𝗽𝗼 📝 」─╮\n│\n╰➺ ✧ *Grupo:* ${groupName}\n╰➺ ✧ *Notas activas:* 0\n╰➺ ✧ *Estado:* Sin notas 📝\n│\n╰➺ ✧ *Nota:* No hay notas activas en este grupo.\n\n> PAIN COMMUNITY`,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }

  let groupNotesText = `╭─「 📝 𝗡𝗼𝘁𝗮𝘀 𝗱𝗲𝗹 𝗚𝗿𝘂𝗽𝗼 📝 」─╮\n│\n`
  groupNotesText += `╰➺ ✧ *Grupo:* ${groupName}\n`
  groupNotesText += `╰➺ ✧ *Notas activas:* ${allNotes.length}\n│\n`

  const mentionedUsers = []
  
  for (let i = 0; i < allNotes.length; i++) {
    const note = allNotes[i]
    const timeLeft = note.expiresAt - now
    const hoursLeft = Math.floor(timeLeft / (60 * 60 * 1000))
    const minutesLeft = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000))
    
    mentionedUsers.push(note.author)
    
    groupNotesText += `╰➺ ✧ *${i + 1}.* ${note.content}\n`
    groupNotesText += `   ↳ Por: @${note.author.split('@')[0]} | ${hoursLeft}h ${minutesLeft}m\n`
    
    if (i < allNotes.length - 1) {
      groupNotesText += `│\n`
    }
  }
  
  groupNotesText += `│\n╰➺ ✧ *Comando:* ${usedPrefix}vernotas @usuario\n`
  groupNotesText += `╰➺ ✧ *Para ver notas de un usuario específico*\n\n> PAIN COMMUNITY`

  return conn.sendMessage(m.chat, {
    text: groupNotesText,
    contextInfo: {
      ...rcanal.contextInfo,
      mentionedJid: mentionedUsers
    }
  }, { quoted: m })
}

handler.command = ['vernotas', 'notes', 'vernotas', 'listnotes']
handler.group = true

export default handler
