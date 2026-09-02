export function isGroupBotDisabled(chatId) {
  return !!(global.db?.data?.botGroups && global.db.data.botGroups[chatId] === false)
}

export function extractCommandFromText(text = '', prefix) {
  const str2Regex = str => str.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&')
  const prefixes = Array.isArray(prefix) ? prefix : [prefix ?? global.prefix]

  for (const p of prefixes) {
    const re = p instanceof RegExp ? p : new RegExp('^' + str2Regex(String(p)))
    const match = re.exec(String(text))
    if (!match) continue
    return String(text).slice(match[0].length).trim().split(/\s+/)[0]?.toLowerCase() || ''
  }

  return ''
}

export function isGrupoToggleMessage(m, conn) {
  return extractCommandFromText(m?.text, conn?.prefix || global.prefix) === 'grupo'
}

/** true = bloquear todo excepto .grupo on/off */
export function shouldBlockByGrupoOff(m, conn) {
  if (!m?.isGroup || m.fromMe) return false
  if (!isGroupBotDisabled(m.chat)) return false
  return !isGrupoToggleMessage(m, conn)
}
