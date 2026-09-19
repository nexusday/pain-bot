import {
  findGroupParticipant,
  findBotParticipant,
  jidsParticipante,
  jidsSeSolapan
} from '../lib/group-participant.js'
import { resolveGroupTarget } from '../lib/resolve-group-target.js'

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
  const esSuperAdmin = usuario?.admin == 'superadmin' || false
  const esAdminManual =
    Boolean(isAdmin) || esSuperAdmin || usuario?.admin == 'admin' || false

  const esOwnerManual =
    global.owner?.some(
      ([numero]) =>
        String(numero).replace(/[^0-9]/g, '') + '@s.whatsapp.net' === m.sender
    ) ||
    global.ownerLid?.some(
      ([numero]) => String(numero).replace(/[^0-9]/g, '') + '@lid' === m.sender
    ) ||
    m.sender === conn.user?.jid

  if (!esAdminManual && !esSuperAdmin && !esOwnerManual) {
    return conn.reply(m.chat, '[❗] Solo los administradores pueden usar este comando.', m)
  }

  const botPart = findBotParticipant(partes, conn)
  if (!(botPart?.admin === 'admin' || botPart?.admin === 'superadmin')) {
    return conn.sendMessage(
      m.chat,
      {
        text: '[❗] Necesito ser administrador del grupo.',
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
            : `[❗] Menciona o *responde el mensaje*.\n\n> ${usedPrefix + command} @usuario\n> (responde) ${usedPrefix + command}`,
        contextInfo: { ...rcanal.contextInfo }
      },
      { quoted: m }
    )
  }

  const { quien, participante, ids } = objetivo

  const idsBot = jidsParticipante(botPart, conn).concat(
    [conn.user?.jid, conn.user?.id].filter(Boolean)
  )
  if (jidsSeSolapan(ids, idsBot)) {
    return conn.sendMessage(
      m.chat,
      {
        text: '[❗] No puedes promover al bot.',
        contextInfo: { ...rcanal.contextInfo }
      },
      { quoted: m }
    )
  }

  if (participante?.admin === 'admin' || participante?.admin === 'superadmin') {
    return conn.sendMessage(
      m.chat,
      {
        text: `[❗] @${String(quien).split('@')[0]} ya es administrador del grupo.`,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [quien]
        }
      },
      { quoted: m }
    )
  }

  try {
    await conn.groupParticipantsUpdate(m.chat, [quien], 'promote')

    return conn.sendMessage(
      m.chat,
      {
        text:
          `🌴 𝗔𝗱𝗺𝗶𝗻 𝗰𝗼𝗻𝘃𝗲𝗿𝘁𝗶𝗱𝗼 𝗰𝗼𝗿𝗿𝗲𝗰𝘁𝗮𝗺𝗲𝗻𝘁𝗲.\n\n` +
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
  } catch (e) {
    console.error('[promote]', e)
    return conn.sendMessage(
      m.chat,
      {
        text: '[❌] No se pudo promover al usuario.',
        contextInfo: { ...rcanal.contextInfo }
      },
      { quoted: m }
    )
  }
}

handler.help = ['#promote @usuario / responder']
handler.command = ['promote', 'promover', 'daradmin']
handler.group = true
handler.admin = true
handler.botAdmin = true

export default handler
