import { resolveDbUser } from '../michi-users.js'
import { statsForId } from './rarity.js'
import { normalizeCharId, getCatalogEntry, upsertCatalogEntry } from './store.js'

export function ensureCharUser(user) {
  if (!user || typeof user !== 'object') return user
  if (!Number.isFinite(user.coins) || user.coins < 0) user.coins = 0
  if (!Number.isFinite(user.bancoDinero) || user.bancoDinero < 0) user.bancoDinero = 0
  if (!Array.isArray(user.characters)) user.characters = []

  const map = new Map()
  for (const raw of user.characters) {
    const c = normalizeOwnedCharacter(raw)
    if (!c?.id) continue
    const prev = map.get(c.id)
    if (prev) {
      prev.qty += c.qty
      prev.listed += c.listed
      if ((raw.obtainedAt || 0) < (prev.obtainedAt || Infinity)) prev.obtainedAt = raw.obtainedAt
    } else {
      map.set(c.id, c)
    }
  }

  user.characters = [...map.values()]
    .map(c => {
      c.listed = Math.min(Math.max(0, c.listed), c.qty)
      return c
    })
    .sort((a, b) => (a.obtainedAt || 0) - (b.obtainedAt || 0))
  return user
}

function normalizeOwnedCharacter(c = {}) {
  const id = normalizeCharId(c.id || c.sourceId)
  if (!id) return null
  const catalog = getCatalogEntry(id)
  const locked = catalog || statsForId(id)
  const qty = Math.max(1, Math.floor(Number(c.qty) || 1))
  const listed = Math.max(0, Math.floor(Number(c.listed) || 0))
  return {
    id,
    name: c.name || catalog?.name || `Character ${id}`,
    anime: c.anime || catalog?.anime || 'Sin serie',
    image: c.image || catalog?.image || '',
    rarity: locked.rarity || locked.key,
    rarityLabel: locked.rarityLabel || locked.label,
    price: locked.price,
    qty,
    listed: Math.min(listed, qty),
    source: 'kitsu',
    obtainedAt: c.obtainedAt || Date.now(),
  }
}

export function availableQty(stack) {
  if (!stack) return 0
  return Math.max(0, (Number(stack.qty) || 0) - (Number(stack.listed) || 0))
}

export function getUserForChars(jid, conn, participants = null) {
  const resolved = resolveDbUser(jid, conn, participants)
  if (!resolved.user) {
    const users = global.db.data.users
    users[resolved.jid] = users[resolved.jid] || {
      registered: true,
      name: 'Usuario',
      coins: 100,
      level: 1,
      exp: 0,
      characters: [],
    }
    resolved.user = users[resolved.jid]
  }
  ensureCharUser(resolved.user)
  return resolved
}

export function ownsCharacter(user, characterId) {
  ensureCharUser(user)
  const id = normalizeCharId(characterId)
  return user.characters.some(c => String(c.id) === id)
}

export function getOwnedQty(user, characterId) {
  ensureCharUser(user)
  const id = normalizeCharId(characterId)
  return user.characters.find(c => String(c.id) === id)?.qty || 0
}

export function getWallet(user) {
  ensureCharUser(user)
  return (Number(user.coins) || 0) + (Number(user.bancoDinero) || 0)
}

export function chargeCoins(user, amount) {
  ensureCharUser(user)
  const need = Math.floor(Number(amount) || 0)
  if (need <= 0) return true
  if (getWallet(user) < need) return false

  let left = need
  const coins = Number(user.coins) || 0
  if (coins >= left) {
    user.coins = coins - left
    return true
  }
  left -= coins
  user.coins = 0
  user.bancoDinero = (Number(user.bancoDinero) || 0) - left
  return true
}

export function addCoins(user, amount) {
  ensureCharUser(user)
  user.coins = (Number(user.coins) || 0) + Math.floor(Number(amount) || 0)
}

export function addCharacter(user, character, amount = 1) {
  ensureCharUser(user)
  const id = normalizeCharId(character.id)
  const entry = upsertCatalogEntry(character)
  const addQty = Math.max(1, Math.floor(Number(amount) || 1))
  const existing = user.characters.find(c => String(c.id) === id)

  if (existing) {
    existing.qty += addQty
    existing.name = entry.name
    existing.image = entry.image || existing.image
    existing.rarity = entry.rarity
    existing.rarityLabel = entry.rarityLabel
    existing.price = entry.price
    existing.listed = Math.min(existing.listed || 0, existing.qty)
    return { ok: true, qty: existing.qty, listed: existing.listed || 0, stacked: true }
  }

  user.characters.push({
    id: entry.id,
    name: entry.name,
    anime: entry.anime,
    image: entry.image,
    rarity: entry.rarity,
    rarityLabel: entry.rarityLabel,
    price: entry.price,
    qty: addQty,
    listed: 0,
    source: 'kitsu',
    obtainedAt: Date.now(),
  })
  return { ok: true, qty: addQty, listed: 0, stacked: false }
}

export function getHaremSlots(user) {
  ensureCharUser(user)
  return user.characters.map((c, i) => ({
    ...c,
    slot: i + 1,
    available: availableQty(c),
    listed: Number(c.listed) || 0,
  }))
}

