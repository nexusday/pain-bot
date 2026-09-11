import { resolveDbUser } from '../michi-users.js'
import { estadisticasPorId, estadisticasCombatePorPrecio } from './rarity.js'
import { normalizarIdPersonaje, obtenerEntradaCatalogo, insertarOActualizarEntradaCatalogo } from './store.js'

function resolverCombate(id, precio, catalogo) {
  if (catalogo?.maxHp && catalogo?.power) {
    return {
      maxHp: Number(catalogo.maxHp) || 0,
      hp: Number(catalogo.hp || catalogo.maxHp) || 0,
      power: Number(catalogo.power) || 0,
    }
  }
  return estadisticasCombatePorPrecio(precio, id)
}

export function asegurarUsuarioChars(usuario) {
  if (!usuario || typeof usuario !== 'object') return usuario
  if (!Number.isFinite(usuario.coins) || usuario.coins < 0) usuario.coins = 0
  if (!Number.isFinite(usuario.bancoDinero) || usuario.bancoDinero < 0) usuario.bancoDinero = 0
  if (!Array.isArray(usuario.characters)) usuario.characters = []

  const mapa = new Map()
  for (const crudo of usuario.characters) {
    const c = normalizarPersonajePoseido(crudo)
    if (!c?.id) continue
    const prev = mapa.get(c.id)
    if (prev) {
      prev.qty += c.qty
      prev.listed += c.listed
      if ((crudo.obtainedAt || 0) < (prev.obtainedAt || Infinity)) prev.obtainedAt = crudo.obtainedAt
    } else {
      mapa.set(c.id, c)
    }
  }

  usuario.characters = [...mapa.values()]
    .map(c => {
      c.listed = Math.min(Math.max(0, c.listed), c.qty)
      return c
    })
    .sort((a, b) => (a.obtainedAt || 0) - (b.obtainedAt || 0))
  return usuario
}

function normalizarPersonajePoseido(c = {}) {
  const id = normalizarIdPersonaje(c.id || c.sourceId)
  if (!id) return null
  const catalogo = obtenerEntradaCatalogo(id)
  const bloqueado = catalogo || estadisticasPorId(id)
  const qty = Math.max(1, Math.floor(Number(c.qty) || 1))
  const listed = Math.max(0, Math.floor(Number(c.listed) || 0))
  const combate = resolverCombate(id, bloqueado.price, catalogo || bloqueado)
  return {
    id,
    name: c.name || catalogo?.name || `Character ${id}`,
    anime: c.anime || catalogo?.anime || 'Sin serie',
    image: c.image || catalogo?.image || '',
    rarity: bloqueado.rarity || bloqueado.key,
    rarityLabel: bloqueado.rarityLabel || bloqueado.label,
    price: bloqueado.price,
    maxHp: combate.maxHp,
    hp: combate.hp || combate.maxHp,
    power: combate.power,
    qty,
    listed: Math.min(listed, qty),
    source: 'kitsu',
    obtainedAt: c.obtainedAt || Date.now(),
  }
}

export function cantidadDisponible(pila) {
  if (!pila) return 0
  return Math.max(0, (Number(pila.qty) || 0) - (Number(pila.listed) || 0))
}

export function obtenerUsuarioParaChars(jid, conn, participantes = null) {
  const resuelto = resolveDbUser(jid, conn, participantes)
  if (!resuelto.user) {
    const usuarios = global.db.data.users
    usuarios[resuelto.jid] = usuarios[resuelto.jid] || {
      registered: true,
      name: 'Usuario',
      coins: 100,
      level: 1,
      exp: 0,
      characters: [],
    }
    resuelto.user = usuarios[resuelto.jid]
  }
  asegurarUsuarioChars(resuelto.user)
  return resuelto
}

export function poseePersonaje(usuario, characterId) {
  asegurarUsuarioChars(usuario)
  const id = normalizarIdPersonaje(characterId)
  return usuario.characters.some(c => String(c.id) === id)
}

export function obtenerCantidadPoseida(usuario, characterId) {
  asegurarUsuarioChars(usuario)
  const id = normalizarIdPersonaje(characterId)
  return usuario.characters.find(c => String(c.id) === id)?.qty || 0
}

export function obtenerMonedero(usuario) {
  asegurarUsuarioChars(usuario)
  return (Number(usuario.coins) || 0) + (Number(usuario.bancoDinero) || 0)
}

export function cobrarMonedas(usuario, cantidad) {
  asegurarUsuarioChars(usuario)
  const necesario = Math.floor(Number(cantidad) || 0)
  if (necesario <= 0) return true
  if (obtenerMonedero(usuario) < necesario) return false

  let restante = necesario
  const monedas = Number(usuario.coins) || 0
  if (monedas >= restante) {
    usuario.coins = monedas - restante
    return true
  }
  restante -= monedas
  usuario.coins = 0
  usuario.bancoDinero = (Number(usuario.bancoDinero) || 0) - restante
  return true
}

