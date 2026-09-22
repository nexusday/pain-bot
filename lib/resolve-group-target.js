import {
  findGroupParticipant,
  jidsParticipante,
  jidsSeSolapan,
  candidatosJidRemitente
} from './group-participant.js'
import { resolvePhoneNumber } from './resolve-phone.js'
import { getStaffOwnerIds } from './staff.js'

function esJidLid(jid = '') {
  const j = String(jid || '')
  return j.endsWith('@lid') || j.endsWith('@hosted.lid')
}

function digitosUsuario(jid = '') {
  return String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '')
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


function filtrarRemitenteDeObjetivo(candidatos, m, conn) {
  if (!candidatos?.length || !m) return candidatos || []
  const idsSender = candidatosJidRemitente(m, conn)
  if (!idsSender.length) return candidatos

  const filtrados = candidatos.filter(j => !jidsSeSolapan([j], idsSender))
  
  return filtrados.length ? filtrados : candidatos
}

export async function recolectarCandidatosObjetivoGrupo(m, args, conn, participants, { skipArgsNumber = false } = {}) {
  const crudos = []

  if (m.mentionedJid?.length) crudos.push(...m.mentionedJid)

  const ctx = m.msg?.contextInfo || {}

  const hayCita = Boolean(
    m.quoted ||
    ctx.stanzaId ||
    ctx.quotedMessage ||
    ctx.quotedAd
  )
  if (hayCita) {
    if (ctx.participant) crudos.push(ctx.participant)
    if (typeof m.quoted?.sender === 'string') crudos.push(m.quoted.sender)
  }

  if (!skipArgsNumber && args?.[0]) {
    const id = String(args[0]).replace(/[^0-9]/g, '')
    if (id && id.length >= 8) crudos.push(`${id}@s.whatsapp.net`, `${id}@lid`)
  }

  let candidatos = await expandirCandidatos(conn, m.chat, crudos.filter(Boolean), m, participants)
  candidatos = filtrarRemitenteDeObjetivo(candidatos, m, conn)
  return candidatos
}

export function encontrarParticipantePorCandidatos(participants, candidatos, conn) {
  for (const c of candidatos || []) {
    const p = findGroupParticipant(participants, c, conn)
    if (p) return p
  }
  return null
}


export function idsLimpiosObjetivo(participante, conn, extra = []) {
  const ids = [
    ...jidsParticipante(participante, conn),
    ...(extra || [])
  ]
  return [...new Set(ids.filter(Boolean).map(String))]
}

export async function resolverObjetivoGrupo(m, args, conn, participants, options = {}) {
  const candidatos = await recolectarCandidatosObjetivoGrupo(m, args, conn, participants, options)
  if (!candidatos.length) {
    return { ok: false, reason: 'missing', candidatos: [] }
  }

  const participante = encontrarParticipantePorCandidatos(participants, candidatos, conn)
  if (!participante) {
    return { ok: false, reason: 'not_in_group', candidatos }
  }

  const quien = participante.id || participante.jid || candidatos[0]
  const ids = idsLimpiosObjetivo(participante, conn, [quien])

  return {
    ok: true,
    quien,
    participante,
    candidatos,
    ids
  }
}

export function idsOwnersBot(conn) {
  const lista = []
  for (const v of global.owner || []) {
    const num = (Array.isArray(v) ? v[0] : v)?.toString?.().replace(/[^0-9]/g, '') || ''
    if (num) {
      lista.push(`${num}@s.whatsapp.net`, `${num}@lid`, `${num}@hosted.lid`)
    }
  }
  for (const v of global.ownerLid || []) {
    const num = (Array.isArray(v) ? v[0] : v)?.toString?.().replace(/[^0-9]/g, '') || ''
    if (num) {
  
      lista.push(`${num}@lid`, `${num}@hosted.lid`)
      if (num.length <= 13) lista.push(`${num}@s.whatsapp.net`)
    }
  }
  try {
    if (conn?.user?.id) {
      const jid = conn.decodeJid?.(conn.user.id) || conn.user.id
      if (jid) {
        lista.push(jid)
        const d = digitosUsuario(jid)
        if (d) lista.push(`${d}@s.whatsapp.net`, `${d}@lid`, `${d}@hosted.lid`)
      }
    }
    if (global.conn?.user?.id) {
      const jidMain = (conn || global.conn).decodeJid?.(global.conn.user.id) || global.conn.user.id
      if (jidMain) {
        lista.push(jidMain)
        const d = digitosUsuario(jidMain)
        if (d) lista.push(`${d}@s.whatsapp.net`, `${d}@lid`, `${d}@hosted.lid`)
      }
    }
  } catch {}
  try {
    lista.push(...getStaffOwnerIds(conn))
  } catch {}
  return [...new Set(lista.filter(Boolean))]
}

export function esOwnerJid(ids, conn) {
  return jidsSeSolapan(ids || [], idsOwnersBot(conn))
}


export function esRemitenteOwnerBot(m, conn) {
  if (!m || !conn) return false
  if (m.fromMe) return true
  return esOwnerJid(candidatosJidRemitente(m, conn), conn)
}

export function motivoDesdeArgsSinMencion(args = [], m) {
  let partes = [...(args || [])]
  if (m.mentionedJid?.length) {
    partes = partes.slice(1)
  } else if (!m.quoted && !m.msg?.contextInfo?.quotedMessage && partes[0]) {
    const crudo = String(partes[0])
    const digitos = crudo.replace(/\D/g, '')
    if (digitos.length >= 8 && !/[a-záéíóúñ]/i.test(crudo)) {
      partes = partes.slice(1)
    }
  }
  return partes.join(' ').trim() || 'Sin motivo especificado'
}

export function buscarClaveAdvertencias(chatId, idsObjetivo) {
  const mapa = global.db?.data?.warnings?.[chatId]
  if (!mapa) return null
  for (const clave of Object.keys(mapa)) {
    if (jidsSeSolapan([clave], idsObjetivo)) return clave
  }
  return null
}

export {
  recolectarCandidatosObjetivoGrupo as collectGroupTargetCandidates,
  encontrarParticipantePorCandidatos as findParticipantByCandidates,
  resolverObjetivoGrupo as resolveGroupTarget,
  idsOwnersBot as getBotOwnerJids,
  esOwnerJid as isOwnerJid,
  esRemitenteOwnerBot as isSenderBotOwner,
  motivoDesdeArgsSinMencion as warnReasonFromArgs,
  buscarClaveAdvertencias as findWarningKey,
  idsLimpiosObjetivo as cleanTargetIds
}
