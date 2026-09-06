import { fetchRandomCharacter, downloadCharacterImage } from './catalog.js'
import {
  getOffer,
  setOffer,
  clearOffer,
  tryBeginRoll,
  endRoll,
  offerSecondsLeft,
  ROLL_COOLDOWN_MS,
} from './offers.js'
import {
  getUserForChars,
  getOwnedQty,
  getWallet,
  chargeCoins,
  addCharacter,
  findCharacterIndex,
  collectionValue,
  countUnits,
  countTypes,
  getHaremSlots,
  ensureCharUser,
  availableQty,
  reserveForListing,
  releaseListingReserve,
} from './collection.js'
import { formatMoney } from './rarity.js'
import {
  renderHaremAlbum,
  renderMarketAlbum,
  buildHaremCaption,
  buildShopCaption,
} from './album.js'
import {
  createListing,
  listActiveListings,
  listShopForAlbum,
  buyListing,
  cancelListing,
  syncSellerListings,
  listActiveBySeller,
  MIN_LIST_PRICE,
} from './shop.js'

export function buildCharacterCaption(character, extra = {}) {
  const lines = [
    `🎴 *PERSONAJE EN OFERTA*`,
    ``,
    `> ・ Nombre: *${character.name}*`,
    `> ・ Anime: *${character.anime}*`,
    `> ・ Rareza: *${character.rarityLabel}*`,
    `> ・ Precio: *${formatMoney(character.price)}*`,
    `> ・ ID: \`${character.id}\``,
  ]
  if (extra.secondsLeft != null) lines.push(`> ・ Tiempo: *${extra.secondsLeft}s*`)
  if (extra.note) lines.push(``, extra.note)
  return lines.join('\n')
}

async function resolveImagePayload(character) {
  if (character?.imageBuffer && Buffer.isBuffer(character.imageBuffer)) return character.imageBuffer
  return downloadCharacterImage(character)
}

async function sendCharacterCard(conn, chat, { character, caption, buttons, quoted, mentionedJid }) {
  const image = await resolveImagePayload(character)
  const content = {
    image,
    caption,
    footer: global.packname || 'Pain Characters',
    buttons: buttons || [],
    contextInfo: {
      ...(global.rcanal?.contextInfo || {}),
      ...(mentionedJid?.length ? { mentionedJid } : {}),
    },
  }

  try {
    if (typeof conn.sendMessageLia === 'function' && buttons?.length) {
      return await conn.sendMessageLia(chat, content, { quoted })
    }
  } catch (e) {
    console.error('char interactive:', e?.message || e)
  }

  return conn.sendMessage(chat, {
    image,
    caption,
    contextInfo: content.contextInfo,
  }, { quoted })
}

async function sendAlbum(conn, chat, { image, caption, buttons, quoted }) {
  const content = {
    image,
    caption,
    footer: global.packname || 'Pain Characters',
    buttons: buttons || [],
    contextInfo: { ...(global.rcanal?.contextInfo || {}) },
  }
  try {
    if (typeof conn.sendMessageLia === 'function' && buttons?.length) {
      return await conn.sendMessageLia(chat, content, { quoted })
    }
  } catch (e) {
    console.error('album interactive:', e?.message || e)
  }
  return conn.sendMessage(chat, {
    image,
    caption,
    contextInfo: content.contextInfo,
  }, { quoted })
}

