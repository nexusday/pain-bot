const OFFER_TTL_MS = 2 * 60 * 1000
const ROLL_COOLDOWN_MS = 35 * 1000

function offersStore() {
  if (!global.charOffers) global.charOffers = Object.create(null)
  return global.charOffers
}

function coolStore() {
  if (!global.charRollCooldown) global.charRollCooldown = Object.create(null)
  return global.charRollCooldown
}

export function getOffer(chatId) {
  const store = offersStore()
  const offer = store[chatId]
  if (!offer) return null
  if (Date.now() > offer.expiresAt) {
    delete store[chatId]
    return null
  }
  return offer
}

export function clearOffer(chatId) {
  delete offersStore()[chatId]
}

export function setOffer(chatId, character, rolledBy) {
  const offer = {
    character,
    rolledBy,
    at: Date.now(),
    expiresAt: Date.now() + OFFER_TTL_MS,
  }
  offersStore()[chatId] = offer
  return offer
}

export function checkRollCooldown(userId) {
  const last = coolStore()[userId] || 0
  const left = last + ROLL_COOLDOWN_MS - Date.now()
  if (left > 0) return left
  return 0
}

export function markRollCooldown(userId) {
  coolStore()[userId] = Date.now()
}

/** Reserva el tiro antes de cualquier await (anti carrera principal/subbot). */
export function tryBeginRoll(userId) {
  const left = checkRollCooldown(userId)
  if (left > 0) return { ok: false, reason: 'cooldown', left }
  const locks = coolStore()
  const lockKey = `lock:${userId}`
  if (locks[lockKey]) return { ok: false, reason: 'busy', left: 1500 }
  locks[lockKey] = Date.now()
  markRollCooldown(userId)
  return { ok: true, lockKey }
}

export function endRoll(userId) {
  delete coolStore()[`lock:${userId}`]
}

export function offerSecondsLeft(offer) {
  if (!offer) return 0
  return Math.max(0, Math.ceil((offer.expiresAt - Date.now()) / 1000))
}

export { OFFER_TTL_MS, ROLL_COOLDOWN_MS }
