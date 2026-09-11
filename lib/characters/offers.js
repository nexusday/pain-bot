const OFERTA_TTL_MS = 2 * 60 * 1000
const TIRO_COOLDOWN_MS = 35 * 1000

function almacenOfertas() {
  if (!global.charOffers) global.charOffers = Object.create(null)
  return global.charOffers
}

function almacenEnfriamiento() {
  if (!global.charRollCooldown) global.charRollCooldown = Object.create(null)
  return global.charRollCooldown
}

export function obtenerOferta(chatId) {
  const almacen = almacenOfertas()
  const oferta = almacen[chatId]
  if (!oferta) return null
  if (Date.now() > oferta.expiresAt) {
    delete almacen[chatId]
    return null
  }
  return oferta
}

export function limpiarOferta(chatId) {
  delete almacenOfertas()[chatId]
}

export function establecerOferta(chatId, personaje, tiradoPor) {
  const oferta = {
    character: personaje,
    rolledBy: tiradoPor,
    at: Date.now(),
    expiresAt: Date.now() + OFERTA_TTL_MS,
  }
  almacenOfertas()[chatId] = oferta
  return oferta
}

export function verificarEnfriamientoTiro(userId) {
  const ultimo = almacenEnfriamiento()[userId] || 0
  const restante = ultimo + TIRO_COOLDOWN_MS - Date.now()
  if (restante > 0) return restante
  return 0
}

export function marcarEnfriamientoTiro(userId) {
  almacenEnfriamiento()[userId] = Date.now()
}

/** Reserva el tiro antes de cualquier await (anti carrera principal/subbot). */
export function intentarIniciarTiro(userId) {
  const restante = verificarEnfriamientoTiro(userId)
  if (restante > 0) return { ok: false, reason: 'cooldown', left: restante }
  const bloqueos = almacenEnfriamiento()
  const claveBloqueo = `lock:${userId}`
  if (bloqueos[claveBloqueo]) return { ok: false, reason: 'busy', left: 1500 }
  bloqueos[claveBloqueo] = Date.now()
  marcarEnfriamientoTiro(userId)
  return { ok: true, lockKey: claveBloqueo }
}

export function finalizarTiro(userId) {
  delete almacenEnfriamiento()[`lock:${userId}`]
}

export function segundosRestantesOferta(oferta) {
  if (!oferta) return 0
  return Math.max(0, Math.ceil((oferta.expiresAt - Date.now()) / 1000))
}

export {
  OFERTA_TTL_MS,
  TIRO_COOLDOWN_MS,
  OFERTA_TTL_MS as OFFER_TTL_MS,
  TIRO_COOLDOWN_MS as ROLL_COOLDOWN_MS,
  obtenerOferta as getOffer,
  limpiarOferta as clearOffer,
  establecerOferta as setOffer,
  verificarEnfriamientoTiro as checkRollCooldown,
  marcarEnfriamientoTiro as markRollCooldown,
  intentarIniciarTiro as tryBeginRoll,
  finalizarTiro as endRoll,
  segundosRestantesOferta as offerSecondsLeft,
}
