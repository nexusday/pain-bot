import { normalizeCharId } from './store.js'
import {
  getUserForChars,
  addCoins,
  chargeCoins,
  addCharacter,
  getWallet,
  ensureCharUser,
  availableQty,
  releaseListingReserve,
  consumeSoldListing,
} from './collection.js'

const MIN_LIST_PRICE = 100

function shopDb() {
  if (!global.db.data.charShop) {
    global.db.data.charShop = {
      nextOrder: 1,
      listings: [],
    }
  }
  if (!Array.isArray(global.db.data.charShop.listings)) global.db.data.charShop.listings = []
  if (!Number.isFinite(global.db.data.charShop.nextOrder)) global.db.data.charShop.nextOrder = 1
  return global.db.data.charShop
}

function digitsOf(jid = '') {
  return String(jid).replace(/\D/g, '')
}

export function sameJid(a, b) {
  if (!a || !b) return false
  if (String(a) === String(b)) return true
  const da = digitsOf(a)
  const db = digitsOf(b)
  return Boolean(da && db && da === db)
}

export function listActiveListings() {
  return shopDb().listings
    .filter(l => l && l.status === 'active')
    .sort((a, b) => a.order - b.order)
}

export function listActiveBySeller(sellerJid) {
  return listActiveListings().filter(l => sameJid(l.sellerJid, sellerJid))
}

export function listShopForAlbum(limit = 49) {
  const active = listActiveListings()
  const sold = shopDb().listings
    .filter(l => l && l.status === 'sold')
    .sort((a, b) => (b.soldAt || 0) - (a.soldAt || 0))
    .slice(0, 12)

  const merged = [...active, ...sold].slice(0, limit)
  return groupListingsForAlbum(merged)
}

export function groupListingsForAlbum(listings = []) {
  const groups = []
  const map = new Map()

  for (const l of listings) {
    const key = `${l.status}:${normalizeCharId(l.charId)}`
    if (!map.has(key)) {
      const g = {
        id: normalizeCharId(l.charId),
        name: l.name,
        image: l.image,
        rarityLabel: l.rarityLabel,
        status: l.status,
        qty: 0,
        sellers: [],
        orders: [],
        priceMin: l.price,
        priceMax: l.price,
        order: l.order,
      }
      map.set(key, g)
      groups.push(g)
    }
    const g = map.get(key)
    g.qty += 1
    g.sellers.push(l.sellerName || 'Usuario')
    g.orders.push(l.order)
    g.priceMin = Math.min(g.priceMin, l.price)
    g.priceMax = Math.max(g.priceMax, l.price)
    if (l.order < g.order) g.order = l.order
  }

  return groups
}

export function getListingByOrder(order) {
  const n = Number(order)
  if (!Number.isFinite(n)) return null
  return shopDb().listings.find(l => Number(l.order) === n) || null
}

/**
 * Sincroniza `listed` del harem con órdenes activas del vendedor.
 * También restaura personajes huérfanos de publicaciones viejas.
 */
export function syncSellerListings(user, sellerJid, sampleListings = null) {
  ensureCharUser(user)
  const active = sampleListings || listActiveBySeller(sellerJid)
  const counts = new Map()

  for (const l of active) {
    const id = normalizeCharId(l.charId)
    if (!id) continue
    if (!counts.has(id)) counts.set(id, { n: 0, sample: l })
    counts.get(id).n += 1
  }

  for (const c of user.characters) c.listed = 0

  for (const [id, info] of counts) {
    let stack = user.characters.find(c => String(c.id) === id)
    if (!stack) {
      const l = info.sample
      addCharacter(user, {
        id,
        name: l.name,
        anime: l.anime,
        image: l.image,
        rarity: l.rarity,
        rarityLabel: l.rarityLabel,
        price: l.catalogPrice || l.price,
      }, info.n)
      stack = user.characters.find(c => String(c.id) === id)
    }
    if (!stack) continue
    if (stack.qty < info.n) stack.qty = info.n
    stack.listed = info.n
  }

  return user
}

