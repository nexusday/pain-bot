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

  const contenidoNota = args.join(' ')
  
  
  if (contenidoNota.length > 250) {
    return conn.sendMessage(m.chat, {
      text: `《✧》La nota es demasiado larga.\n\n> Máximo permitido: 250 caracteres\n> Tu nota: ${contenidoNota.length} caracteres\n> Exceso: ${contenidoNota.length - 250} caracteres`,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }

  
  if (!global.db.data.notes) global.db.data.notes = {}
  if (!global.db.data.notes[m.chat]) global.db.data.notes[m.chat] = []


  const notaNueva = {
    id: Date.now().toString(),
    content: contenidoNota,
    author: m.sender,
    authorName: m.pushName || m.name || 'Admin',
    timestamp: Date.now(),
    expiresAt: Date.now() + (24 * 60 * 60 * 1000) 
  }

  
  global.db.data.notes[m.chat].push(notaNueva)

  const metadatosGrupo = await conn.groupMetadata(m.chat)
  const nombreGrupo = metadatosGrupo.subject

  return conn.sendMessage(m.chat, {
    text: `𝗡𝗼𝘁𝗮 𝗔𝗴𝗿𝗲𝗴𝗮𝗱𝗮 \n\n *Usuario:* @${m.sender.split('@')[0]}\n *Contenido:* ${contenidoNota}\n *Caracteres:* ${contenidoNota.length}/250\n *Grupo:* ${nombreGrupo}\n *Expira:* En 24 horas\n`,
    contextInfo: {
      ...rcanal.contextInfo,
      mentionedJid: [m.sender]
    }
  }, { quoted: m })
}

handler.command = ['nota', 'note', 'anotar']
handler.group = true

export default handler
