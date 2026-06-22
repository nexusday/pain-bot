/**
 * Utilidades compartidas para modos por grupo.
 * Cada grupo tiene su propia entrada: { "120363...@g.us": true }
 * Varios grupos pueden tener el mismo modo activo a la vez.
 */

export function normalizeChatId(chatId) {
  if (!chatId) return ''
  const id = String(chatId).trim()
  if (typeof id.decodeJid === 'function') return id.decodeJid()
  if (/:\d+@/gi.test(id)) {
    const decoded = id.replace(/:\d+@/g, '@')
    const [user, server] = decoded.split('@')
    return `${user.split(':')[0]}@${server}`
  }
  return id
}

/** Asegura que el modo en DB sea un objeto { jid: true/false }, no un boolean suelto. */
export function ensureModeMap(modeKey) {
  const current = global.db.data?.[modeKey]
  const modeMap =
    current && typeof current === 'object' && !Array.isArray(current) ? current : {}
  global.db.data[modeKey] = modeMap
  return modeMap
}

export function isModeActive(modeKey, chatId) {
  const map = global.db.data?.[modeKey]
  if (!map || typeof map !== 'object' || Array.isArray(map)) return false

  const gid = normalizeChatId(chatId)
  if (map[gid] === true) return true
  if (gid !== chatId && map[chatId] === true) return true
  return false
}

export function setModeState(modeKey, chatId, active) {
  const map = ensureModeMap(modeKey)
  const gid = normalizeChatId(chatId)
  map[gid] = active
  if (gid !== chatId && chatId in map) delete map[chatId]
  return map
}
