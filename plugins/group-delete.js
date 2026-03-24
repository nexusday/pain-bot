let handler = async (m, { conn, args, participants, isAdmin, isBotAdmin, isOwner, isPrems, usedPrefix, command }) => {

  const adminCheckMetadata = (m.isGroup ? ((conn.chats[m.chat] || {}).metadata || await this.groupMetadata(m.chat).catch(_ => null)) : {}) || {}  
  const groupParticipants = (m.isGroup ? adminCheckMetadata.participants : []) || []  
  const user = (m.isGroup ? groupParticipants.find(u => conn.decodeJid(u.id) === m.sender) : {}) || {}  
  const isRAdmin = user?.admin == 'superadmin' || false  
  const isAdminManual = isRAdmin || user?.admin == 'admin' || false  
  

  const isOwnerManual = global.owner.some(([number]) => number.replace(/[^0-9]/g, '') + '@s.whatsapp.net' === m.sender) || 
                  global.ownerLid?.some(([number]) => number.replace(/[^0-9]/g, '') + '@lid' === m.sender) ||
                  m.sender === conn.user.jid
  
  if (!isAdminManual && !isRAdmin && !isOwnerManual) {
    return conn.reply(m.chat, '[❗] Solo los administradores pueden usar este comando.', m)
  }

  if (!m.isGroup) return conn.sendMessage(m.chat, {
    text: '[❗] Este comando solo puede ser usado en grupos.',
    contextInfo: {
      ...rcanal.contextInfo
    }
  }, { quoted: m })
  

  
  if (!m.quoted) {
    return conn.sendMessage(m.chat, {
      text: `[❗] Debes responder al mensaje que deseas eliminar.\n\n> Ejemplo: Responde a un mensaje y escribe ${usedPrefix + command}`,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
  
  try {
    
    const messageId = m.msg?.contextInfo?.stanzaId || m.quoted?.id
    
    if (!messageId) {
      return conn.sendMessage(m.chat, {
        text: '[❌] No se pudo obtener información del mensaje a eliminar.',
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }
    
   
    await conn.sendMessage(m.chat, {
      delete: {
        remoteJid: m.chat,
        fromMe: false,
        id: messageId,
        participant: m.msg?.contextInfo?.participant || m.chat
      }
    })
    
    
    await conn.sendMessage(m.chat, {
      delete: {
        remoteJid: m.chat,
        fromMe: false,
        id: m.key.id,
        participant: m.sender
      }
    })
    
  } catch (error) {
    console.error('Error al eliminar mensaje:', error)
  }
}

handler.command = ['delete', 'eliminar', 'd', 'del']
handler.group = true
handler.admin = true
handler.botAdmin = true

export default handler 