import {
  canUseMod,
  isConfigOwnerIds,
  addStaff,
  removeStaffByIds,
  listStaff,
  construirEntradaStaff,
  clasificarIds,
  claveStaffBot,
  etiquetaScope,
  esBotPrincipal
} from '../lib/staff.js'
import { resolveGroupTarget, collectGroupTargetCandidates } from '../lib/resolve-group-target.js'
import { resolvePhoneNumber } from '../lib/resolve-phone.js'
import { jidsParticipante } from '../lib/group-participant.js'

function digitosDe(valor = '') {
  return String(valor || '').split('@')[0].split(':')[0].replace(/\D/g, '')
}

function esJidLid(jid = '') {
  const j = String(jid || '')
  return j.endsWith('@lid') || j.endsWith('@hosted.lid')
}

function ayuda(usedPrefix, command, conn) {
  const donde = etiquetaScope(conn)
  const quien = esBotPrincipal(conn)
    ? 'Solo *owners de config*'
    : 'Owners de *config* o el *dueño de este subbot*'
  return `*[👑] Staff / Mod* _(ámbito: ${donde})_\n\n` +
    `*Quién puede:* ${quien}\n\n` +
    `*Agregar:*\n` +
    `> ${usedPrefix + command} @usuario\n` +
    `> ${usedPrefix + command} 51999999999\n` +
    `> ${usedPrefix + command} 198119006412828\n` +
    `> (responde mensaje) ${usedPrefix + command}\n\n` +
    `*Quitar:*\n` +
    `> ${usedPrefix + command} del @usuario\n\n` +
    `*Lista:*\n` +
    `> ${usedPrefix + command} lista\n\n` +
    `• En el *principal* el staff solo vale para el principal.\n` +
    `• En un *subbot* el staff solo vale para ese subbot.\n` +
    `• Los owners de config.js son owners en todos los bots.\n` +
    `• No se pueden quitar owners de config`
}

async function recolectarIdsCompletos(m, args, conn, participants) {
  const ids = new Set()
  const add = (j) => {
    if (!j) return
    ids.add(String(j))
    const d = digitosDe(j)
    if (d) {
      ids.add(`${d}@s.whatsapp.net`)
      ids.add(`${d}@lid`)
      ids.add(d)
    }
  }

  const objetivo = await resolveGroupTarget(m, args, conn, participants || [])
  if (objetivo.ok) {
    for (const j of objetivo.ids || []) add(j)
    add(objetivo.quien)
    for (const j of jidsParticipante(objetivo.participante, conn)) add(j)
  } else {
    const candidatos = await collectGroupTargetCandidates(m, args, conn, participants || [])
    for (const j of candidatos) add(j)
  }

  for (const arg of args || []) {
    const d = digitosDe(arg)
    if (d.length >= 8) {
      add(d)
      add(`${d}@s.whatsapp.net`)
      add(`${d}@lid`)
    }
  }

  for (const j of [...ids]) {
    if (!esJidLid(j) && !String(j).includes('@lid')) continue
    try {
      const pn = await conn?.signalRepository?.lidMapping?.getPNForLID?.(j.includes('@') ? j : `${j}@lid`)
      if (pn) add(pn)
    } catch {}
    try {
      const phone = await resolvePhoneNumber(j, conn, null, m, {
        participants,
        groupId: m.isGroup ? m.chat : null
      })
      if (phone) add(`${phone}@s.whatsapp.net`)
    } catch {}
  }

  return [...ids]
}

async function nombreDesdeEntrada(m, conn, ids) {
  const nombreDe = async (jid) => {
    try {
      const n = await Promise.resolve(conn.getName?.(jid))
      return n || null
    } catch {
      return null
    }
  }
  const mencion = m.mentionedJid?.[0]
  if (mencion) return (await nombreDe(mencion)) || digitosDe(mencion)
  if (typeof m.quoted?.sender === 'string') {
    return (await nombreDe(m.quoted.sender)) || digitosDe(m.quoted.sender)
  }
  const pn = ids.find(j => String(j).endsWith('@s.whatsapp.net'))
  return digitosDe(pn || ids[0] || 'Staff')
}

