/** Solo prefijos al principio del texto; un punto o '/' de una URL no es un comando. */
export function esComandoAnti(m) {
  const texto = String(m?.text || m?.msg?.caption || '').trim()
  if (!texto) return false
  const prefijos = Array.isArray(global.prefix) ? global.prefix : [global.prefix]
  return prefijos.some(p => {
    if (p instanceof RegExp) {
      const copia = new RegExp(p.source, p.flags.replace(/[gy]/g, ''))
      return copia.exec(texto)?.index === 0
    }
    return typeof p === 'string' && p.length > 0 && texto.startsWith(p)
  })
}
