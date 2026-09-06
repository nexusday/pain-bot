const RARITIES = [
  { key: 'common', label: 'Común', min: 1200, max: 6500, chance: 42 },
  { key: 'uncommon', label: 'Poco común', min: 6500, max: 16000, chance: 28 },
  { key: 'rare', label: 'Raro', min: 16000, max: 40000, chance: 16 },
  { key: 'epic', label: 'Épico', min: 40000, max: 90000, chance: 9 },
  { key: 'legendary', label: 'Legendario', min: 90000, max: 190000, chance: 4 },
  { key: 'mythic', label: 'Mítico', min: 190000, max: 380000, chance: 1 },
]

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

export function statsForId(id) {
  const key = String(id)
  const rarity = rarityFromSeed(hashSeed(`rarity:${key}`))
  const span = Math.max(0, rarity.max - rarity.min)
  const price = rarity.min + (hashSeed(`price:${key}`) % (span + 1))
  return {
    rarity: rarity.key,
    rarityLabel: rarity.label,
    key: rarity.key,
    label: rarity.label,
    price,
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

export { RARITIES }