export function countUnits(user) {
  ensureCharUser(user)
  return user.characters.reduce((sum, c) => sum + (Number(c.qty) || 1), 0)
}

export function countTypes(user) {
  ensureCharUser(user)
  return user.characters.length
}

export function findCharacterIndex(user, query = '') {
  ensureCharUser(user)
  const q = String(query || '').trim().toLowerCase()
  if (!q) return -1
  if (/^\d+$/.test(q)) {
    const asIndex = parseInt(q, 10) - 1
    if (asIndex >= 0 && asIndex < user.characters.length) return asIndex
  }
  const id = normalizeCharId(q)
  const byId = user.characters.findIndex(c => String(c.id) === id)
  if (byId >= 0) return byId
  return user.characters.findIndex(c =>
    String(c.name).toLowerCase() === q ||
    String(c.name).toLowerCase().includes(q)
  )
}

/** Reserva 1 unidad para la tienda (sigue en el harem). */
export function reserveForListing(user, index, amount = 1) {
  ensureCharUser(user)
  const i = Number(index)
  if (!Number.isInteger(i) || i < 0 || i >= user.characters.length) {
    return { ok: false, reason: 'missing' }
  }
  const stack = user.characters[i]
  const take = Math.max(1, Math.floor(Number(amount) || 1))
  const free = availableQty(stack)
  if (free < take) {
    return {
      ok: false,
      reason: free <= 0 ? 'all_listed' : 'no_free',
      free,
      qty: stack.qty,
      listed: stack.listed || 0,
    }
  }

  stack.listed = (Number(stack.listed) || 0) + take
  return {
    ok: true,
    character: {
      id: stack.id,
      name: stack.name,
      anime: stack.anime,
      image: stack.image,
      rarity: stack.rarity,
      rarityLabel: stack.rarityLabel,
      price: stack.price,
      source: stack.source || 'kitsu',
      qty: take,
    },
    stack,
  }
}

/** Cancela reserva (vuelve a disponible en harem). */
export function releaseListingReserve(user, characterId, amount = 1) {
  ensureCharUser(user)
  const id = normalizeCharId(characterId)
  const stack = user.characters.find(c => String(c.id) === id)
  if (!stack) return { ok: false, reason: 'missing' }
  const n = Math.max(1, Math.floor(Number(amount) || 1))
  stack.listed = Math.max(0, (Number(stack.listed) || 0) - n)
  return { ok: true, stack }
}

/** Se vendió: baja qty y listed del vendedor. */
export function consumeSoldListing(user, characterId, amount = 1) {
  ensureCharUser(user)
  const id = normalizeCharId(characterId)
  const idx = user.characters.findIndex(c => String(c.id) === id)
  if (idx < 0) return { ok: false, reason: 'missing' }

  const stack = user.characters[idx]
  const n = Math.max(1, Math.floor(Number(amount) || 1))
  stack.qty = Math.max(0, (Number(stack.qty) || 0) - n)
  stack.listed = Math.max(0, (Number(stack.listed) || 0) - n)
  if (stack.listed > stack.qty) stack.listed = stack.qty
  if (stack.qty <= 0) user.characters.splice(idx, 1)
  return { ok: true }
}

/** Compat: quita unidades libres del harem (no listadas). */
export function takeCharacterFromSlot(user, index, amount = 1) {
  ensureCharUser(user)
  const i = Number(index)
  if (!Number.isInteger(i) || i < 0 || i >= user.characters.length) return null
  const stack = user.characters[i]
  const take = Math.max(1, Math.floor(Number(amount) || 1))
  if (availableQty(stack) < take) return null

  const piece = {
    id: stack.id,
    name: stack.name,
    anime: stack.anime,
    image: stack.image,
    rarity: stack.rarity,
    rarityLabel: stack.rarityLabel,
    price: stack.price,
    source: stack.source || 'kitsu',
    qty: take,
  }

  stack.qty -= take
  if (stack.listed > stack.qty) stack.listed = stack.qty
  if (stack.qty <= 0) user.characters.splice(i, 1)
  return piece
}

export function collectionValue(user) {
  ensureCharUser(user)
  return user.characters.reduce((sum, c) => sum + (Number(c.price) || 0) * (Number(c.qty) || 1), 0)
}

/** Ranking global de harems por valor de catálogo. */
export function getTopHarem(limit = 10) {
  const users = global.db?.data?.users || {}
  const rows = []

  for (const [jid, user] of Object.entries(users)) {
    if (!user || typeof user !== 'object') continue
    if (!Array.isArray(user.characters) || !user.characters.length) continue

    ensureCharUser(user)
    const units = countUnits(user)
    const types = countTypes(user)
    const value = collectionValue(user)
    if (units <= 0 || value <= 0) continue

    rows.push({
      jid,
      name: user.name || user.pushName || 'Usuario',
      units,
      types,
      value,
    })
  }

  rows.sort((a, b) =>
    b.value - a.value ||
    b.units - a.units ||
    b.types - a.types
  )

  return rows.slice(0, Math.max(1, Math.min(50, Number(limit) || 10)))
}

