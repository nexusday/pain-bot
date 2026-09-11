import { generateWAMessageFromContent } from '@whiskeysockets/baileys'
import { findGroupParticipant } from '../lib/group-participant.js'

var handler = async (m, { conn, text, participants, isAdmin }) => {
  
  const metadatosVerificacionAdmin = (m.isGroup ? ((conn.chats[m.chat] || {}).metadata || await conn.groupMetadata(m.chat).catch(_ => null)) : {}) || {}  
  const participantesGrupo = (m.isGroup ? metadatosVerificacionAdmin.participants : []) || []  
  const usuario = (m.isGroup ? findGroupParticipant(participantesGrupo, m, conn) : null) || {}  
  const esSuperAdmin = usuario?.admin == 'superadmin' || false  
  const esAdminManual = Boolean(isAdmin) || esSuperAdmin || usuario?.admin == 'admin' || false  
  
  
  const esPropietario = global.owner.some(([numero]) => numero.replace(/[^0-9]/g, '') + '@s.whatsapp.net' === m.sender) || 
                  global.ownerLid?.some(([numero]) => numero.replace(/[^0-9]/g, '') + '@lid' === m.sender) ||
                  m.sender === conn.user.jid
  
  if (!esAdminManual && !esSuperAdmin && !esPropietario) {
    return conn.reply(m.chat, 'ඞ Solo los administradores pueden usar este comando.', m)
  }

  if (!m.quoted && !text) 
    return conn.reply(m.chat, 'ඞ Debes enviar un texto o responder a un mensaje para hacer un tag.', m)

  let usuarios = participants.map(u => conn.decodeJid(u.id))
  let textoTag = text || (m.quoted?.text ? m.quoted.text : "¡¡¡Hola!!!")

  try {
    let citado = m.quoted ? await m.getQuotedObj() : null
    let msgLocal = conn.cMod(
      m.chat,
      generateWAMessageFromContent(
        m.chat,
        { [citado ? citado.mtype : 'extendedTextMessage']: citado ? citado.message[citado.mtype] : { text: textoTag } },
        { quoted: null, userJid: conn.user.id }
      ),
      textoTag,
      conn.user.jid,
      { mentions: usuarios }
    )

    await conn.relayMessage(m.chat, msgLocal.message, { messageId: msgLocal.key?.id || undefined })
  } catch {
    let citado = m.quoted || m
    let tipoMime = (citado.msg || citado).mimetype || ''
    let esMedia = /image|video|sticker|audio/.test(tipoMime)
    let mas = String.fromCharCode(8206)
    let relleno = mas.repeat(850)

    if (esMedia && citado.mtype === 'imageMessage') {
      let mediaBuf = await citado.download?.()
      await conn.sendMessage(m.chat, { image: mediaBuf, caption: textoTag, mentions: usuarios }, { quoted: null })
    } else if (esMedia && citado.mtype === 'videoMessage') {
      let mediaBuf = await citado.download?.()
      await conn.sendMessage(m.chat, { video: mediaBuf, mimetype: 'video/mp4', caption: textoTag, mentions: usuarios }, { quoted: null })
    } else if (esMedia && citado.mtype === 'audioMessage') {
      let mediaBuf = await citado.download?.()
      await conn.sendMessage(m.chat, { audio: mediaBuf, mimetype: 'audio/mpeg', fileName: 'hidetag.mp3', mentions: usuarios }, { quoted: null })
    } else if (esMedia && citado.mtype === 'stickerMessage') {
      let mediaBuf = await citado.download?.()
      await conn.sendMessage(m.chat, { sticker: mediaBuf, mentions: usuarios }, { quoted: null })
    } else {
      await conn.sendMessage(m.chat, { text: `${relleno}\n${textoTag}\n`, mentions: usuarios }, { quoted: null })
    }
  }
}

handler.help = ['hidetag\n→ Solo administradores y owner: Hace un tag a todos los miembros del grupo']
handler.tags = ['grupo']
handler.command = ['hidetag', 'notificar', 'notify', 'tag']
handler.group = true
handler.admin = true

export default handler