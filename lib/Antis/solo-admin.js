/**
 * Sistema Solo-Admin
 * Restringe el uso de comandos solo a administradores y owners
 */

export async function handleSoloAdmin(m, conn, isAdmin, isOwner, rcanal) {
  if (!m.isGroup || !global.db.data.soloAdmin || !global.db.data.soloAdmin[m.chat]) return false


  const str2Regex = str => str.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&')
  let _prefix = global.prefix
  let isCommand = (_prefix instanceof RegExp ?
    _prefix.test(m.text) :
    Array.isArray(_prefix) ?
      _prefix.some(p => new RegExp(str2Regex(p)).test(m.text)) :
      typeof _prefix === 'string' ?
        new RegExp(str2Regex(_prefix)).test(m.text) :
        false
  )

  if (isCommand && !isAdmin && !isOwner) {
    
    return true
  }

  return false
}
