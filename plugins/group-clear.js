let handler = async (m, { conn, args, participants, isAdmin, isBotAdmin, isOwner, isPrems, usedPrefix, command }) => {
  if (!m.isGroup) return conn.sendMessage(m.chat, {
    text: '[❗] Este comando solo puede ser usado en grupos.',
    contextInfo: {
      ...rcanal.contextInfo
    }
  }, { quoted: m })
  
  try {
    const chatMessages = conn.chats[m.chat]?.messages || []
    const messageKeys = Object.keys(chatMessages)
    
    if (messageKeys.length === 0) {
      return conn.sendMessage(m.chat, {
        text: '[❗] No hay mensajes para eliminar.',
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }
    
    const messagesToDelete = messageKeys
      .filter(key => key !== m.key.id) 
      .slice(-15) 
    
    for (const messageId of messagesToDelete) {
      try {
        const message = chatMessages[messageId]
        if (message) {
          await conn.sendMessage(m.chat, {
            delete: {
              remoteJid: m.chat,
              fromMe: message.key?.fromMe || false,
              id: messageId,
              participant: message.key?.participant || m.chat
            }
          })
          
          
          await new Promise(resolve => setTimeout(resolve, 210));
        }
      } catch (deleteError) {
        console.error('Error eliminando mensaje:', messageId, deleteError)
      }
    }
    
    await conn.sendMessage(m.chat, {
      delete: {
        remoteJid: m.chat,
        fromMe: false,
        id: m.key.id,
        participant: m.sender
      }
    })
    
  } catch (error) {
    console.error('Error al limpiar mensajes:', error)
  }
}

handler.command = ['clear', 'limpiar', 'clean']
handler.group = true
handler.admin = true
handler.botAdmin = true

export default handler