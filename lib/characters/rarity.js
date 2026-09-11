const RAREZAS = [
  { key: 'common', label: 'Común', min: 1200, max: 6500, chance: 42 },
  { key: 'uncommon', label: 'Poco común', min: 6500, max: 16000, chance: 28 },
  { key: 'rare', label: 'Raro', min: 16000, max: 40000, chance: 16 },
  { key: 'epic', label: 'Épico', min: 40000, max: 90000, chance: 9 },
  { key: 'legendary', label: 'Legendario', min: 90000, max: 190000, chance: 4 },
  { key: 'mythic', label: 'Mítico', min: 190000, max: 380000, chance: 1 },
]

/** Rango de precio del gacha (mín / máx teórico). */
export const PRECIO_MIN = 1200
export const PRECIO_MAX = 380000

/** HP: baratos bajos, top míticos cerca de 10k. */
export const SALUD_MIN = 150
export const SALUD_MAX = 10000

/** Poder de combate escalado al costo. */
export const PODER_MIN = 25
export const PODER_MAX = 2500

export function semillaHash(valor) {
  let h = 2166136261
  const s = String(valor)
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function rarezaDesdeSemilla(semilla) {
  const tiro = semilla % 100
  let acum = 0
  for (const fila of RAREZAS) {
    acum += fila.chance
    if (tiro < acum) return fila
  }
  return RAREZAS[0]
}

/**
 * HP y poder según precio.
 * Curva suave: los baratos quedan débiles; los más caros llegan a HP 10k.
 */
export function estadisticasCombatePorPrecio(precio, id = '') {
  const p = Math.max(PRECIO_MIN, Number(precio) || PRECIO_MIN)
  const ratio = Math.min(1, Math.max(0, (p - PRECIO_MIN) / (PRECIO_MAX - PRECIO_MIN)))
  const curva = Math.pow(ratio, 0.82)
  const oscilacion = ((semillaHash(`combat:${id || p}`) % 9) - 4) / 120
  const t = Math.min(1, Math.max(0, curva + oscilacion))

  const maxHp = Math.round(SALUD_MIN + t * (SALUD_MAX - SALUD_MIN))
  const power = Math.round(PODER_MIN + t * (PODER_MAX - PODER_MIN))

  return {
    maxHp,
    hp: maxHp,
    power,
  }
}

export function estadisticasPorId(id) {
  const clave = String(id)
  const rareza = rarezaDesdeSemilla(semillaHash(`rarity:${clave}`))
  const rango = Math.max(0, rareza.max - rareza.min)
  const price = rareza.min + (semillaHash(`price:${clave}`) % (rango + 1))
  const combate = estadisticasCombatePorPrecio(price, clave)
  return {
    rarity: rareza.key,
    rarityLabel: rareza.label,
    key: rareza.key,
    label: rareza.label,
    price,
    ...combate,
  }
}

export function precioPorId(id) {
  return estadisticasPorId(id)
}

export function valorVenta(precio) {
  return Math.floor(Math.max(0, Number(precio) || 0) * 0.45)
}

export function formatearDinero(cantidad) {
  const n = Number(cantidad) || 0
  return `${n.toLocaleString('es-ES')} ${global.moneda || 'USD'}`
}

export function formatearBarraCombate(actual, maximo, tamano = 10) {
  const mx = Math.max(1, Number(maximo) || 1)
  const cur = Math.max(0, Math.min(mx, Number(actual) || 0))
  const llenos = Math.round((cur / mx) * tamano)
  return `${'█'.repeat(llenos)}${'░'.repeat(Math.max(0, tamano - llenos))}`
}

export {
  RAREZAS,
  RAREZAS as RARITIES,
  PRECIO_MIN as PRICE_MIN,
  PRECIO_MAX as PRICE_MAX,
  SALUD_MIN as HP_MIN,
  SALUD_MAX as HP_MAX,
  PODER_MIN as POWER_MIN,
  PODER_MAX as POWER_MAX,
  semillaHash as hashSeed,
  rarezaDesdeSemilla as rarityFromSeed,
  estadisticasCombatePorPrecio as combatStatsForPrice,
  estadisticasPorId as statsForId,
  precioPorId as priceForId,
  valorVenta as sellValue,
  formatearDinero as formatMoney,
  formatearBarraCombate as formatCombatBar,
}
