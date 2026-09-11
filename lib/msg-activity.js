import { resolveDbUser } from './michi-users.js'
import { cleanBotNum, getActiveBotForGroup } from '../plugins/modo-sub.js'
import { participantJids } from './group-participant.js'

const idsMsgRecientes = new Map()
const TTL_DEDUPE_MS = 90_000

function podarDedupe(ahora = Date.now()) {
  if (idsMsgRecientes.size < 400) return
  for (const [id, ts] of idsMsgRecientes) {
    if (ahora - ts > TTL_DEDUPE_MS) idsMsgRecientes.delete(id)
  }
}

function claveChat(conn, chatId) {
  try {
    return conn?.decodeJid?.(chatId) || String(chatId || '')
  } catch {
    return String(chatId || '')
  }
}

export function asegurarStatsMsg(user) {
  if (!user || typeof user !== 'object') return user
  if (!Number.isFinite(user.msgCount) || user.msgCount < 0) user.msgCount = 0
  if (!user.msgByChat || typeof user.msgByChat !== 'object' || Array.isArray(user.msgByChat)) {
    user.msgByChat = {}
  }
  return user
}

/** Con modosub activo solo cuenta el bot elegido; si no, dedupe por msg id. */
export function debeRastrearMensajes(conn, chatId) {
  if (!conn?.user) return false
  if (!String(chatId || '').endsWith('@g.us')) return true

  const activo = getActiveBotForGroup(chatId)
  if (!activo) return true

  const miNum = cleanBotNum(conn.user?.jid || conn.user?.id)
  return Boolean(miNum && miNum === activo)
}

export function esMensajeUsuarioContable(m) {
  if (!m || m.fromMe || m.isBaileys) return false
  if (m.messageStubType) return false
  const msg = m.message
  if (!msg || typeof msg !== 'object') return false
  if (msg.protocolMessage || msg.reactionMessage || msg.pollUpdateMessage) return false
  return true
}

export function obtenerConteoMsgChat(user, chatId, conn = null) {
  asegurarStatsMsg(user)
  const clave = claveChat(conn, chatId)
  return Math.max(0, Number(user.msgByChat?.[clave]) || 0)
}

export function obtenerConteoMsgTotal(user) {
  asegurarStatsMsg(user)
  return Math.max(0, Number(user.msgCount) || 0)
}

export function rastrearMensajeUsuario(m, conn) {
  if (!esMensajeUsuarioContable(m)) return false
  if (!global.db?.data?.users) return false

  const chatId = claveChat(conn, m.chat)
  if (!debeRastrearMensajes(conn, chatId)) return false

  const mid = String(m.key?.id || m.id || '')
  if (mid) {
    const ahora = Date.now()
    if (idsMsgRecientes.has(mid)) return false
    idsMsgRecientes.set(mid, ahora)
    podarDedupe(ahora)
  }

  const resuelto = resolveDbUser(m.sender, conn)
  const jid = resuelto.jid || m.sender
  const users = global.db.data.users
  if (!users[jid]) {
    users[jid] = {
      registered: true,
      name: m.name || m.pushName || 'Usuario',
      regTime: Date.now(),
      coins: 100,
      msgCount: 0,
      msgByChat: {},
    }
  }

  const user = users[jid]
  asegurarStatsMsg(user)
  if (m.pushName || m.name) user.name = m.pushName || m.name || user.name

  user.msgCount = (Number(user.msgCount) || 0) + 1
  user.msgByChat[chatId] = (Number(user.msgByChat[chatId]) || 0) + 1
  user.lastMsgAt = Date.now()
  user.lastMsgChat = chatId
  return true
}

function esParticipanteBot(p, conn, numerosBot) {
  const ids = participantJids(p, conn)
  for (const id of ids) {
    const n = cleanBotNum(id)
    if (n && numerosBot.has(n)) return true
  }
  return false
}

function listarNumerosBot() {
  const nums = new Set()
  const agregar = (jid) => {
    const n = cleanBotNum(jid)
    if (n && n.length >= 6) nums.add(n)
  }
  agregar(global.conn?.user?.jid || global.conn?.user?.id)
  for (const c of global.conns || []) agregar(c?.user?.jid || c?.user?.id)
  return nums
}

/**
 * Índice digitos → mensajes en este grupo (máximo si hay varias keys de user).
 */
function construirIndiceActividadChat(chatId, conn) {
  const clave = claveChat(conn, chatId)
  const users = global.db?.data?.users || {}
  const porDigito = new Map()

  for (const [jid, user] of Object.entries(users)) {
    if (!user || typeof user !== 'object') continue
    const porChat = user.msgByChat
    if (!porChat || typeof porChat !== 'object') continue
    const conteo = Number(porChat[clave]) || 0
    if (conteo <= 0) continue
    const d = cleanBotNum(jid)
    if (d.length < 6) continue
    const prev = porDigito.get(d) || 0
    if (conteo > prev) porDigito.set(d, conteo)
  }

  return { key: clave, byDigit: porDigito }
}

/**
 * Miembros del grupo con 0 mensajes registrados en este chat.
 */
export function listarInactivosEnGrupo(conn, chatId, participants = []) {
  const { byDigit } = construirIndiceActividadChat(chatId, conn)
  const bots = listarNumerosBot()
  const inactivos = []

  for (const p of participants || []) {
    if (esParticipanteBot(p, conn, bots)) continue
    const ids = participantJids(p, conn)
    if (!ids.length) continue

    const digitos = ids.map(cleanBotNum).filter(d => d.length >= 6)
    if (digitos.some(d => byDigit.has(d))) continue

    const jid = ids.find(j => String(j).endsWith('@s.whatsapp.net')) || ids[0]
    inactivos.push({
      jid,
      name: p.notify || p.name || String(jid).split('@')[0],
      count: 0,
    })
  }

  return inactivos
}

/**
 * Miembros activos del grupo ordenados por mensajes (mayor → menor).
 */
export function listarActivosEnGrupo(conn, chatId, participants = [], { limit = 0 } = {}) {
  const { byDigit } = construirIndiceActividadChat(chatId, conn)
  const bots = listarNumerosBot()
  const activos = []

  for (const p of participants || []) {
    if (esParticipanteBot(p, conn, bots)) continue
    const ids = participantJids(p, conn)
    if (!ids.length) continue

    const digitos = ids.map(cleanBotNum).filter(d => d.length >= 6)
    let conteo = 0
    for (const d of digitos) {
      const n = byDigit.get(d) || 0
      if (n > conteo) conteo = n
    }
    if (conteo <= 0) continue

    const jid = ids.find(j => String(j).endsWith('@s.whatsapp.net')) || ids[0]
    activos.push({
      jid,
      name: p.notify || p.name || String(jid).split('@')[0],
      count: conteo,
    })
  }

  activos.sort((a, b) => b.count - a.count || String(a.name).localeCompare(String(b.name), 'es'))

  const max = Math.floor(Number(limit) || 0)
  if (max > 0) return activos.slice(0, max)
  return activos
}

export {
  asegurarStatsMsg as ensureMsgStats,
  debeRastrearMensajes as shouldTrackMessages,
  esMensajeUsuarioContable as isCountableUserMessage,
  obtenerConteoMsgChat as getChatMsgCount,
  obtenerConteoMsgTotal as getTotalMsgCount,
  rastrearMensajeUsuario as trackUserMessage,
  listarInactivosEnGrupo as listInactiveInGroup,
  listarActivosEnGrupo as listActiveInGroup
}
