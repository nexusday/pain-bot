/**
 * Inserta en un Map y descarta las claves más antiguas cuando se supera el
 * tope. Se usa para cachés que guardan binarios (PNG de emoji) o textos
 * medidos: sin tope crecían sin límite en cada worker.
 */
export function guardarEnCacheLimitado(mapa, clave, valor, maximo) {
  if (!mapa || typeof mapa.set !== 'function') return valor
  if (mapa.has(clave)) mapa.delete(clave)
  mapa.set(clave, valor)

  const tope = Number(maximo) || 0
  if (tope > 0) {
    while (mapa.size > tope) {
      const primera = mapa.keys().next().value
      if (primera === undefined) break
      mapa.delete(primera)
    }
  }
  return valor
}
