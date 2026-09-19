import {
  findGroupParticipant,
  jidsParticipante,
  jidsSeSolapan
} from './group-participant.js'
import { resolvePhoneNumber } from './resolve-phone.js'

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

export async function recolectarCandidatosObjetivoGrupo(m, args, conn, participants, { skipArgsNumber = false } = {}) {
  const crudos = []

  if (m.mentionedJid?.length) crudos.push(...m.mentionedJid)

  const ctx = m.msg?.contextInfo || {}
  if (ctx.participant) crudos.push(ctx.participant)
  if (typeof m.quoted?.sender === 'string') crudos.push(m.quoted.sender)

  if (!skipArgsNumber && args?.[0]) {
    const id = String(args[0]).replace(/[^0-9]/g, '')
    if (id && id.length >= 8) crudos.push(`${id}@s.whatsapp.net`)
  }

  return expandirCandidatos(conn, m.chat, crudos.filter(Boolean), m, participants)
}

export function encontrarParticipantePorCandidatos(participants, candidatos, conn) {
  for (const c of candidatos || []) {
    const p = findGroupParticipant(participants, c, conn)
    if (p) return p
  }
  return null
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

  const ids = [
    ...jidsParticipante(participante, conn),
    ...candidatos
  ]

  return {
    ok: true,
    quien: participante.id,
    participante,
    candidatos,
    ids: [...new Set(ids.filter(Boolean))]
  }
}

export function idsOwnersBot() {
  const lista = []
  for (const v of global.owner || []) {
    const num = (Array.isArray(v) ? v[0] : v)?.toString?.().replace(/[^0-9]/g, '') || ''
    if (num) lista.push(`${num}@s.whatsapp.net`)
  }
  for (const v of global.ownerLid || []) {
    const num = (Array.isArray(v) ? v[0] : v)?.toString?.().replace(/[^0-9]/g, '') || ''
    if (num) lista.push(`${num}@lid`)
  }
  return lista
}

export function esOwnerJid(ids) {
  return jidsSeSolapan(ids || [], idsOwnersBot())
}

export function motivoDesdeArgsSinMencion(args = [], m) {
  let partes = [...(args || [])]
  if (m.mentionedJid?.length) {
    partes = partes.slice(1)
  } else if (!m.quoted && !m.msg?.contextInfo?.participant && partes[0]) {
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
  motivoDesdeArgsSinMencion as warnReasonFromArgs,
  buscarClaveAdvertencias as findWarningKey
}
