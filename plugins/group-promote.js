import { findGroupParticipant } from '../lib/group-participant.js'

let handler = async (m, { conn, args, participants, isAdmin, isBotAdmin, isOwner, isPrems, usedPrefix, command }) => {

  const metadatosVerificacionAdmin = (m.isGroup ? ((conn.chats[m.chat] || {}).metadata || await conn.groupMetadata(m.chat).catch(_ => null)) : {}) || {}  
  const participantesGrupo = (m.isGroup ? metadatosVerificacionAdmin.participants : []) || []  
  const usuario = (m.isGroup ? findGroupParticipant(participantesGrupo, m, conn) : {}) || {}  
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
      text: `[❗] Debes mencionar a un usuario para ponerlo de admin\n\n> *Ejemplo:* ${usedPrefix + command} @usuario`,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
  
  const quien = m.mentionedJid[0]
  
  if (quien === conn.user.jid) return conn.sendMessage(m.chat, {
    text: '[❗] No puedes promover al bot.',
    contextInfo: {
      ...rcanal.contextInfo
    }
  }, { quoted: m })
  
  const metadatosGrupo = await conn.groupMetadata(m.chat)
  const esUsuarioAdmin = metadatosGrupo.participants.find(p => p.id === quien)?.admin
  if (esUsuarioAdmin) {
    return conn.sendMessage(m.chat, {
      text: `[❗] @${quien.split('@')[0]} ya es administrador del grupo.`,
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: [quien]
      }
    }, { quoted: m })
  }
  
  try {
    await conn.groupParticipantsUpdate(m.chat, [quien], 'promote')
    
    const nombreGrupo = (await conn.groupMetadata(m.chat)).subject
    
    return conn.sendMessage(m.chat, {
      text: `🌴 𝗔𝗱𝗺𝗶𝗻 𝗰𝗼𝗻𝘃𝗲𝗿𝘁𝗶𝗱𝗼 𝗰𝗼𝗿𝗿𝗲𝗰𝘁𝗮𝗺𝗲𝗻𝘁𝗲.\n\n> *Usuario:* @${quien.split('@')[0]}\n> *Por:* @${m.sender.split('@')[0]}\n> *Grupo:* ${nombreGrupo}`,
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: [quien, m.sender]
      }
    }, { quoted: m })
    
  } catch (e) {}
}

handler.command = ['promote', 'promover', 'daradmin']
handler.group = true
handler.admin = true
handler.botAdmin = true

export default handler