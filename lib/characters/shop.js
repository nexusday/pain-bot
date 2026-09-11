import { normalizarIdPersonaje } from './store.js'
import {
  obtenerUsuarioParaChars,
  agregarMonedas,
  cobrarMonedas,
  agregarPersonaje,
  obtenerMonedero,
  asegurarUsuarioChars,
  cantidadDisponible,
  liberarReservaPublicacion,
  consumirPublicacionVendida,
} from './collection.js'

const PRECIO_MIN_PUBLICACION = 100

function bdTienda() {
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

function digitosDe(jid = '') {
  return String(jid).replace(/\D/g, '')
}

export function mismoJid(a, b) {
  if (!a || !b) return false
  if (String(a) === String(b)) return true
  const da = digitosDe(a)
  const db = digitosDe(b)
  return Boolean(da && db && da === db)
}

export function listarPublicacionesActivas() {
  return bdTienda().listings
    .filter(l => l && l.status === 'active')
    .sort((a, b) => a.order - b.order)
}

export function listarActivasPorVendedor(sellerJid) {
  return listarPublicacionesActivas().filter(l => mismoJid(l.sellerJid, sellerJid))
}

export function listarTiendaParaAlbum(limite = 49) {
  const activas = listarPublicacionesActivas()
  const vendidas = bdTienda().listings
    .filter(l => l && l.status === 'sold')
    .sort((a, b) => (b.soldAt || 0) - (a.soldAt || 0))
    .slice(0, 12)

  const fusionadas = [...activas, ...vendidas].slice(0, limite)
  return agruparPublicacionesParaAlbum(fusionadas)
}

export function agruparPublicacionesParaAlbum(publicaciones = []) {
  const grupos = []
  const mapa = new Map()

  for (const l of publicaciones) {
    const clave = `${l.status}:${normalizarIdPersonaje(l.charId)}`
    if (!mapa.has(clave)) {
      const g = {
        id: normalizarIdPersonaje(l.charId),
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
      mapa.set(clave, g)
      grupos.push(g)
    }
    const g = mapa.get(clave)
    g.qty += 1
    g.sellers.push(l.sellerName || 'Usuario')
    g.orders.push(l.order)
    g.priceMin = Math.min(g.priceMin, l.price)
    g.priceMax = Math.max(g.priceMax, l.price)
    if (l.order < g.order) g.order = l.order
  }

  return grupos
}

export function obtenerPublicacionPorOrden(orden) {
  const n = Number(orden)
  if (!Number.isFinite(n)) return null
  return bdTienda().listings.find(l => Number(l.order) === n) || null
}

/**
 * Sincroniza `listed` del harem con órdenes activas del vendedor.
 * También restaura personajes huérfanos de publicaciones viejas.
 */
export function sincronizarPublicacionesVendedor(usuario, sellerJid, publicacionesMuestra = null) {
  asegurarUsuarioChars(usuario)
  const activas = publicacionesMuestra || listarActivasPorVendedor(sellerJid)
  const conteos = new Map()

  for (const l of activas) {
    const id = normalizarIdPersonaje(l.charId)
    if (!id) continue
    if (!conteos.has(id)) conteos.set(id, { n: 0, sample: l })
    conteos.get(id).n += 1
  }

  for (const c of usuario.characters) c.listed = 0

  for (const [id, info] of conteos) {
    let pila = usuario.characters.find(c => String(c.id) === id)
    if (!pila) {
      const l = info.sample
      agregarPersonaje(usuario, {
        id,
        name: l.name,
        anime: l.anime,
        image: l.image,
        rarity: l.rarity,
        rarityLabel: l.rarityLabel,
        price: l.catalogPrice || l.price,
      }, info.n)
      pila = usuario.characters.find(c => String(c.id) === id)
    }
    if (!pila) continue
    if (pila.qty < info.n) pila.qty = info.n
    pila.listed = info.n
  }

  return usuario
}

export function crearPublicacion({ sellerJid, sellerName, character, price }) {
  const pedir = Math.floor(Number(price) || 0)
  if (pedir < PRECIO_MIN_PUBLICACION) {
    return { ok: false, reason: 'min_price', min: PRECIO_MIN_PUBLICACION }
  }

  const tienda = bdTienda()
  const order = tienda.nextOrder++
  const listing = {
    order,
    status: 'active',
    sellerJid,
    sellerName: sellerName || 'Usuario',
    charId: normalizarIdPersonaje(character.id),
    name: character.name,
    anime: character.anime || 'Sin serie',
    image: character.image || '',
    rarity: character.rarity,
    rarityLabel: character.rarityLabel,
    catalogPrice: character.price,
    price: pedir,
    createdAt: Date.now(),
    soldAt: null,
    buyerJid: null,
  }
  tienda.listings.push(listing)
  return { ok: true, listing }
}

export function comprarPublicacion(orden, buyerJid, buyerConn, participantes = null) {
  const listing = obtenerPublicacionPorOrden(orden)
  if (!listing) return { ok: false, reason: 'not_found' }
  if (listing.status !== 'active') return { ok: false, reason: 'sold' }
  if (mismoJid(listing.sellerJid, buyerJid)) {
    return { ok: false, reason: 'own' }
  }

  const { user: comprador } = obtenerUsuarioParaChars(buyerJid, buyerConn, participantes)
  const { user: vendedor, jid: sellerKey } = obtenerUsuarioParaChars(listing.sellerJid, buyerConn, participantes)
  sincronizarPublicacionesVendedor(vendedor, listing.sellerJid)

  if (obtenerMonedero(comprador) < listing.price) {
    return { ok: false, reason: 'no_money', need: listing.price, have: obtenerMonedero(comprador) }
  }

  if (!cobrarMonedas(comprador, listing.price)) {
    return { ok: false, reason: 'charge_fail' }
  }

  agregarMonedas(vendedor, listing.price)
  agregarPersonaje(comprador, {
    id: listing.charId,
    name: listing.name,
    anime: listing.anime,
    image: listing.image,
    rarity: listing.rarity,
    rarityLabel: listing.rarityLabel,
    price: listing.catalogPrice || listing.price,
  })

  const consumido = consumirPublicacionVendida(vendedor, listing.charId, 1)
  if (!consumido.ok) {
    // Publicación vieja sin stack: no rompe la venta al comprador
  }

  listing.status = 'sold'
  listing.soldAt = Date.now()
  listing.buyerJid = buyerJid

  try { podarPublicacionesTienda() } catch {}

  return {
    ok: true,
    listing,
    sellerJid: sellerKey || listing.sellerJid,
    paid: listing.price,
  }
}

export function cancelarPublicacion(orden, sellerJid, sellerConn = null, participantes = null) {
  const listing = obtenerPublicacionPorOrden(orden)
  if (!listing) return { ok: false, reason: 'not_found' }
  if (listing.status !== 'active') return { ok: false, reason: 'sold' }
  if (!mismoJid(listing.sellerJid, sellerJid)) return { ok: false, reason: 'forbidden' }

  const { user: vendedor } = obtenerUsuarioParaChars(listing.sellerJid, sellerConn, participantes)
  sincronizarPublicacionesVendedor(vendedor, listing.sellerJid)

  listing.status = 'cancelled'
  listing.soldAt = Date.now()

  liberarReservaPublicacion(vendedor, listing.charId, 1)
  try { podarPublicacionesTienda() } catch {}

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
export function podarPublicacionesTienda({ keepSold = 40, keepCancelled = 20 } = {}) {
  const tienda = bdTienda()
  const activas = tienda.listings.filter(l => l?.status === 'active')
  const vendidas = tienda.listings
    .filter(l => l?.status === 'sold')
    .sort((a, b) => (b.soldAt || 0) - (a.soldAt || 0))
    .slice(0, keepSold)
  const canceladas = tienda.listings
    .filter(l => l?.status === 'cancelled')
    .sort((a, b) => (b.soldAt || 0) - (a.soldAt || 0))
    .slice(0, keepCancelled)
  tienda.listings = [...activas, ...vendidas, ...canceladas]
  return tienda.listings.length
}

export {
  PRECIO_MIN_PUBLICACION,
  PRECIO_MIN_PUBLICACION as MIN_LIST_PRICE,
  cantidadDisponible,
  cantidadDisponible as availableQty,
  mismoJid as sameJid,
  listarPublicacionesActivas as listActiveListings,
  listarActivasPorVendedor as listActiveBySeller,
  listarTiendaParaAlbum as listShopForAlbum,
  agruparPublicacionesParaAlbum as groupListingsForAlbum,
  obtenerPublicacionPorOrden as getListingByOrder,
  sincronizarPublicacionesVendedor as syncSellerListings,
  crearPublicacion as createListing,
  comprarPublicacion as buyListing,
  cancelarPublicacion as cancelListing,
  podarPublicacionesTienda as pruneShopListings,
}