let handler = async (m, { conn, args, participants, usedPrefix, command }) => {
  if (!canUseMod(m, conn)) {
    const msg = esBotPrincipal(conn)
      ? '[❗] Solo los *owners de config* pueden usar `/mod` en el bot principal.'
      : '[❗] Solo el *dueño de este subbot* o un *owner de config* pueden usar `/mod` aquí.'
    return conn.reply(m.chat, msg, m)
  }

  const sub = String(args[0] || '').toLowerCase().trim()
  const partes = m.isGroup
    ? (((conn.chats[m.chat] || {}).metadata || await conn.groupMetadata(m.chat).catch(() => null))?.participants || participants || [])
    : []
  const scopeLabel = etiquetaScope(conn)
  const clave = claveStaffBot(conn)

  if (!args.length && !m.mentionedJid?.length && !m.quoted) {
    return conn.reply(m.chat, ayuda(usedPrefix, command, conn), m)
  }

  if (['lista', 'list', 'ver'].includes(sub)) {
    const staff = listStaff(conn)
    if (!staff.length) {
      return conn.reply(m.chat, `[❗] No hay staff para *${scopeLabel}* en staff.`, m)
    }
    let texto = `👑 *STAFF — ${scopeLabel}* (${staff.length})\n\n`
    const mentions = []
    staff.forEach((s, i) => {
      const tag =
        s.ids?.find(j => String(j).includes('@')) ||
        (s.numbers?.[0] ? `${s.numbers[0]}@s.whatsapp.net` : null) ||
        (s.lids?.[0] ? `${s.lids[0]}@lid` : null)
      if (tag) mentions.push(tag)
      texto += `*${i + 1}.* ${s.name || 'Staff'}\n`
      if (s.numbers?.length) texto += `› Número(s): ${s.numbers.join(', ')}\n`
      if (s.lids?.length) texto += `› LID(s): ${s.lids.join(', ')}\n`
      if (tag) texto += `› Tag: @${String(tag).split('@')[0]}\n`
      texto += `\n`
    })
    return conn.sendMessage(
      m.chat,
      {
        text: texto.trim(),
        contextInfo: {
          ...global.rcanal?.contextInfo,
          ...(mentions.length ? { mentionedJid: mentions } : {})
        }
      },
      { quoted: m }
    )
  }

  const esDel = ['del', 'delete', 'quitar', 'remove', 'eliminar'].includes(sub)
  const argsObjetivo = esDel ? args.slice(1) : args

  if (esDel && !argsObjetivo.length && !m.mentionedJid?.length && !m.quoted) {
    return conn.reply(
      m.chat,
      `*[❗] Uso:*\n> ${usedPrefix + command} del @usuario\n> ${usedPrefix + command} del 51999...`,
      m
    )
  }

  const ids = await recolectarIdsCompletos(
    {
      ...m,
      mentionedJid: m.mentionedJid,
      quoted: m.quoted,
      text: argsObjetivo.join(' ')
    },
    argsObjetivo,
    conn,
    partes
  )

  if (!ids.length) {
    return conn.reply(m.chat, ayuda(usedPrefix, command, conn), m)
  }

  if (esDel) {
    if (isConfigOwnerIds(ids)) {
      return conn.reply(
        m.chat,
        '[❗] No puedes quitar *owners de config*. Solo se gestiona el staff de *staff*.',
        m
      )
    }
    const eliminado = removeStaffByIds(ids, conn)
    if (!eliminado) {
      return conn.reply(m.chat, `[❗] Ese usuario no está en el staff de *${scopeLabel}*.`, m)
    }
    const tag =
      eliminado.ids?.find(j => String(j).includes('@')) ||
      (eliminado.numbers?.[0] ? `${eliminado.numbers[0]}@s.whatsapp.net` : m.sender)
    return conn.sendMessage(
      m.chat,
      {
        text:
          `✅ *Staff eliminado* _(ámbito: ${scopeLabel})_\n\n` +
          `› Nombre: *${eliminado.name}*\n` +
          `› @${String(tag).split('@')[0]}`,
        contextInfo: {
          ...global.rcanal?.contextInfo,
          mentionedJid: [tag]
        }
      },
      { quoted: m }
    )
  }

  if (isConfigOwnerIds(ids)) {
    return conn.reply(
      m.chat,
      '[❗] Esa persona ya es *owner de config* (vale en todos los bots). No hace falta agregarla al staff.',
      m
    )
  }

  const { numbers, lids } = clasificarIds(ids)
  if (!numbers.length && !lids.length) {
    return conn.reply(m.chat, '[❗] No pude sacar número/LID válidos.', m)
  }

  let name = 'Staff'
  try {
    name = (await nombreDesdeEntrada(m, conn, ids)) || 'Staff'
  } catch {
    name = digitosDe(ids[0]) || 'Staff'
  }

  const entrada = construirEntradaStaff({
    name: String(name).slice(0, 40),
    numbers,
    lids,
    ids,
    addedBy: m.sender,
    addedAt: Date.now(),
    scope: clave === 'main' ? 'main' : 'sub',
    bot: clave
  })

  const { created, entrada: guardado } = addStaff(entrada, conn)
  const tag =
    guardado.ids?.find(j => String(j).endsWith('@s.whatsapp.net')) ||
    guardado.ids?.find(j => String(j).includes('@')) ||
    m.mentionedJid?.[0] ||
    m.sender

  return conn.sendMessage(
    m.chat,
    {
      text:
        `${created ? '✅ *Staff agregado*' : '*Staff actualizado*'} _(ámbito: ${scopeLabel})_\n\n` +
        `› Nombre: *${guardado.name}*\n` +
        (guardado.numbers?.length ? `› Número(s): ${guardado.numbers.join(', ')}\n` : '') +
        (guardado.lids?.length ? `› LID(s): ${guardado.lids.join(', ')}\n` : '') +
        `› IDs guardados: *${guardado.ids.length}*\n` +
        `› Scope: *${clave}*\n` +
        `› Archivo: *storage/staff.json*\n` +
        `› Owner solo de *${scopeLabel}* (no de otros bots).`,
      contextInfo: {
        ...global.rcanal?.contextInfo,
        mentionedJid: [tag]
      }
    },
    { quoted: m }
  )
}

handler.help = [
  '#mod @user / numero / lid → agregar staff',
  '#mod del @user → quitar',
  '#mod lista'
]
handler.tags = ['owner']
handler.command = ['mod', 'addmod', 'staff']
handler.owner = true

export default handler
