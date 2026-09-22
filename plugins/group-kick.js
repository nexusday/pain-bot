import {
  findGroupParticipant,
  findBotParticipant,
  jidsParticipante,
  jidsSeSolapan
} from '../lib/group-participant.js'
import {
  resolveGroupTarget,
  isOwnerJid,
  isSenderBotOwner
} from '../lib/resolve-group-target.js'

let handler = async (m, { conn, args, participants, isAdmin, isBotAdmin, usedPrefix, command }) => {
  if (!m.isGroup) {
    return conn.sendMessage(
      m.chat,
      {
        text: '[❗] Este comando solo puede ser usado en grupos.',
        contextInfo: { ...rcanal.contextInfo }
      },
      { quoted: m }
    )
  }

  const metadatos =
    (conn.chats[m.chat] || {}).metadata ||
    (await conn.groupMetadata(m.chat).catch(_ => null)) ||
    {}
  const partes = metadatos.participants || participants || []

  const usuario = findGroupParticipant(partes, m, conn) || {}
  const esSuperAdmin = usuario?.admin == 'superadmin' || false
  const esAdminManual =
    Boolean(isAdmin) || esSuperAdmin || usuario?.admin == 'admin' || false

  const esOwnerManual = isSenderBotOwner(m, conn)

  if (!esAdminManual && !esSuperAdmin && !esOwnerManual) {
    return conn.reply(m.chat, '[❗] Solo los administradores pueden usar este comando.', m)
  }

  const botPart = findBotParticipant(partes, conn)
  const botEsAdmin =
    Boolean(isBotAdmin) ||
    botPart?.admin === 'admin' ||
    botPart?.admin === 'superadmin'
  if (!botEsAdmin) {
    return conn.sendMessage(
      m.chat,
      {
        text: '[❗] Necesito ser administrador del grupo para banear.',
        contextInfo: { ...rcanal.contextInfo }
      },
      { quoted: m }
    )
  }

  const objetivo = await resolveGroupTarget(m, args, conn, partes)
  if (!objetivo.ok) {
    return conn.sendMessage(
      m.chat,
      {
        text:
          objetivo.reason === 'not_in_group'
            ? `[❗] No encontré a ese usuario en el grupo.\n> Prueba: ${usedPrefix + command} @usuario`
            : `[❗] Menciona o *responde el mensaje* del usuario.\n\n> ${usedPrefix + command} @usuario\n> (responde un mensaje) ${usedPrefix + command}`,
        contextInfo: { ...rcanal.contextInfo }
      },
      { quoted: m }
    )
  }

  const { quien, participante, ids } = objetivo

  if (participante?.admin === 'admin' || participante?.admin === 'superadmin') {
    return conn.sendMessage(
      m.chat,
      {
        text: '[❗] No puedes eliminar a un administrador del grupo.',
        contextInfo: { ...rcanal.contextInfo }
      },
      { quoted: m }
    )
  }

  if (isOwnerJid(ids, conn)) {
    return conn.sendMessage(
      m.chat,
      {
        text: '[❗] No puedes eliminar a un propietario del bot.',
        contextInfo: { ...rcanal.contextInfo }
      },
      { quoted: m }
    )
  }

  const idsBot = jidsParticipante(botPart, conn).concat(
    [conn.user?.jid, conn.user?.id].filter(Boolean)
  )
  if (jidsSeSolapan(ids, idsBot)) {
    return conn.sendMessage(
      m.chat,
      {
        text: '[❗] No se puede usar este comando para eliminar al bot.',
        contextInfo: { ...rcanal.contextInfo }
      },
      { quoted: m }
    )
  }

  await conn.groupParticipantsUpdate(m.chat, [quien], 'remove')

  if (!global.db.data.users[quien]) global.db.data.users[quien] = {}
  global.db.data.users[quien].banned = true

  return conn.sendMessage(
    m.chat,
    {
      text:
        `🌴 𝗨𝘀𝘂𝗮𝗿𝗶𝗼 𝗯𝗮𝗻𝗲𝗮𝗱𝗼 𝗰𝗼𝗿𝗿𝗲𝗰𝘁𝗮𝗺𝗲𝗻𝘁𝗲\n\n` +
        `> *Usuario:* @${String(quien).split('@')[0]}\n` +
        `> *Por:* @${m.sender.split('@')[0]}\n` +
        `> *Grupo:* ${metadatos.subject || ''}`,
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: [quien, m.sender]
      }
    },
    { quoted: m }
  )
}

handler.help = ['#ban @usuario / responder mensaje']
handler.tags = ['grupo', 'admins']
handler.command = ['ban', 'kick']
handler.group = true
handler.admin = true
handler.botAdmin = true

export default handler
