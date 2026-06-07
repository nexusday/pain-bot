import { extractMessageContent } from '@whiskeysockets/baileys'

const VIEW_ONCE_TYPES = new Set([
  'viewOnceMessage',
  'viewOnceMessageV2',
  'viewOnceMessageV2Extension',
  'ephemeralMessage'
])

const SKIP_KEYS = new Set(['messageContextInfo', 'senderKeyDistributionMessage'])
const MAX_VIEW_ONCE_IDS = 500
const MAX_VIEW_ONCE_RAW = 200

const listeners = new WeakSet()

function ensureCaches() {
  if (!global.viewOnceIds) global.viewOnceIds = new Set()
  if (!global.viewOnceRawCache) global.viewOnceRawCache = new Map()
}

export function findViewOnceWrapper(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 5) return false

  for (const key of Object.keys(obj)) {
    if (SKIP_KEYS.has(key)) continue
    if (VIEW_ONCE_TYPES.has(key) || /viewonce/i.test(key)) return true
    const nested = obj[key]?.message
    if (nested && findViewOnceWrapper(nested, depth + 1)) return true
  }
  return false
}

export function isViewOnceMedia(mediaMsg) {
  return mediaMsg?.viewOnce === true
}

function getMessageBody(entry) {
  return entry?.message || entry?.msg || null
}

function getMessageId(entry) {
  return entry?.id || entry?.key?.id || null
}

export function isViewOnceRaw(raw, key) {
  if (!raw) return false
  const content = extractMessageContent(raw)
  return findViewOnceWrapper(raw)
    || isViewOnceMedia(content?.imageMessage)
    || isViewOnceMedia(content?.videoMessage)
    || key?.isViewOnce === true
}

export function isViewOnceCandidate(m) {
  if (!m) return false
  return isViewOnceRaw(getMessageBody(m), m.key)
}

export function isKnownViewOnce(id) {
  ensureCaches()
  return !!(id && global.viewOnceIds.has(id))
}

export function markViewOnceMessage(entry) {
  ensureCaches()
  const id = getMessageId(entry)
  const raw = getMessageBody(entry)
  if (!id || !raw) return
  if (!isViewOnceRaw(raw, entry?.key)) return

  global.viewOnceIds.add(id)
  if (global.viewOnceIds.size > MAX_VIEW_ONCE_IDS) {
    global.viewOnceIds.delete(global.viewOnceIds.values().next().value)
  }
}

export function cacheViewOnceRaw(entry) {
  ensureCaches()
  const id = entry?.key?.id
  const raw = entry?.message
  if (!id || !raw) return
  if (!isViewOnceRaw(raw, entry.key)) return

  global.viewOnceRawCache.set(id, JSON.parse(JSON.stringify(entry)))
  if (global.viewOnceRawCache.size > MAX_VIEW_ONCE_RAW) {
    const first = global.viewOnceRawCache.keys().next().value
    global.viewOnceRawCache.delete(first)
  }
}

export function getCachedViewOnceRaw(id) {
  ensureCaches()
  return id ? global.viewOnceRawCache.get(id) || null : null
}

export function getMessageKeys(msg) {
  if (!msg || typeof msg !== 'object') return []
  return Object.keys(msg).filter((k) => !SKIP_KEYS.has(k))
}

export function extractMediaContent(raw) {
  if (!raw) return null
  const content = extractMessageContent(raw)
  if (content?.imageMessage) return { type: 'image', mediaMsg: content.imageMessage }
  if (content?.videoMessage) return { type: 'video', mediaMsg: content.videoMessage }
  return null
}

export function scoreStoredMessage(entry) {
  if (!entry?.message) return -1
  if (findViewOnceWrapper(entry.message)) return 3
  const media = extractMediaContent(entry.message)
  if (media && isViewOnceMedia(media.mediaMsg)) return 2
  if (entry.key?.isViewOnce === true) return 2
  return media ? 0 : -1
}

export function detectViewOnce(raw, mediaMsg, stored, quotedId) {
  return findViewOnceWrapper(raw)
    || isViewOnceMedia(mediaMsg)
    || stored?.key?.isViewOnce === true
    || isKnownViewOnce(quotedId)
}

export function initViewOnceAntiListener(conn) {
  ensureCaches()
  if (!conn || listeners.has(conn)) return
  listeners.add(conn)
}

export async function runAntiViewOnce(conn, m) {
  if (!m?.isGroup || m.fromMe || !isViewOnceCandidate(m)) return false

  markViewOnceMessage(m)
  cacheViewOnceRaw({ key: m.key, message: m.message })

  if (!global.db?.data?.antiViewOnce?.[m.chat]) return false

  try {
    const metadata = conn.chats?.[m.chat]?.metadata || await conn.groupMetadata(m.chat).catch(() => null)
    const participants = metadata?.participants || []
    const user = participants.find((u) => conn.decodeJid(u.id) === m.sender) || {}
    const isAdmin = user?.admin === 'admin' || user?.admin === 'superadmin'

    if (isAdmin) return false

    await conn.sendMessage(m.chat, { delete: m.key })
    return true
  } catch (e) {
    console.error('[viewOnce] anti delete error:', e.message)
    return false
  }
}
