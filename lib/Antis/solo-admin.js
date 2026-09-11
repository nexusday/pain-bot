/**
 * Sistema Solo-Admin
 * Restringe el uso de comandos solo a administradores y owners
 */

export async function manejarSoloAdmin(m, conn, esAdmin, esOwner, rcanal) {
  if (!m.isGroup || !global.db.data.soloAdmin || !global.db.data.soloAdmin[m.chat]) return false

  const escaparRegex = str => str.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&')
  let prefijo = global.prefix
  let esComando = (prefijo instanceof RegExp ?
    prefijo.test(m.text) :
    Array.isArray(prefijo) ?
      prefijo.some(p => new RegExp(escaparRegex(p)).test(m.text)) :
      typeof prefijo === 'string' ?
        new RegExp(escaparRegex(prefijo)).test(m.text) :
        false
  )

  if (esComando && !esAdmin && !esOwner) {
    return true
  }

  return false
}

export {
  manejarSoloAdmin as handleSoloAdmin
}
