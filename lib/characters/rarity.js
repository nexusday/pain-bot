const RARITIES = [
  { key: 'common', label: 'Común', min: 1200, max: 6500, chance: 42 },
  { key: 'uncommon', label: 'Poco común', min: 6500, max: 16000, chance: 28 },
  { key: 'rare', label: 'Raro', min: 16000, max: 40000, chance: 16 },
  { key: 'epic', label: 'Épico', min: 40000, max: 90000, chance: 9 },
  { key: 'legendary', label: 'Legendario', min: 90000, max: 190000, chance: 4 },
  { key: 'mythic', label: 'Mítico', min: 190000, max: 380000, chance: 1 },
]

/** Rango de precio del gacha (mín / máx teórico). */
export const PRICE_MIN = 1200
export const PRICE_MAX = 380000

/** HP: baratos bajos, top míticos cerca de 10k. */
export const HP_MIN = 150
export const HP_MAX = 10000

/** Poder de combate escalado al costo. */
export const POWER_MIN = 25
export const POWER_MAX = 2500

export function hashSeed(value) {
  let h = 2166136261
  const s = String(value)
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function rarityFromSeed(seed) {
  const roll = seed % 100
  let acc = 0
  for (const row of RARITIES) {
    acc += row.chance
    if (roll < acc) return row
  }
  return RARITIES[0]
}

/**
 * HP y poder según precio.
 * Curva suave: los baratos quedan débiles; los más caros llegan a HP 10k.
 */
export function combatStatsForPrice(price, id = '') {
  const p = Math.max(PRICE_MIN, Number(price) || PRICE_MIN)
  const ratio = Math.min(1, Math.max(0, (p - PRICE_MIN) / (PRICE_MAX - PRICE_MIN)))
  const curve = Math.pow(ratio, 0.82)
  const wobble = ((hashSeed(`combat:${id || p}`) % 9) - 4) / 120
  const t = Math.min(1, Math.max(0, curve + wobble))

  const maxHp = Math.round(HP_MIN + t * (HP_MAX - HP_MIN))
  const power = Math.round(POWER_MIN + t * (POWER_MAX - POWER_MIN))

  return {
    maxHp,
    hp: maxHp,
    power,
  }
}

export function statsForId(id) {
  const key = String(id)
  const rarity = rarityFromSeed(hashSeed(`rarity:${key}`))
  const span = Math.max(0, rarity.max - rarity.min)
  const price = rarity.min + (hashSeed(`price:${key}`) % (span + 1))
  const combat = combatStatsForPrice(price, key)
  return {
    rarity: rarity.key,
    rarityLabel: rarity.label,
    key: rarity.key,
    label: rarity.label,
    price,
    ...combat,
  }
}

export function priceForId(id) {
  return statsForId(id)
}

export function sellValue(price) {
  return Math.floor(Math.max(0, Number(price) || 0) * 0.45)
}

export function formatMoney(amount) {
  const n = Number(amount) || 0
  return `${n.toLocaleString('es-ES')} ${global.moneda || 'USD'}`
}

export function formatCombatBar(current, max, size = 10) {
  const mx = Math.max(1, Number(max) || 1)
  const cur = Math.max(0, Math.min(mx, Number(current) || 0))
  const filled = Math.round((cur / mx) * size)
  return `${'█'.repeat(filled)}${'░'.repeat(Math.max(0, size - filled))}`
}

export { RARITIES }