export async function rollCharacter(m, conn, usedPrefix = '.') {
  const begin = tryBeginRoll(m.sender)
  if (!begin.ok) {
    if (begin.reason === 'cooldown' || begin.reason === 'busy') {
      const sec = Math.ceil((begin.left || 1500) / 1000)
      await conn.sendMessage(m.chat, {
        text: `[⏳] Espera *${sec}s* para tirar otro personaje.`,
        contextInfo: { ...(global.rcanal?.contextInfo || {}) },
      }, { quoted: m })
    }
    return
  }

  try {
    await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } }).catch(() => {})

    const { user } = getUserForChars(m.sender, conn)
    const character = await fetchRandomCharacter()
    character.imageBuffer = await downloadCharacterImage(character)

    const offer = setOffer(m.chat, character, m.sender)

    const ownedQty = getOwnedQty(user, character.id)
    const p = usedPrefix || '.'
    const caption = buildCharacterCaption(character, {
      secondsLeft: offerSecondsLeft(offer),
      note: ownedQty > 0
        ? `> Ya tienes este personaje *(x${ownedQty})*. Puedes comprar otra copia.\n> Toca *Comprar* o usa *${p}claim*`
        : `> Toca *Comprar* o escribe *${p}claim*`,
    })

    await sendCharacterCard(conn, m.chat, {
      character,
      caption,
      quoted: m,
      buttons: [
        { text: `Comprar · ${character.price}`, id: `${p}claim` },
        { text: 'Mi harem', id: `${p}harem` },
        { text: 'Otro tiro', id: `${p}w` },
      ],
    })

    await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {})
  } finally {
    endRoll(m.sender)
  }
}

