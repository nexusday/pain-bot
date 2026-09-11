let handler = async (m, { conn, args, participants, isAdmin, isBotAdmin, isOwner, isPrems, usedPrefix, command }) => {
  if (!m.isGroup) return conn.sendMessage(m.chat, {
    text: '[❗] Este comando solo puede ser usado en grupos.',
    contextInfo: {
      ...rcanal.contextInfo
    }
  }, { quoted: m })
  
  try {
    const mensajesChat = conn.chats[m.chat]?.messages || []
    const clavesMensajes = Object.keys(mensajesChat)
    
    if (clavesMensajes.length === 0) {
      return conn.sendMessage(m.chat, {
        text: '[❗] No hay mensajes para eliminar.',
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }
    
    const mensajesAEliminar = clavesMensajes
      .filter(key => key !== m.key.id) 
      .slice(-15) 
    
    for (const idMensaje of mensajesAEliminar) {
      try {
        const mensaje = mensajesChat[idMensaje]
        if (mensaje) {
          await conn.sendMessage(m.chat, {
            delete: {
              remoteJid: m.chat,
              fromMe: mensaje.key?.fromMe || false,
              id: idMensaje,
              participant: mensaje.key?.participant || m.chat
            }
          })
          
          
          await new Promise(resolve => setTimeout(resolve, 210));
        }
      } catch (errorEliminacion) {
        console.error('Error eliminando mensaje:', idMensaje, errorEliminacion)
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