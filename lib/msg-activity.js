import { resolveDbUser } from './michi-users.js'
import { cleanBotNum, getActiveBotForGroup } from '../plugins/modo-sub.js'
import { participantJids } from './group-participant.js'

const recentMsgIds = new Map()
const DEDUPE_TTL_MS = 90_000

function pruneDedupe(now = Date.now()) {
  if (recentMsgIds.size < 400) return
  for (const [id, ts] of recentMsgIds) {
    if (now - ts > DEDUPE_TTL_MS) recentMsgIds.delete(id)
  }
}

function chatKey(conn, chatId) {
  try {
    return conn?.decodeJid?.(chatId) || String(chatId || '')
  } catch {
    return String(chatId || '')
  }
}

export function ensureMsgStats(user) {
  if (!user || typeof user !== 'object') return user
  if (!Number.isFinite(user.msgCount) || user.msgCount < 0) user.msgCount = 0
  if (!user.msgByChat || typeof user.msgByChat !== 'object' || Array.isArray(user.msgByChat)) {
    user.msgByChat = {}
  }
  return user
}

/** Con modosub activo solo cuenta el bot elegido; si no, dedupe por msg id. */
export function shouldTrackMessages(conn, chatId) {
  if (!conn?.user) return false
  if (!String(chatId || '').endsWith('@g.us')) return true

  const active = getActiveBotForGroup(chatId)
  if (!active) return true

  const myNum = cleanBotNum(conn.user?.jid || conn.user?.id)
  return Boolean(myNum && myNum === active)
}

export function isCountableUserMessage(m) {
  if (!m || m.fromMe || m.isBaileys) return false
  if (m.messageStubType) return false
  const msg = m.message
  if (!msg || typeof msg !== 'object') return false
  if (msg.protocolMessage || msg.reactionMessage || msg.pollUpdateMessage) return false
  return true
}

export function getChatMsgCount(user, chatId, conn = null) {
  ensureMsgStats(user)
  const key = chatKey(conn, chatId)
  return Math.max(0, Number(user.msgByChat?.[key]) || 0)
}

export function getTotalMsgCount(user) {
  ensureMsgStats(user)
  return Math.max(0, Number(user.msgCount) || 0)
}

export function trackUserMessage(m, conn) {
  if (!isCountableUserMessage(m)) return false
  if (!global.db?.data?.users) return false

  const chatId = chatKey(conn, m.chat)
  if (!shouldTrackMessages(conn, chatId)) return false

  const mid = String(m.key?.id || m.id || '')
  if (mid) {
    const now = Date.now()
    if (recentMsgIds.has(mid)) return false
    recentMsgIds.set(mid, now)
    pruneDedupe(now)
  }

  const resolved = resolveDbUser(m.sender, conn)
  const jid = resolved.jid || m.sender
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
  ensureMsgStats(user)
  if (m.pushName || m.name) user.name = m.pushName || m.name || user.name

  user.msgCount = (Number(user.msgCount) || 0) + 1
  user.msgByChat[chatId] = (Number(user.msgByChat[chatId]) || 0) + 1
  user.lastMsgAt = Date.now()
  user.lastMsgChat = chatId
  return true
}

function isBotParticipant(p, conn, botNumbers) {
  const ids = participantJids(p, conn)
  for (const id of ids) {
    const n = cleanBotNum(id)
    if (n && botNumbers.has(n)) return true
  }
  return false
}

function listBotNumbers() {
  const nums = new Set()
  const push = (jid) => {
    const n = cleanBotNum(jid)
    if (n && n.length >= 6) nums.add(n)
  }
  push(global.conn?.user?.jid || global.conn?.user?.id)
  for (const c of global.conns || []) push(c?.user?.jid || c?.user?.id)
  return nums
}

/**
 * Miembros del grupo con 0 mensajes registrados en este chat.
 * Índice rápido: 1 pasada a users, luego O(participantes).
 */
export function listInactiveInGroup(conn, chatId, participants = []) {
  const key = chatKey(conn, chatId)
  const bots = listBotNumbers()
  const users = global.db?.data?.users || {}

  // dígitos con actividad en ESTE grupo
  const activeDigits = new Set()
  for (const [jid, user] of Object.entries(users)) {
    if (!user || typeof user !== 'object') continue
    const byChat = user.msgByChat
    if (!byChat || typeof byChat !== 'object') continue
    const count = Number(byChat[key]) || 0
    if (count <= 0) continue
    const d = cleanBotNum(jid)
    if (d.length >= 6) activeDigits.add(d)
  }

  const inactive = []
  for (const p of participants || []) {
    if (isBotParticipant(p, conn, bots)) continue
    const ids = participantJids(p, conn)
    if (!ids.length) continue

    const digits = ids.map(cleanBotNum).filter(d => d.length >= 6)
    if (digits.some(d => activeDigits.has(d))) continue

    const jid = ids.find(j => String(j).endsWith('@s.whatsapp.net')) || ids[0]
    inactive.push({
      jid,
      name: p.notify || p.name || String(jid).split('@')[0],
      count: 0,
    })
  }

  return inactive
}
