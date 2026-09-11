export function estaGrupoBotDesactivado(chatId) {
  return !!(global.db?.data?.botGroups && global.db.data.botGroups[chatId] === false)
}

export function extraerComandoDelTexto(texto = '', prefijo) {
  const escaparRegex = str => str.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&')
  const prefijos = Array.isArray(prefijo) ? prefijo : [prefijo ?? global.prefix]

  for (const p of prefijos) {
    const re = p instanceof RegExp ? p : new RegExp('^' + escaparRegex(String(p)))
    const coincidencia = re.exec(String(texto))
    if (!coincidencia) continue
    return String(texto).slice(coincidencia[0].length).trim().split(/\s+/)[0]?.toLowerCase() || ''
  }

  return ''
}

export function esMensajeToggleGrupo(m, conn) {
  return extraerComandoDelTexto(m?.text, conn?.prefix || global.prefix) === 'grupo'
}

/** true = bloquear todo excepto .grupo on/off */
export function debeBloquearPorGrupoOff(m, conn) {
  if (!m?.isGroup || m.fromMe) return false
  if (!estaGrupoBotDesactivado(m.chat)) return false
  return !esMensajeToggleGrupo(m, conn)
}

export {
  estaGrupoBotDesactivado as isGroupBotDisabled,
  extraerComandoDelTexto as extractCommandFromText,
  esMensajeToggleGrupo as isGrupoToggleMessage,
  debeBloquearPorGrupoOff as shouldBlockByGrupoOff
}