export async function claimCharacter(m, conn, usedPrefix = '.') {
  const offer = getOffer(m.chat)
  if (!offer) {
    await conn.sendMessage(m.chat, {
      text: `[❗] No hay personaje en oferta.\n> Tira uno con *${usedPrefix}w*`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
    return
  }

  const character = offer.character
  const { user } = getUserForChars(m.sender, conn)
  const wallet = getWallet(user)

  if (wallet < character.price) {
    await conn.sendMessage(m.chat, {
      text: `[❗] Te faltan monedas.\n> Precio: *${formatMoney(character.price)}*\n> Tu saldo: *${formatMoney(wallet)}*`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
    return
  }

  if (!chargeCoins(user, character.price)) {
    await conn.sendMessage(m.chat, {
      text: `[❗] No se pudo cobrar el personaje.`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
    return
  }

  const added = addCharacter(user, character)
  clearOffer(m.chat)

  const caption = [
    `✅ *¡Personaje comprado!*`,
    ``,
    `> ・ ${character.name}`,
    `> ・ ${character.rarityLabel}`,
    `> ・ Pagaste: *${formatMoney(character.price)}*`,
    `> ・ ID: \`${character.id}\``,
    `> ・ Ahora tienes: *x${added.qty}*`,
    `> ・ Harem: *${countTypes(user)}* tipos · *${countUnits(user)}* unidades`,
    ``,
    `> *${usedPrefix}harem* · *${usedPrefix}vender <n°> <precio>*`,
  ].join('\n')

  await sendCharacterCard(conn, m.chat, {
    character,
    caption,
    quoted: m,
    mentionedJid: [m.sender],
    buttons: [
      { text: 'Mi harem', id: `${usedPrefix}harem` },
      { text: 'Tirar otro', id: `${usedPrefix}w` },
    ],
  })
}

export async function showHarem(m, conn, usedPrefix = '.') {
  const { user } = getUserForChars(m.sender, conn)
  syncSellerListings(user, m.sender)
  ensureCharUser(user)

  if (!user.characters.length) {
    await conn.sendMessage(m.chat, {
      text: `🎴 *Tu harem está vacío*\n\n> Tira con *${usedPrefix}w* y compra con *${usedPrefix}claim*`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
    return
  }

  await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } }).catch(() => {})

  const slots = getHaremSlots(user)
  const value = collectionValue(user)
  const caption = buildHaremCaption(slots, value, usedPrefix)
  const album = await renderHaremAlbum(slots, {
    title: 'HAREM',
    subtitle: `${countTypes(user)} tipos · ${countUnits(user)} uds · ${formatMoney(value)}`,
  })

  await sendAlbum(conn, m.chat, {
    image: album,
    caption,
    quoted: m,
    buttons: [
      { text: 'Tirar w', id: `${usedPrefix}w` },
      { text: 'Tienda G', id: `${usedPrefix}tiendag` },
    ],
  })

  await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {})
}

export async function listCharacterForSale(m, conn, usedPrefix = '.', slotQuery = '', priceRaw = '') {
  const { user } = getUserForChars(m.sender, conn)
  syncSellerListings(user, m.sender)

  if (!user.characters.length) {
    await conn.sendMessage(m.chat, {
      text: `[❗] No tienes personajes para publicar.`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
    return
  }

  const idx = findCharacterIndex(user, slotQuery)
  const price = Math.floor(Number(String(priceRaw).replace(/[^\d]/g, '')) || 0)

  if (idx < 0 || !price) {
    await conn.sendMessage(m.chat, {
      text: `[❗] Uso: *${usedPrefix}vender <n°> <precio>*\n> Ejemplo: *${usedPrefix}vender 1 5000*\n> Revisa tus slots en *${usedPrefix}harem*`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
    return
  }

  if (price < MIN_LIST_PRICE) {
    await conn.sendMessage(m.chat, {
      text: `[❗] Precio mínimo: *${formatMoney(MIN_LIST_PRICE)}*`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
    return
  }

  const stack = user.characters[idx]
  const free = availableQty(stack)
  if (free < 1) {
    await conn.sendMessage(m.chat, {
      text: [
        `[❗] *${stack.name}* ya está en venta.`,
        `> Tienes *x${stack.qty}* · listadas *${stack.listed || 0}* · libres *0*`,
        `> Necesitas otra copia, o cancela con *${usedPrefix}cancelarg <orden>*`,
      ].join('\n'),
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
    return
  }

  const reserved = reserveForListing(user, idx, 1)
  if (!reserved.ok) {
    await conn.sendMessage(m.chat, {
      text: `[❗] No hay unidades libres para publicar.`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
    return
  }

  const sellerName = m.pushName || m.name || user.name || 'Usuario'
  const created = createListing({
    sellerJid: m.sender,
    sellerName,
    character: reserved.character,
    price,
  })

  if (!created.ok) {
    releaseListingReserve(user, reserved.character.id, 1)
    await conn.sendMessage(m.chat, {
      text: `[❗] No se pudo publicar.`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
    return
  }

  const listing = created.listing
  const leftFree = availableQty(stack)
  const caption = [
    `📌 *Publicado en Tienda G*`,
    ``,
    `> ・ ${listing.name}`,
    `> ・ Orden: *#${listing.order}*`,
    `> ・ Precio: *${formatMoney(listing.price)}*`,
    `> ・ Vendedor: *${listing.sellerName}*`,
    `> ・ En harem: *EN VENTA* · libres *${leftFree}* / *${stack.qty}*`,
    ``,
    `> Cancelar: *${usedPrefix}cancelarg ${listing.order}*`,
    `> Ver tienda: *${usedPrefix}tiendag*`,
  ].join('\n')

  await sendCharacterCard(conn, m.chat, {
    character: reserved.character,
    caption,
    quoted: m,
    buttons: [
      { text: 'Cancelar', id: `${usedPrefix}cancelarg ${listing.order}` },
      { text: 'Tienda G', id: `${usedPrefix}tiendag` },
      { text: 'Mi harem', id: `${usedPrefix}harem` },
    ],
  })
}

export async function cancelCharacterSale(m, conn, usedPrefix = '.', orderRaw = '') {
  const order = Math.floor(Number(String(orderRaw).replace(/[^\d]/g, '')) || 0)
  if (!order) {
    const mine = listActiveBySeller(m.sender)
    const hint = mine.length
      ? `\n\nTus órdenes:\n${mine.slice(0, 10).map(l => `> *${l.order}* · ${l.name} · ${formatMoney(l.price)}`).join('\n')}`
      : `\n> No tienes publicaciones activas.`
    await conn.sendMessage(m.chat, {
      text: `[❗] Uso: *${usedPrefix}cancelarg <orden>*${hint}`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
    return
  }

  const result = cancelListing(order, m.sender, conn)
  if (!result.ok) {
    const map = {
      not_found: 'No existe esa orden.',
      sold: 'Esa orden ya no está activa (vendida o cancelada).',
      forbidden: 'Solo el dueño puede cancelar esa publicación.',
    }
    await conn.sendMessage(m.chat, {
      text: `[❗] ${map[result.reason] || 'No se pudo cancelar.'}`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
    return
  }

  const l = result.listing
  const caption = [
    `❎ *Publicación cancelada*`,
    ``,
    `> ・ Orden: *#${l.order}*`,
    `> ・ ${l.name}`,
    `> ・ Volvió a tu harem (ya no está en venta)`,
    ``,
    `> *${usedPrefix}harem* · *${usedPrefix}tiendag*`,
  ].join('\n')

  await sendCharacterCard(conn, m.chat, {
    character: result.character,
    caption,
    quoted: m,
    buttons: [
      { text: 'Mi harem', id: `${usedPrefix}harem` },
      { text: 'Tienda G', id: `${usedPrefix}tiendag` },
    ],
  })
}

export async function showCharShop(m, conn, usedPrefix = '.') {
  await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } }).catch(() => {})

  const active = listActiveListings()
  const groups = listShopForAlbum(49)
  const caption = buildShopCaption(active, usedPrefix)

  if (!groups.length) {
    await conn.sendMessage(m.chat, {
      text: caption,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
    await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {})
    return
  }

  const album = await renderMarketAlbum(groups, {
    title: 'TIENDA G',
    subtitle: `${active.length} órdenes activas`,
  })

  await sendAlbum(conn, m.chat, {
    image: album,
    caption,
    quoted: m,
    buttons: [
      { text: 'Mi harem', id: `${usedPrefix}harem` },
      { text: 'Tirar w', id: `${usedPrefix}w` },
    ],
  })

  await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {})
}

export async function buyFromCharShop(m, conn, usedPrefix = '.', orderRaw = '') {
  const order = Math.floor(Number(String(orderRaw).replace(/[^\d]/g, '')) || 0)
  if (!order) {
    await conn.sendMessage(m.chat, {
      text: `[❗] Uso: *${usedPrefix}comprarg <orden>*\n> Ejemplo: *${usedPrefix}comprarg 12*\n> Órdenes en *${usedPrefix}tiendag*`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
    return
  }

  const result = buyListing(order, m.sender, conn)
  if (!result.ok) {
    const map = {
      not_found: 'No existe esa orden.',
      sold: 'Esa orden ya está agotada.',
      own: 'No puedes comprar tu propia publicación.',
      no_money: `Te faltan monedas. Precio: *${formatMoney(result.need)}* · Saldo: *${formatMoney(result.have)}*`,
      charge_fail: 'No se pudo cobrar.',
    }
    await conn.sendMessage(m.chat, {
      text: `[❗] ${map[result.reason] || 'No se pudo comprar.'}`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
    return
  }

  const l = result.listing
  const caption = [
    `🛒 *Compra exitosa*`,
    ``,
    `> ・ Orden: *#${l.order}*`,
    `> ・ ${l.name}`,
    `> ・ Pagaste: *${formatMoney(l.price)}*`,
    `> ・ Vendedor: *${l.sellerName}*`,
    `> ・ El dinero fue al dueño`,
    ``,
    `> *${usedPrefix}harem* · *${usedPrefix}tiendag*`,
  ].join('\n')

  await sendCharacterCard(conn, m.chat, {
    character: {
      id: l.charId,
      name: l.name,
      image: l.image,
      rarityLabel: l.rarityLabel,
      price: l.price,
      anime: l.anime,
    },
    caption,
    quoted: m,
    mentionedJid: [m.sender, l.sellerJid].filter(Boolean),
    buttons: [
      { text: 'Mi harem', id: `${usedPrefix}harem` },
      { text: 'Tienda G', id: `${usedPrefix}tiendag` },
    ],
  })

  try {
    await conn.sendMessage(result.sellerJid || l.sellerJid, {
      text: `💰 *Vendiste en Tienda G*\n\n> Orden *#${l.order}* · ${l.name}\n> Recibiste *${formatMoney(l.price)}*\n> Comprador: @${m.sender.split('@')[0]}`,
      mentions: [m.sender],
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    })
  } catch {}
}

export {
  fetchRandomCharacter,
  getOffer,
  formatMoney,
  ROLL_COOLDOWN_MS,
}
