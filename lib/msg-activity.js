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

function participantPrimaryJid(p, conn) {
  const ids = participantJids(p, conn)
  const pn = ids.find(j => String(j).endsWith('@s.whatsapp.net'))
  return pn || ids[0] || ''
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
 */
export function listInactiveInGroup(conn, chatId, participants = []) {
  const key = chatKey(conn, chatId)
  const bots = listBotNumbers()
  const inactive = []

  for (const p of participants || []) {
    if (isBotParticipant(p, conn, bots)) continue
    const jid = participantPrimaryJid(p, conn)
    if (!jid) continue

    const { user } = resolveDbUser(jid, conn, participants)
    const count = user ? getChatMsgCount(user, key, conn) : 0
    if (count > 0) continue

    inactive.push({
      jid,
      name: p.notify || p.name || user?.name || jid.split('@')[0],
      count: 0,
    })
  }

  inactive.sort((a, b) => String(a.name).localeCompare(String(b.name), 'es'))
  return inactive
}
