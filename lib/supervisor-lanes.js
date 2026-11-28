/* Utilidades puras para elegir el carril de un subbot.
 *
 * El carril principal también tiene `serverId: null`, igual que los carriles
 * automáticos. Comparar `Number(null) === Number(null)` da `0 === 0` y hacía
 * que una reasignación a "Automático" terminara metiendo subbots en el carril
 * del bot principal. Estas funciones excluyen siempre el principal.
 */

/** ¿Es un carril automático/de desbordamiento (nunca el principal)? */
export function esCarrilAuto(carril) {
  return Boolean(carril) &&
    !carril.primary &&
    (carril.serverId === null || carril.serverId === undefined)
}

/**
 * Busca el carril destino para un servidor concreto o para Automático.
 * @param {Array} carriles
 * @param {number|string|null|undefined} serverId
 * @returns {object|null}
 */
export function buscarCarrilDestino(carriles = [], serverId) {
  const esAuto = serverId === null || serverId === undefined
  return carriles.find((carril) => {
    if (!carril || carril.primary) return false
    if (esAuto) return esCarrilAuto(carril)
    return Number(carril.serverId) === Number(serverId)
  }) || null
}

/** Crea la estructura de un carril automático nuevo. */
export function crearCarrilAuto(id, extra = {}) {
  return {
    id,
    serverId: null,
    serverName: 'free-overflow',
    tier: 'free',
    heapMb: 1024,
    dbMode: 'shared',
    sessions: [],
    primary: false,
    child: null,
    stopping: false,
    stoppingChild: false,
    retirado: false,
    failures: 0,
    fallosRapidos: 0,
    startedAt: 0,
    restartTimer: null,
    forceTimer: null,
    tail: [],
    ...extra,
  }
}
