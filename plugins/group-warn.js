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
      text: `[❗] Debes mencionar al usuario que deseas advertir.\n\n> *Ejemplo:* ${usedPrefix + command} @usuario [motivo]`,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
  
  const quien = m.mentionedJid[0]
  const motivo = args.slice(1).join(' ') || 'Sin motivo especificado'
  
  const numerosOwner = global.owner.map(v => {
    const id = typeof v === 'string' ? v.replace(/[^0-9]/g, '') : String(v).replace(/[^0-9]/g, '');
    return id + '@s.whatsapp.net';
  });
  
  if (numerosOwner.includes(quien)) {
    return conn.sendMessage(m.chat, {
      text: '[❗] No puedes advertir a un propietario del bot.',
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
  
  if (quien === conn.user.jid) return conn.sendMessage(m.chat, {
    text: '[❗] No puedes advertir al bot.',
    contextInfo: {
      ...rcanal.contextInfo
    }
  }, { quoted: m })
  
  const metadatosGrupo = await conn.groupMetadata(m.chat)
  const esUsuarioAdmin = metadatosGrupo.participants.find(p => p.id === quien)?.admin
  if (esUsuarioAdmin && !isOwner) {
    return conn.sendMessage(m.chat, {
      text: '[❗] No puedes advertir a otro administrador.',
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }

  if (!global.db.data.warnings) global.db.data.warnings = {}
  if (!global.db.data.warnings[m.chat]) global.db.data.warnings[m.chat] = {}
  if (!global.db.data.warnings[m.chat][quien]) {
    global.db.data.warnings[m.chat][quien] = {
      count: 0,
      warnings: []
    }
  }

  const advertenciasUsuario = global.db.data.warnings[m.chat][quien]
  advertenciasUsuario.count++
  advertenciasUsuario.warnings.push({
    reason: motivo,
    admin: m.sender,
    date: new Date().toISOString(),
    timestamp: Date.now()
  })

  const nombreUsuario = await conn.getName(quien)
  const nombreAdmin = await conn.getName(m.sender)
  const nombreGrupo = metadatosGrupo.subject

  if (advertenciasUsuario.count >= 3) {
    try {
      await conn.groupParticipantsUpdate(m.chat, [quien], 'remove')
      
      if (!global.db.data.users[quien]) {
        global.db.data.users[quien] = {}
      }
      global.db.data.users[quien].banned = true
      
      delete global.db.data.warnings[m.chat][quien]
      
      return conn.sendMessage(m.chat, {
        text: `🌴 𝗨𝘀𝘂𝗮𝗿𝗶𝗼 𝗘𝘅𝗽𝘂𝗹𝘀𝗮𝗱𝗼\n> *Usuario:* @${quien.split('@')[0]}\n> *Por:* @${m.sender.split('@')[0]}\n> *Motivo:* ${motivo}\n> *Advertencias:* 3/3`,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [quien, m.sender]
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
    
    const advertenciasRestantes = 3 - advertenciasUsuario.count
    
    return conn.sendMessage(m.chat, {
      text: `🌴 𝗔𝗱𝘃𝗲𝗿𝘁𝗲𝗻𝗰𝗶𝗮 𝗮𝗴𝗿𝗲𝗴𝗮𝗱𝗮\n> *Usuario:* @${quien.split('@')[0]}\n> *Por:* @${m.sender.split('@')[0]}\n> *Motivo:* ${motivo}\n> *Advertencias:* ${advertenciasUsuario.count}/3\n│\n> *Le quedan:* ${advertenciasRestantes} advertencia(s)\n${advertenciasUsuario.count === 2 ? '> *¡ÚLTIMA ADVERTENCIA!*\n' : ''}> *Nota:* Al llegar a 3 advertencias serás expulsado automáticamente`,
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: [quien, m.sender]
      }
    }, { quoted: m })
  }
}

handler.command = ['warn', 'advertir', 'advertencia']
handler.group = true
handler.admin = true
handler.botAdmin = true

export default handler
