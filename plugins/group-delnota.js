let handler = async (m, { conn, args, participants, isAdmin, isBotAdmin, isOwner, isPrems, usedPrefix, command }) => {
  if (!m.isGroup) return conn.sendMessage(m.chat, {
    text: '[❗] Este comando solo puede ser usado en grupos.',
    contextInfo: {
      ...rcanal.contextInfo
    }
  }, { quoted: m })
  


  
  if (!args[0] || isNaN(args[0])) {
    return conn.sendMessage(m.chat, {
      text: `[❗] Debes poner el número de la nota a eliminar.\n\n> Ejemplo: ${usedPrefix + command} 1\n> Para ver las notas: ${usedPrefix}vernotas\n> Solo puedes eliminar tus propias notas`,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }

  const noteIndex = parseInt(args[0]) - 1

  
  if (!global.db.data.notes) global.db.data.notes = {}
  if (!global.db.data.notes[m.chat]) global.db.data.notes[m.chat] = []

  
  const now = Date.now()
  global.db.data.notes[m.chat] = global.db.data.notes[m.chat].filter(note => note.expiresAt > now)

  
  if (noteIndex < 0 || noteIndex >= global.db.data.notes[m.chat].length) {
    return conn.sendMessage(m.chat, {
      text: `[❗] No existe una nota con ese número.\n\n> Notas disponibles: ${global.db.data.notes[m.chat].length}\n> Para ver las notas: ${usedPrefix}vernotas`,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }


  const targetNote = global.db.data.notes[m.chat][noteIndex]
  if (targetNote.author !== m.sender && !isAdmin && !isOwner && !isPrems) {
    return conn.sendMessage(m.chat, {
      text: `[❌] Solo puedes eliminar tus propias notas.\n\n> Esta nota pertenece a @${targetNote.author.split('@')[0]}`,
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: [targetNote.author]
      }
    }, { quoted: m })
  }

  const deletedNote = global.db.data.notes[m.chat].splice(noteIndex, 1)[0]

  const groupMetadata = await conn.groupMetadata(m.chat)
  const groupName = groupMetadata.subject

  return conn.sendMessage(m.chat, {
    text: `╭─「 🗑️ 𝗡𝗼𝘁𝗮 𝗘𝗹𝗶𝗺𝗶𝗻𝗮𝗱𝗮 🗑️ 」─╮\n│\n╰➺ ✧ *Usuario:* @${m.sender.split('@')[0]}\n╰➺ ✧ *Nota eliminada:* ${deletedNote.content}\n╰➺ ✧ *Autor original:* @${deletedNote.author.split('@')[0]}\n│\n╰➺ ✧ *Grupo:* ${groupName}\n╰➺ ✧ *Estado:* Nota eliminada ✅\n\n> PAIN COMMUNITY`,
    contextInfo: {
      ...rcanal.contextInfo,
      mentionedJid: [m.sender, deletedNote.author]
    }
  }, { quoted: m })
}

handler.command = ['delnota', 'deletenote', 'eliminarnota']
handler.group = true

export default handler
