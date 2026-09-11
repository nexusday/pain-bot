import { findGroupParticipant } from '../lib/group-participant.js'

let handler = async (m, { conn, args, participants, isAdmin, isBotAdmin, isOwner, isPrems, usedPrefix, command }) => {

  const metadatosVerificacionAdmin = (m.isGroup ? ((conn.chats[m.chat] || {}).metadata || await conn.groupMetadata(m.chat).catch(_ => null)) : {}) || {}  
  const participantesGrupo = (m.isGroup ? metadatosVerificacionAdmin.participants : []) || []  
  const usuario = (m.isGroup ? findGroupParticipant(participantesGrupo, m, conn) : null) || {}  
  const esSuperAdmin = usuario?.admin == 'superadmin' || false  
  const esAdminManual = Boolean(isAdmin) || esSuperAdmin || usuario?.admin == 'admin' || false  
  

  const esOwnerManual = global.owner.some(([numero]) => numero.replace(/[^0-9]/g, '') + '@s.whatsapp.net' === m.sender) || 
                  global.ownerLid?.some(([numero]) => numero.replace(/[^0-9]/g, '') + '@lid' === m.sender) ||
                  m.sender === conn.user.jid
  
  if (!esAdminManual && !esSuperAdmin && !esOwnerManual) {
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
  const quien = m.mentionedJid[0]
  
  const usuarioObjetivo = participants.find(u => u.id === quien)
  const esAdminObjetivo = usuarioObjetivo?.admin === 'admin' || usuarioObjetivo?.admin === 'superadmin'
  
  if (esAdminObjetivo) {
    return conn.sendMessage(m.chat, {
      text: '[❗] No puedes eliminar a un administrador del grupo.',
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
  
  const numerosOwner = global.owner.map(v => {
    const id = typeof v === 'string' ? v.replace(/[^0-9]/g, '') : String(v).replace(/[^0-9]/g, '');
    return id + '@s.whatsapp.net';
  });
  
  if (numerosOwner.includes(quien)) {
    return conn.sendMessage(m.chat, {
      text: '[❗] No puedes eliminar a un propietario del bot.',
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
  
  if (quien === conn.user.jid) return conn.sendMessage(m.chat, {
    text: '[❗] No se puede usar este comando para eliminar al bot.',
    contextInfo: {
      ...rcanal.contextInfo
    }
  }, { quoted: m })
  
  await conn.groupParticipantsUpdate(m.chat, [quien], 'remove')
  
  if (!global.db.data.users[quien]) {
    global.db.data.users[quien] = {}
  }
  global.db.data.users[quien].banned = true
  

  const nombreUsuario = await conn.getName(quien)
  const nombreAdmin = await conn.getName(m.sender)
  const nombreGrupo = (await conn.groupMetadata(m.chat)).subject
  

  return conn.sendMessage(m.chat, {
    text: `🌴 𝗨𝘀𝘂𝗮𝗿𝗶𝗼 𝗯𝗮𝗻𝗲𝗮𝗱𝗼 𝗰𝗼𝗿𝗿𝗲𝗰𝘁𝗮𝗺𝗲𝗻𝘁𝗲\n\n> *Usuario:* @${quien.split('@')[0]}\n> *Por:* @${m.sender.split('@')[0]}\n> *Grupo:* ${nombreGrupo}`,
    contextInfo: {
      ...rcanal.contextInfo,
      mentionedJid: [quien, m.sender]
    }
  }, { quoted: m })
}

handler.command = ['ban', 'kick']
handler.group = true
handler.admin = true
handler.botAdmin = true

export default handler