export function agregarMonedas(usuario, cantidad) {
  asegurarUsuarioChars(usuario)
  usuario.coins = (Number(usuario.coins) || 0) + Math.floor(Number(cantidad) || 0)
}

export function agregarPersonaje(usuario, personaje, cantidad = 1) {
  asegurarUsuarioChars(usuario)
  const id = normalizarIdPersonaje(personaje.id)
  const entrada = insertarOActualizarEntradaCatalogo(personaje)
  const qtyAgregar = Math.max(1, Math.floor(Number(cantidad) || 1))
  const existente = usuario.characters.find(c => String(c.id) === id)

  if (existente) {
    existente.qty += qtyAgregar
    existente.name = entrada.name
    existente.image = entrada.image || existente.image
    existente.rarity = entrada.rarity
    existente.rarityLabel = entrada.rarityLabel
    existente.price = entrada.price
    existente.maxHp = entrada.maxHp
    existente.hp = entrada.hp
    existente.power = entrada.power
    existente.listed = Math.min(existente.listed || 0, existente.qty)
    return { ok: true, qty: existente.qty, listed: existente.listed || 0, stacked: true }
  }

  usuario.characters.push({
    id: entrada.id,
    name: entrada.name,
    anime: entrada.anime,
    image: entrada.image,
    rarity: entrada.rarity,
    rarityLabel: entrada.rarityLabel,
    price: entrada.price,
    maxHp: entrada.maxHp,
    hp: entrada.hp,
    power: entrada.power,
    qty: qtyAgregar,
    listed: 0,
    source: 'kitsu',
    obtainedAt: Date.now(),
  })
  return { ok: true, qty: qtyAgregar, listed: 0, stacked: false }
}

export function obtenerSlotsHarem(usuario) {
  asegurarUsuarioChars(usuario)
  return usuario.characters.map((c, i) => ({
    ...c,
    slot: i + 1,
    available: cantidadDisponible(c),
    listed: Number(c.listed) || 0,
  }))
}

export function contarUnidades(usuario) {
  asegurarUsuarioChars(usuario)
  return usuario.characters.reduce((suma, c) => suma + (Number(c.qty) || 1), 0)
}

export function contarTipos(usuario) {
  asegurarUsuarioChars(usuario)
  return usuario.characters.length
}

export function encontrarIndicePersonaje(usuario, consulta = '') {
  asegurarUsuarioChars(usuario)
  const q = String(consulta || '').trim().toLowerCase()
  if (!q) return -1
  if (/^\d+$/.test(q)) {
    const comoIndice = parseInt(q, 10) - 1
    if (comoIndice >= 0 && comoIndice < usuario.characters.length) return comoIndice
  }
  const id = normalizarIdPersonaje(q)
  const porId = usuario.characters.findIndex(c => String(c.id) === id)
  if (porId >= 0) return porId
  return usuario.characters.findIndex(c =>
    String(c.name).toLowerCase() === q ||
    String(c.name).toLowerCase().includes(q)
  )
}

/** Reserva 1 unidad para la tienda (sigue en el harem). */
export function reservarParaPublicacion(usuario, indice, cantidad = 1) {
  asegurarUsuarioChars(usuario)
  const i = Number(indice)
  if (!Number.isInteger(i) || i < 0 || i >= usuario.characters.length) {
    return { ok: false, reason: 'missing' }
  }
  const pila = usuario.characters[i]
  const tomar = Math.max(1, Math.floor(Number(cantidad) || 1))
  const libres = cantidadDisponible(pila)
  if (libres < tomar) {
    return {
      ok: false,
      reason: libres <= 0 ? 'all_listed' : 'no_free',
      free: libres,
      qty: pila.qty,
      listed: pila.listed || 0,
    }
  }

  pila.listed = (Number(pila.listed) || 0) + tomar
  return {
    ok: true,
    character: {
      id: pila.id,
      name: pila.name,
      anime: pila.anime,
      image: pila.image,
      rarity: pila.rarity,
      rarityLabel: pila.rarityLabel,
      price: pila.price,
      maxHp: pila.maxHp,
      hp: pila.hp,
      power: pila.power,
      source: pila.source || 'kitsu',
      qty: tomar,
    },
    stack: pila,
  }
}

/** Cancela reserva (vuelve a disponible en harem). */
export function liberarReservaPublicacion(usuario, characterId, cantidad = 1) {
  asegurarUsuarioChars(usuario)
  const id = normalizarIdPersonaje(characterId)
  const pila = usuario.characters.find(c => String(c.id) === id)
  if (!pila) return { ok: false, reason: 'missing' }
  const n = Math.max(1, Math.floor(Number(cantidad) || 1))
  pila.listed = Math.max(0, (Number(pila.listed) || 0) - n)
  return { ok: true, stack: pila }
}

