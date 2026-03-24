import { isJidGroup } from '@whiskeysockets/baileys'

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
      text: `[❗] Debes mencionar al usuario que deseas banear.\n\n> *Ejemplo:* ${usedPrefix + command} @usuario`,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
  const who = m.mentionedJid[0]
  
  const targetUser = participants.find(u => u.id === who)
  const isTargetAdmin = targetUser?.admin === 'admin' || targetUser?.admin === 'superadmin'
  
  if (isTargetAdmin) {
    return conn.sendMessage(m.chat, {
      text: '[❗] No puedes eliminar a un administrador del grupo.',
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
  
  const ownerNumbers = global.owner.map(v => {
    const id = typeof v === 'string' ? v.replace(/[^0-9]/g, '') : String(v).replace(/[^0-9]/g, '');
    return id + '@s.whatsapp.net';
  });
  
  if (ownerNumbers.includes(who)) {
    return conn.sendMessage(m.chat, {
      text: '[❗] No puedes eliminar a un propietario del bot.',
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
  
  if (who === conn.user.jid) return conn.sendMessage(m.chat, {
    text: '[❗] No se puede usar este comando para eliminar al bot.',
    contextInfo: {
      ...rcanal.contextInfo
    }
  }, { quoted: m })
  
  await conn.groupParticipantsUpdate(m.chat, [who], 'remove')
  
  if (!global.db.data.users[who]) {
    global.db.data.users[who] = {}
  }
  global.db.data.users[who].banned = true
  

  const userName = await conn.getName(who)
  const adminName = await conn.getName(m.sender)
  const groupName = (await conn.groupMetadata(m.chat)).subject
  

  return conn.sendMessage(m.chat, {
    text: `🌴 𝗨𝘀𝘂𝗮𝗿𝗶𝗼 𝗯𝗮𝗻𝗲𝗮𝗱𝗼 𝗰𝗼𝗿𝗿𝗲𝗰𝘁𝗮𝗺𝗲𝗻𝘁𝗲\n\n> *Usuario:* @${who.split('@')[0]}\n> *Por:* @${m.sender.split('@')[0]}\n> *Grupo:* ${groupName}`,
    contextInfo: {
      ...rcanal.contextInfo,
      mentionedJid: [who, m.sender]
    }
  }, { quoted: m })
}

handler.command = ['ban', 'kick']
handler.group = true
handler.admin = true
handler.botAdmin = true

export default handler