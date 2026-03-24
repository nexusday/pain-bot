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
  

  
  if (!m.mentionedJid || m.mentionedJid.length === 0) {
    return conn.sendMessage(m.chat, {
      text: `[❗] Debes mencionar a un usuario para ponerlo de admin\n\n> *Ejemplo:* ${usedPrefix + command} @usuario`,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
  
  const who = m.mentionedJid[0]
  
  if (who === conn.user.jid) return conn.sendMessage(m.chat, {
    text: '[❗] No puedes promover al bot.',
    contextInfo: {
      ...rcanal.contextInfo
    }
  }, { quoted: m })
  
  const groupMetadata = await conn.groupMetadata(m.chat)
  const isUserAdmin = groupMetadata.participants.find(p => p.id === who)?.admin
  if (isUserAdmin) {
    return conn.sendMessage(m.chat, {
      text: `[❗] @${who.split('@')[0]} ya es administrador del grupo.`,
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: [who]
      }
    }, { quoted: m })
  }
  
  try {
    await conn.groupParticipantsUpdate(m.chat, [who], 'promote')
    
    const groupName = (await conn.groupMetadata(m.chat)).subject
    
    return conn.sendMessage(m.chat, {
      text: `🌴 𝗔𝗱𝗺𝗶𝗻 𝗰𝗼𝗻𝘃𝗲𝗿𝘁𝗶𝗱𝗼 𝗰𝗼𝗿𝗿𝗲𝗰𝘁𝗮𝗺𝗲𝗻𝘁𝗲.\n\n> *Usuario:* @${who.split('@')[0]}\n> *Por:* @${m.sender.split('@')[0]}\n> *Grupo:* ${groupName}`,
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: [who, m.sender]
      }
    }, { quoted: m })
    
  } catch (e) {}
}

handler.command = ['promote', 'promover', 'daradmin']
handler.group = true
handler.admin = true
handler.botAdmin = true

export default handler