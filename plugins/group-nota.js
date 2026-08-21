let handler = async (m, { conn, args, participants, isAdmin, isBotAdmin, isOwner, isPrems, usedPrefix, command }) => {
  if (!m.isGroup) return conn.sendMessage(m.chat, {
    text: '《✧》Este comando solo puede ser usado en grupos.',
    contextInfo: {
      ...rcanal.contextInfo
    }
  }, { quoted: m })
  


  
  if (!args[0]) {
    return conn.sendMessage(m.chat, {
      text: `《✧》Debes escribir el contenido de la nota.\n\n> Ejemplo: ${usedPrefix + command} Hoy nos vemos en el circo\n> Máximo: 250 caracteres\n> Duración: 24 horas\n> Todos pueden crear notas`,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }

  const noteContent = args.join(' ')
  
  
  if (noteContent.length > 250) {
    return conn.sendMessage(m.chat, {
      text: `《✧》La nota es demasiado larga.\n\n> Máximo permitido: 250 caracteres\n> Tu nota: ${noteContent.length} caracteres\n> Exceso: ${noteContent.length - 250} caracteres`,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }

  
  if (!global.db.data.notes) global.db.data.notes = {}
  if (!global.db.data.notes[m.chat]) global.db.data.notes[m.chat] = []


  const newNote = {
    id: Date.now().toString(),
    content: noteContent,
    author: m.sender,
    authorName: m.pushName || m.name || 'Admin',
    timestamp: Date.now(),
    expiresAt: Date.now() + (24 * 60 * 60 * 1000) 
  }

  
  global.db.data.notes[m.chat].push(newNote)

  const groupMetadata = await conn.groupMetadata(m.chat)
  const groupName = groupMetadata.subject

  return conn.sendMessage(m.chat, {
    text: `𝗡𝗼𝘁𝗮 𝗔𝗴𝗿𝗲𝗴𝗮𝗱𝗮 \n\n *Usuario:* @${m.sender.split('@')[0]}\n *Contenido:* ${noteContent}\n *Caracteres:* ${noteContent.length}/250\n *Grupo:* ${groupName}\n *Expira:* En 24 horas\n`,
    contextInfo: {
      ...rcanal.contextInfo,
      mentionedJid: [m.sender]
    }
  }, { quoted: m })
}

handler.command = ['nota', 'note', 'anotar']
handler.group = true

export default handler
