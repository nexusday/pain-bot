import { findGroupParticipant } from '../lib/group-participant.js'

let handler = async (m, { conn, args, usedPrefix, command, isAdmin, isBotAdmin, isOwner, isPrems }) => {
 
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



  const nuevoNombre = args.join(' ').trim()

  if (!nuevoNombre) {
    return conn.sendMessage(m.chat, {
      text: `[❗] Debes poner el nuevo nombre del grupo.\n\n*Ejemplo:*\n- ${usedPrefix + command} Grupo de diversión`,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }

  if (nuevoNombre.length > 100) {
    return conn.sendMessage(m.chat, {
      text: `[❗] El nombre es demasiado largo.\n\n*Máximo permitido:* 100 caracteres\n*Tu nombre:* ${nuevoNombre.length} caracteres` ,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }

  try {
    const metadatos = await conn.groupMetadata(m.chat)
    const nombreAnterior = metadatos?.subject || 'Sin nombre'

    await conn.groupUpdateSubject(m.chat, nuevoNombre)

    return conn.sendMessage(m.chat, {
      text: `🌴 𝗡𝗼𝗺𝗯𝗿𝗲 𝗮𝗰𝘁𝘂𝗮𝗹𝗶𝘇𝗮𝗱𝗼\n> *Antes:* ${nombreAnterior}\n> *Ahora:* ${nuevoNombre}\n│\n> *Por:* @${m.sender.split('@')[0]}\n`,
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: [m.sender]
      }
    }, { quoted: m })
  } catch (e) {
    console.error('Error cambiando nombre del grupo:', e)
    return conn.sendMessage(m.chat, {
      text: '[❌] No se pudo cambiar el nombre del grupo. Asegúrate de que el bot sea administrador.',
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
}

handler.command = ['namegp']
handler.group = true
handler.admin = true
handler.botAdmin = true

export default handler
