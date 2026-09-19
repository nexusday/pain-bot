import {
  findGroupParticipant,
  findBotParticipant,
  jidsParticipante,
  jidsSeSolapan,
  resolveTargetJids
} from '../lib/group-participant.js'

function resolverObjetivo(m, args) {
  if (m.mentionedJid?.length) return m.mentionedJid[0]
  if (m.quoted?.sender) return m.quoted.sender
  if (m.msg?.contextInfo?.participant) return m.msg.contextInfo.participant
  if (args?.[0]) {
    const id = String(args[0]).replace(/[^0-9]/g, '')
    if (id) return id + '@s.whatsapp.net'
  }
  return null
}

function idsOwners() {
  const lista = []
  for (const v of global.owner || []) {
    const num = (Array.isArray(v) ? v[0] : v)?.toString?.().replace(/[^0-9]/g, '') || ''
    if (num) lista.push(num + '@s.whatsapp.net')
  }
  for (const v of global.ownerLid || []) {
    const num = (Array.isArray(v) ? v[0] : v)?.toString?.().replace(/[^0-9]/g, '') || ''
    if (num) lista.push(num + '@lid')
  }
  return lista
}

let handler = async (m, { conn, args, participants, isAdmin, isBotAdmin, usedPrefix, command }) => {
  const metadatos =
    (m.isGroup
      ? (conn.chats[m.chat] || {}).metadata ||
        (await conn.groupMetadata(m.chat).catch(_ => null))
      : {}) || {}
  const partes = (m.isGroup ? metadatos.participants : []) || participants || []

  const usuario = (m.isGroup ? findGroupParticipant(partes, m, conn) : null) || {}
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

  const botPart = findBotParticipant(partes, conn)
  const botEsAdmin = Boolean(isBotAdmin) || botPart?.admin === 'admin' || botPart?.admin === 'superadmin'
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

  const quienRaw = resolverObjetivo(m, args)
  if (!quienRaw) {
    return conn.sendMessage(
      m.chat,
      {
        text:
          `[❗] Menciona o *responde el mensaje* del usuario.\n\n` +
          `> ${usedPrefix + command} @usuario\n` +
          `> (responde un mensaje) ${usedPrefix + command}`,
        contextInfo: { ...rcanal.contextInfo }
      },
      { quoted: m }
    )
  }

  const participanteObjetivo = findGroupParticipant(partes, quienRaw, conn)
  const idsObjetivo = resolveTargetJids(quienRaw, partes, conn)
  const quien =
    participanteObjetivo?.id ||
    idsObjetivo[0] ||
    quienRaw

  if (!participanteObjetivo) {
    return conn.sendMessage(
      m.chat,
      {
        text: '[❗] No encontré a ese usuario en el grupo.',
        contextInfo: { ...rcanal.contextInfo }
      },
      { quoted: m }
    )
  }

  const esAdminObjetivo =
    participanteObjetivo?.admin === 'admin' ||
    participanteObjetivo?.admin === 'superadmin'

  if (esAdminObjetivo) {
    return conn.sendMessage(
      m.chat,
      {
        text: '[❗] No puedes eliminar a un administrador del grupo.',
        contextInfo: { ...rcanal.contextInfo }
      },
      { quoted: m }
    )
  }

  if (jidsSeSolapan(idsObjetivo, idsOwners())) {
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
  if (jidsSeSolapan(idsObjetivo, idsBot)) {
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

  const nombreGrupo = metadatos.subject || (await conn.groupMetadata(m.chat).catch(() => ({})))?.subject || ''

  return conn.sendMessage(
    m.chat,
    {
      text:
        `🌴 𝗨𝘀𝘂𝗮𝗿𝗶𝗼 𝗯𝗮𝗻𝗲𝗮𝗱𝗼 𝗰𝗼𝗿𝗿𝗲𝗰𝘁𝗮𝗺𝗲𝗻𝘁𝗲\n\n` +
        `> *Usuario:* @${String(quien).split('@')[0]}\n` +
        `> *Por:* @${m.sender.split('@')[0]}\n` +
        `> *Grupo:* ${nombreGrupo}`,
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
