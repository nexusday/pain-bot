import { generateWAMessageFromContent } from '@whiskeysockets/baileys'

var handler = async (m, { conn, text, participants }) => {
  
  const adminCheckMetadata = (m.isGroup ? ((conn.chats[m.chat] || {}).metadata || await this.groupMetadata(m.chat).catch(_ => null)) : {}) || {}  
  const groupParticipants = (m.isGroup ? adminCheckMetadata.participants : []) || []  
  const user = (m.isGroup ? groupParticipants.find(u => conn.decodeJid(u.id) === m.sender) : {}) || {}  
  const isRAdmin = user?.admin == 'superadmin' || false  
  const isAdminManual = isRAdmin || user?.admin == 'admin' || false  
  
  
  const isOwner = global.owner.some(([number]) => number.replace(/[^0-9]/g, '') + '@s.whatsapp.net' === m.sender) || 
                  global.ownerLid?.some(([number]) => number.replace(/[^0-9]/g, '') + '@lid' === m.sender) ||
                  m.sender === conn.user.jid
  
  if (!isAdminManual && !isRAdmin && !isOwner) {
    return conn.reply(m.chat, 'ඞ Solo los administradores pueden usar este comando.', m)
  }

  if (!m.quoted && !text) 
    return conn.reply(m.chat, 'ඞ Debes enviar un texto o responder a un mensaje para hacer un tag.', m)

  let users = participants.map(u => conn.decodeJid(u.id))
  let htextos = text || (m.quoted?.text ? m.quoted.text : "¡¡¡Hola!!!")

  try {
    let quoted = m.quoted ? await m.getQuotedObj() : null
    let msg = conn.cMod(
      m.chat,
      generateWAMessageFromContent(
        m.chat,
        { [quoted ? quoted.mtype : 'extendedTextMessage']: quoted ? quoted.message[quoted.mtype] : { text: htextos } },
        { quoted: null, userJid: conn.user.id }
      ),
      htextos,
      conn.user.jid,
      { mentions: users }
    )

    await conn.relayMessage(m.chat, msg.message, { messageId: msg.key?.id || undefined })
  } catch {
    let quoted = m.quoted || m
    let mime = (quoted.msg || quoted).mimetype || ''
    let isMedia = /image|video|sticker|audio/.test(mime)
    let more = String.fromCharCode(8206)
    let masss = more.repeat(850)

    if (isMedia && quoted.mtype === 'imageMessage') {
      let mediax = await quoted.download?.()
      await conn.sendMessage(m.chat, { image: mediax, caption: htextos, mentions: users }, { quoted: null })
    } else if (isMedia && quoted.mtype === 'videoMessage') {
      let mediax = await quoted.download?.()
      await conn.sendMessage(m.chat, { video: mediax, mimetype: 'video/mp4', caption: htextos, mentions: users }, { quoted: null })
    } else if (isMedia && quoted.mtype === 'audioMessage') {
      let mediax = await quoted.download?.()
      await conn.sendMessage(m.chat, { audio: mediax, mimetype: 'audio/mpeg', fileName: 'hidetag.mp3', mentions: users }, { quoted: null })
    } else if (isMedia && quoted.mtype === 'stickerMessage') {
      let mediax = await quoted.download?.()
      await conn.sendMessage(m.chat, { sticker: mediax, mentions: users }, { quoted: null })
    } else {
      await conn.sendMessage(m.chat, { text: `${masss}\n${htextos}\n`, mentions: users }, { quoted: null })
    }
  }
}

handler.help = ['hidetag\n→ Solo administradores y owner: Hace un tag a todos los miembros del grupo']
handler.tags = ['grupo']
handler.command = ['hidetag', 'notificar', 'notify', 'tag']
handler.group = true
handler.admin = true

export default handler