export function createListing({ sellerJid, sellerName, character, price }) {
  const ask = Math.floor(Number(price) || 0)
  if (ask < MIN_LIST_PRICE) {
    return { ok: false, reason: 'min_price', min: MIN_LIST_PRICE }
  }

  const shop = shopDb()
  const order = shop.nextOrder++
  const listing = {
    order,
    status: 'active',
    sellerJid,
    sellerName: sellerName || 'Usuario',
    charId: normalizeCharId(character.id),
    name: character.name,
    anime: character.anime || 'Sin serie',
    image: character.image || '',
    rarity: character.rarity,
    rarityLabel: character.rarityLabel,
    catalogPrice: character.price,
    price: ask,
    createdAt: Date.now(),
    soldAt: null,
    buyerJid: null,
  }
  shop.listings.push(listing)
  return { ok: true, listing }
}

export function buyListing(order, buyerJid, buyerConn, participants = null) {
  const listing = getListingByOrder(order)
  if (!listing) return { ok: false, reason: 'not_found' }
  if (listing.status !== 'active') return { ok: false, reason: 'sold' }
  if (sameJid(listing.sellerJid, buyerJid)) {
    return { ok: false, reason: 'own' }
  }

  const { user: buyer } = getUserForChars(buyerJid, buyerConn, participants)
  const { user: seller, jid: sellerKey } = getUserForChars(listing.sellerJid, buyerConn, participants)
  syncSellerListings(seller, listing.sellerJid)

  if (getWallet(buyer) < listing.price) {
    return { ok: false, reason: 'no_money', need: listing.price, have: getWallet(buyer) }
  }

  if (!chargeCoins(buyer, listing.price)) {
    return { ok: false, reason: 'charge_fail' }
  }

  addCoins(seller, listing.price)
  addCharacter(buyer, {
    id: listing.charId,
    name: listing.name,
    anime: listing.anime,
    image: listing.image,
    rarity: listing.rarity,
    rarityLabel: listing.rarityLabel,
    price: listing.catalogPrice || listing.price,
  })

  const consumed = consumeSoldListing(seller, listing.charId, 1)
  if (!consumed.ok) {
    // Publicación vieja sin stack: no rompe la venta al comprador
  }

  listing.status = 'sold'
  listing.soldAt = Date.now()
  listing.buyerJid = buyerJid

  try { pruneShopListings() } catch {}

  return {
    ok: true,
    listing,
    sellerJid: sellerKey || listing.sellerJid,
    paid: listing.price,
  }
}

export function cancelListing(order, sellerJid, sellerConn = null, participants = null) {
  const listing = getListingByOrder(order)
  if (!listing) return { ok: false, reason: 'not_found' }
  if (listing.status !== 'active') return { ok: false, reason: 'sold' }
  if (!sameJid(listing.sellerJid, sellerJid)) return { ok: false, reason: 'forbidden' }

  const { user: seller } = getUserForChars(listing.sellerJid, sellerConn, participants)
  syncSellerListings(seller, listing.sellerJid)

  listing.status = 'cancelled'
  listing.soldAt = Date.now()

  releaseListingReserve(seller, listing.charId, 1)
  try { pruneShopListings() } catch {}

  return {
    ok: true,
    listing,
    character: {
      id: listing.charId,
      name: listing.name,
      anime: listing.anime,
      image: listing.image,
      rarity: listing.rarity,
      rarityLabel: listing.rarityLabel,
      price: listing.catalogPrice || listing.price,
    },
  }
}

/** Mantiene la DB liviana: vende/cancela viejos se archivan. */
export function pruneShopListings({ keepSold = 40, keepCancelled = 20 } = {}) {
  const shop = shopDb()
  const active = shop.listings.filter(l => l?.status === 'active')
  const sold = shop.listings
    .filter(l => l?.status === 'sold')
    .sort((a, b) => (b.soldAt || 0) - (a.soldAt || 0))
    .slice(0, keepSold)
  const cancelled = shop.listings
    .filter(l => l?.status === 'cancelled')
    .sort((a, b) => (b.soldAt || 0) - (a.soldAt || 0))
    .slice(0, keepCancelled)
  shop.listings = [...active, ...sold, ...cancelled]
  return shop.listings.length
}

export { MIN_LIST_PRICE, availableQty }
