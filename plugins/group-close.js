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
  
  
  try {
    const metadatosGrupo = await conn.groupMetadata(m.chat)
    const nombreGrupo = metadatosGrupo.subject
    
  
    if (metadatosGrupo.announce) {
      return conn.sendMessage(m.chat, {
        text: `[❗] Este grupo ya está cerrado.`,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }
    
    await conn.groupSettingUpdate(m.chat, 'announcement')
    
    return conn.sendMessage(m.chat, {
      text: `🌴 𝗚𝗿𝘂𝗽𝗼 𝗰𝗲𝗿𝗿𝗮𝗱𝗼 𝗰𝗼𝗿𝗿𝗲𝗰𝘁𝗮𝗺𝗲𝗻𝘁𝗲.\n\n> *Grupo:* ${nombreGrupo}\n> *Por:* @${m.sender.split('@')[0]}`,
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: [m.sender]
      }
    }, { quoted: m })
    
  } catch (e) {
    console.error('Error al cerrar grupo:', e)
    return conn.sendMessage(m.chat, {
      text: '[❗] Debo ser admin para ejecutar este Comando.',
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
}

handler.command = ['close', 'cerrar', 'grupo-cerrado']
handler.group = true
handler.admin = true
handler.botAdmin = true

export default handler