/** Se vendió: baja qty y listed del vendedor. */
export function consumirPublicacionVendida(usuario, characterId, cantidad = 1) {
  asegurarUsuarioChars(usuario)
  const id = normalizarIdPersonaje(characterId)
  const idx = usuario.characters.findIndex(c => String(c.id) === id)
  if (idx < 0) return { ok: false, reason: 'missing' }

  const pila = usuario.characters[idx]
  const n = Math.max(1, Math.floor(Number(cantidad) || 1))
  pila.qty = Math.max(0, (Number(pila.qty) || 0) - n)
  pila.listed = Math.max(0, (Number(pila.listed) || 0) - n)
  if (pila.listed > pila.qty) pila.listed = pila.qty
  if (pila.qty <= 0) usuario.characters.splice(idx, 1)
  return { ok: true }
}

/** Compat: quita unidades libres del harem (no listadas). */
export function tomarPersonajeDeSlot(usuario, indice, cantidad = 1) {
  asegurarUsuarioChars(usuario)
  const i = Number(indice)
  if (!Number.isInteger(i) || i < 0 || i >= usuario.characters.length) return null
  const pila = usuario.characters[i]
  const tomar = Math.max(1, Math.floor(Number(cantidad) || 1))
  if (cantidadDisponible(pila) < tomar) return null

  const pieza = {
    id: pila.id,
    name: pila.name,
    anime: pila.anime,
    image: pila.image,
    rarity: pila.rarity,
    rarityLabel: pila.rarityLabel,
    price: pila.price,
    maxHp: pila.maxHp,
    hp: pila.hp,
    power: pila.power,
    source: pila.source || 'kitsu',
    qty: tomar,
  }

  pila.qty -= tomar
  if (pila.listed > pila.qty) pila.listed = pila.qty
  if (pila.qty <= 0) usuario.characters.splice(i, 1)
  return pieza
}

/** Regala 1 unidad libre (no listada) a otro usuario. */
export function regalarPersonajeDeSlot(deUsuario, aUsuario, indice) {
  asegurarUsuarioChars(deUsuario)
  asegurarUsuarioChars(aUsuario)
  const i = Number(indice)
  if (!Number.isInteger(i) || i < 0 || i >= deUsuario.characters.length) {
    return { ok: false, reason: 'missing' }
  }
  const pila = deUsuario.characters[i]
  if (cantidadDisponible(pila) < 1) {
    return {
      ok: false,
      reason: (Number(pila.listed) || 0) > 0 ? 'listed' : 'empty',
      name: pila.name,
      listed: pila.listed || 0,
      qty: pila.qty,
    }
  }

  const pieza = tomarPersonajeDeSlot(deUsuario, i, 1)
  if (!pieza) return { ok: false, reason: 'missing' }

  agregarPersonaje(aUsuario, pieza, 1)
  return { ok: true, character: pieza }
}

export function valorColeccion(usuario) {
  asegurarUsuarioChars(usuario)
  return usuario.characters.reduce((suma, c) => suma + (Number(c.price) || 0) * (Number(c.qty) || 1), 0)
}

/** Ranking global de harems por valor de catálogo. */
export function obtenerTopHarem(limite = 10) {
  const usuarios = global.db?.data?.users || {}
  const filas = []

  for (const [jid, usuario] of Object.entries(usuarios)) {
    if (!usuario || typeof usuario !== 'object') continue
    if (!Array.isArray(usuario.characters) || !usuario.characters.length) continue

    asegurarUsuarioChars(usuario)
    const units = contarUnidades(usuario)
    const types = contarTipos(usuario)
    const value = valorColeccion(usuario)
    if (units <= 0 || value <= 0) continue

    filas.push({
      jid,
      name: usuario.name || usuario.pushName || 'Usuario',
      units,
      types,
      value,
    })
  }

  filas.sort((a, b) =>
    b.value - a.value ||
    b.units - a.units ||
    b.types - a.types
  )

  return filas.slice(0, Math.max(1, Math.min(50, Number(limite) || 10)))
}

export {
  asegurarUsuarioChars as ensureCharUser,
  cantidadDisponible as availableQty,
  obtenerUsuarioParaChars as getUserForChars,
  poseePersonaje as ownsCharacter,
  obtenerCantidadPoseida as getOwnedQty,
  obtenerMonedero as getWallet,
  cobrarMonedas as chargeCoins,
  agregarMonedas as addCoins,
  agregarPersonaje as addCharacter,
  obtenerSlotsHarem as getHaremSlots,
  contarUnidades as countUnits,
  contarTipos as countTypes,
  encontrarIndicePersonaje as findCharacterIndex,
  reservarParaPublicacion as reserveForListing,
  liberarReservaPublicacion as releaseListingReserve,
  consumirPublicacionVendida as consumeSoldListing,
  tomarPersonajeDeSlot as takeCharacterFromSlot,
  regalarPersonajeDeSlot as giftCharacterFromSlot,
  valorColeccion as collectionValue,
  obtenerTopHarem as getTopHarem,
}
