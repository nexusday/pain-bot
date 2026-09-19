import { findGroupParticipant } from '../lib/group-participant.js'
import {
  resolveGroupTarget,
  findWarningKey
} from '../lib/resolve-group-target.js'

let handler = async (m, { conn, args, participants, isAdmin, usedPrefix, command }) => {
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
  const esAdminManual =
    Boolean(isAdmin) ||
    usuario?.admin === 'admin' ||
    usuario?.admin === 'superadmin'
  const esOwnerManual =
    global.owner?.some(
      ([numero]) =>
        String(numero).replace(/[^0-9]/g, '') + '@s.whatsapp.net' === m.sender
    ) ||
    global.ownerLid?.some(
      ([numero]) => String(numero).replace(/[^0-9]/g, '') + '@lid' === m.sender
    ) ||
    m.sender === conn.user?.jid

  if (!esAdminManual && !esOwnerManual) {
    return conn.reply(m.chat, '[❗] Solo los administradores pueden usar este comando.', m)
  }

  const objetivo = await resolveGroupTarget(m, args, conn, partes)
  if (!objetivo.ok) {
    return conn.sendMessage(
      m.chat,
      {
        text:
          objetivo.reason === 'not_in_group'
            ? `[❗] No encontré a ese usuario en el grupo.\n> Prueba: ${usedPrefix + command} @usuario`
            : `[❗] Menciona o *responde el mensaje*.\n\n> ${usedPrefix + command} @usuario\n> (responde) ${usedPrefix + command}`,
        contextInfo: { ...rcanal.contextInfo }
      },
      { quoted: m }
    )
  }

  const { quien, ids } = objetivo

  if (!global.db.data.warnings) global.db.data.warnings = {}
  if (!global.db.data.warnings[m.chat]) global.db.data.warnings[m.chat] = {}

  const clave =
    findWarningKey(m.chat, ids) ||
    (global.db.data.warnings[m.chat][quien] ? quien : null)

  if (!clave || !global.db.data.warnings[m.chat][clave]?.count) {
    return conn.sendMessage(
      m.chat,
      {
        text: `[❗] @${String(quien).split('@')[0]} no tiene advertencias registradas.`,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [quien]
        }
      },
      { quoted: m }
    )
  }

  const advertenciasAnteriores = global.db.data.warnings[m.chat][clave].count
  delete global.db.data.warnings[m.chat][clave]

  return conn.sendMessage(
    m.chat,
    {
      text:
        `🌴 𝗔𝗱𝘃𝗲𝗿𝘁𝗲𝗻𝗰𝗶𝗮𝘀 𝗘𝗹𝗶𝗺𝗶𝗻𝗮𝗱𝗮𝘀\n` +
        `> *Usuario:* @${String(quien).split('@')[0]}\n` +
        `> *Por:* @${m.sender.split('@')[0]}\n` +
        `> *Advertencias eliminadas:* ${advertenciasAnteriores}\n` +
        `> *Grupo:* ${metadatos.subject || ''}`,
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: [quien, m.sender]
      }
    },
    { quoted: m }
  )
}

handler.help = ['#delwarn @usuario / responder']
handler.command = ['delwarn', 'delwarns', 'eliminaradvertencia', 'limpiaradvertencias']
handler.group = true
handler.admin = true

export default handler
