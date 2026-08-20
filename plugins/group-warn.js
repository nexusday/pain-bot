import { findGroupParticipant } from '../lib/group-participant.js'

let handler = async (m, { conn, args, participants, isAdmin, isBotAdmin, isOwner, isPrems, usedPrefix, command }) => {
  
  const adminCheckMetadata = (m.isGroup ? ((conn.chats[m.chat] || {}).metadata || await conn.groupMetadata(m.chat).catch(_ => null)) : {}) || {}  
  const groupParticipants = (m.isGroup ? adminCheckMetadata.participants : []) || []  
  const user = (m.isGroup ? findGroupParticipant(groupParticipants, m, conn) : {}) || {}  
  const isRAdmin = user?.admin == 'superadmin' || false  
  const isAdminManual = Boolean(isAdmin) || isRAdmin || user?.admin == 'admin' || false  
  
  
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
      text: `[❗] Debes mencionar al usuario que deseas advertir.\n\n> *Ejemplo:* ${usedPrefix + command} @usuario [motivo]`,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
  
  const who = m.mentionedJid[0]
  const reason = args.slice(1).join(' ') || 'Sin motivo especificado'
  
  const ownerNumbers = global.owner.map(v => {
    const id = typeof v === 'string' ? v.replace(/[^0-9]/g, '') : String(v).replace(/[^0-9]/g, '');
    return id + '@s.whatsapp.net';
  });
  
  if (ownerNumbers.includes(who)) {
    return conn.sendMessage(m.chat, {
      text: '[❗] No puedes advertir a un propietario del bot.',
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
  
  if (who === conn.user.jid) return conn.sendMessage(m.chat, {
    text: '[❗] No puedes advertir al bot.',
    contextInfo: {
      ...rcanal.contextInfo
    }
  }, { quoted: m })
  
  const groupMetadata = await conn.groupMetadata(m.chat)
  const isUserAdmin = groupMetadata.participants.find(p => p.id === who)?.admin
  if (isUserAdmin && !isOwner) {
    return conn.sendMessage(m.chat, {
      text: '[❗] No puedes advertir a otro administrador.',
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }

  if (!global.db.data.warnings) global.db.data.warnings = {}
  if (!global.db.data.warnings[m.chat]) global.db.data.warnings[m.chat] = {}
  if (!global.db.data.warnings[m.chat][who]) {
    global.db.data.warnings[m.chat][who] = {
      count: 0,
      warnings: []
    }
  }

  const userWarnings = global.db.data.warnings[m.chat][who]
  userWarnings.count++
  userWarnings.warnings.push({
    reason: reason,
    admin: m.sender,
    date: new Date().toISOString(),
    timestamp: Date.now()
  })

  const userName = await conn.getName(who)
  const adminName = await conn.getName(m.sender)
  const groupName = groupMetadata.subject

  if (userWarnings.count >= 3) {
    try {
      await conn.groupParticipantsUpdate(m.chat, [who], 'remove')
      
      if (!global.db.data.users[who]) {
        global.db.data.users[who] = {}
      }
      global.db.data.users[who].banned = true
      
      delete global.db.data.warnings[m.chat][who]
      
      return conn.sendMessage(m.chat, {
        text: `🌴 𝗨𝘀𝘂𝗮𝗿𝗶𝗼 𝗘𝘅𝗽𝘂𝗹𝘀𝗮𝗱𝗼\n> *Usuario:* @${who.split('@')[0]}\n> *Por:* @${m.sender.split('@')[0]}\n> *Motivo:* ${reason}\n> *Advertencias:* 3/3`,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [who, m.sender]
        }
      }, { quoted: m })
      
    } catch (error) {
      console.error('Error expulsando usuario:', error)
      return conn.sendMessage(m.chat, {
        text: `[❌] Error al expulsar al usuario.`,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }
  } else {
    
    const remainingWarnings = 3 - userWarnings.count
    
    return conn.sendMessage(m.chat, {
      text: `🌴 𝗔𝗱𝘃𝗲𝗿𝘁𝗲𝗻𝗰𝗶𝗮 𝗮𝗴𝗿𝗲𝗴𝗮𝗱𝗮\n> *Usuario:* @${who.split('@')[0]}\n> *Por:* @${m.sender.split('@')[0]}\n> *Motivo:* ${reason}\n> *Advertencias:* ${userWarnings.count}/3\n│\n> *Le quedan:* ${remainingWarnings} advertencia(s)\n${userWarnings.count === 2 ? '> *¡ÚLTIMA ADVERTENCIA!*\n' : ''}> *Nota:* Al llegar a 3 advertencias serás expulsado automáticamente`,
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: [who, m.sender]
      }
    }, { quoted: m })
  }
}

handler.command = ['warn', 'advertir', 'advertencia']
handler.group = true
handler.admin = true
handler.botAdmin = true

export default handler
