import {
  findGroupParticipant,
  findBotParticipant,
  jidsParticipante,
  jidsSeSolapan,
  resolveTargetJids
} from '../lib/group-participant.js'
import { resolvePhoneNumber } from '../lib/resolve-phone.js'

function esJidLid(jid = '') {
  const j = String(jid || '')
  return j.endsWith('@lid') || j.endsWith('@hosted.lid')
}

function agregarJid(set, conn, jid) {
  if (!jid || typeof jid !== 'string') return
  try {
    set.add(conn?.decodeJid?.(jid) || jid)
  } catch {
    set.add(jid)
  }
}

async function expandirCandidatos(conn, chatId, candidatos, m, participants) {
  const set = new Set()
  for (const j of candidatos) agregarJid(set, conn, j)

  const base = [...set]
  for (const j of base) {
    if (!esJidLid(j)) continue

    try {
      const pn = await conn?.signalRepository?.lidMapping?.getPNForLID?.(j)
      if (pn) agregarJid(set, conn, pn)
    } catch {}

    try {
      const real = await String.prototype.resolveLidToRealJid.call(j, chatId, conn, 2, 0)
      if (real) agregarJid(set, conn, real)
    } catch {}

    try {
      const phone = await resolvePhoneNumber(j, conn, null, m, {
        participants,
        groupId: chatId
      })
      if (phone) agregarJid(set, conn, `${phone}@s.whatsapp.net`)
    } catch {}
  }

  return [...set]
}

async function recolectarCandidatosObjetivo(m, args, conn, participants) {
  const crudos = []

  if (m.mentionedJid?.length) crudos.push(...m.mentionedJid)

  const ctx = m.msg?.contextInfo || {}
  if (ctx.participant) crudos.push(ctx.participant)
  if (typeof m.quoted?.sender === 'string') crudos.push(m.quoted.sender)

  if (args?.[0]) {
    const id = String(args[0]).replace(/[^0-9]/g, '')
    if (id) crudos.push(`${id}@s.whatsapp.net`)
  }

  return expandirCandidatos(conn, m.chat, crudos.filter(Boolean), m, participants)
}

function encontrarParticipantePorCandidatos(participants, candidatos, conn) {
  for (const c of candidatos) {
    const p = findGroupParticipant(participants, c, conn)
    if (p) return p
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

  const candidatos = await recolectarCandidatosObjetivo(m, args, conn, partes)
  if (!candidatos.length) {
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

  const participanteObjetivo = encontrarParticipantePorCandidatos(partes, candidatos, conn)
  if (!participanteObjetivo) {
    return conn.sendMessage(
      m.chat,
      {
        text:
          '[❗] No encontré a ese usuario en el grupo.\n' +
          '> Prueba mencionándolo: ' + usedPrefix + command + ' @usuario',
        contextInfo: { ...rcanal.contextInfo }
      },
      { quoted: m }
    )
  }

  const idsObjetivo = [
    ...jidsParticipante(participanteObjetivo, conn),
    ...resolveTargetJids(candidatos[0], partes, conn)
  ]
  const quien = participanteObjetivo.id

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

  const nombreGrupo = metadatos.subject || ''

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
