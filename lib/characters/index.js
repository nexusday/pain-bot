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
  getTopHarem,
  giftCharacterFromSlot,
} from './collection.js'
import { formatMoney, formatCombatBar } from './rarity.js'
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
  sameJid,
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
    `> ・ HP: *${character.hp || character.maxHp || '?'}* / *${character.maxHp || '?'}*`,
    `> ・ Poder: *${character.power || '?'}*`,
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
    const ownedStacks = (user.characters || []).map(c => ({
      id: c.id,
      qty: c.qty || 1,
    }))
    const character = await fetchRandomCharacter({ ownedStacks })
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

export async function showTopHarem(m, conn, usedPrefix = '.', limitRaw = '') {
  const limit = Math.floor(Number(String(limitRaw).replace(/[^\d]/g, '')) || 10)
  const top = getTopHarem(limit)

  if (!top.length) {
    await conn.sendMessage(m.chat, {
      text: `🎴 *TOP HAREM*\n\n> Aún no hay colecciones.\n> Empieza con *${usedPrefix}w* y *${usedPrefix}claim*`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
    return
  }

  const mentions = []
  const blocks = top.map((row, i) => {
    const pos = i + 1
    const tag = `@${String(row.jid).split('@')[0]}`
    mentions.push(row.jid)
    return [
      `*#${pos}* ${tag}`,
      `> 𓂃 ࣪ ִֶָ☾.  ${row.name}`,
      `> 𓂃 ࣪ ִֶָ☾.  Tipos: *${row.types}* · Unidades: *${row.units}*`,
      `> 𓂃 ࣪ ִֶָ☾.  Valor: *${formatMoney(row.value)}*`,
    ].join('\n')
  })

  const caption = [
    `🎴 *TOP HAREM*`,
    `> Ordenado por valor total del catálogo`,
    `> Top *${top.length}*`,
    ``,
    ...blocks,
    ``,
    `> Tu colección: *${usedPrefix}harem*`,
  ].join('\n')

  await conn.sendMessage(m.chat, {
    text: caption,
    mentions,
    contextInfo: { ...(global.rcanal?.contextInfo || {}) },
  }, { quoted: m })
}

export async function viewHaremCharacter(m, conn, usedPrefix = '.', slotRaw = '') {
  const { user } = getUserForChars(m.sender, conn)
  syncSellerListings(user, m.sender)

  if (!user.characters.length) {
    await conn.sendMessage(m.chat, {
      text: `🎴 *Tu harem está vacío*\n\n> Tira con *${usedPrefix}w* y compra con *${usedPrefix}claim*`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
    return
  }

  const idx = findCharacterIndex(user, slotRaw)
  if (idx < 0) {
    await conn.sendMessage(m.chat, {
      text: `[❗] Uso: *${usedPrefix}vharem <n°>*\n> Ejemplo: *${usedPrefix}vharem 1*\n> Revisa el orden en *${usedPrefix}harem*`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
    return
  }

  const slots = getHaremSlots(user)
  const c = slots[idx]
  const free = Math.max(0, (c.qty || 1) - (c.listed || 0))
  const bar = formatCombatBar(c.hp || c.maxHp, c.maxHp, 12)
  const listedNote = (c.listed || 0) > 0
    ? `\n> 𓂃 ࣪ ִֶָ☾.  En venta: *${c.listed}* · Libres: *${free}*`
    : ''

  const caption = [
    `🎴 *FICHA HAREM*`,
    ``,
    `*#${c.slot}* ${c.name}`,
    `> 𓂃 ࣪ ִֶָ☾.  Anime: *${c.anime}*`,
    `> 𓂃 ࣪ ִֶָ☾.  Rareza: *${c.rarityLabel}*`,
    `> 𓂃 ࣪ ִֶָ☾.  Costo: *${formatMoney(c.price)}*`,
    `> 𓂃 ࣪ ִֶָ☾.  Unidades: *x${c.qty}*`,
    listedNote,
    ``,
    `> 𓂃 ࣪ ִֶָ☾.  HP: *${c.hp || c.maxHp}* / *${c.maxHp}*`,
    `> 𓂃 ࣪ ִֶָ☾.  [${bar}]`,
    `> 𓂃 ࣪ ִֶָ☾.  Poder: *${c.power}*`,
    `> 𓂃 ࣪ ִֶָ☾.  ID: \`${c.id}\``,
    ``,
    `> Dar: *${usedPrefix}darhr @user ${c.slot}*`,
    `> Vender: *${usedPrefix}vender ${c.slot} <precio>*`,
  ].filter(Boolean).join('\n')

  await sendCharacterCard(conn, m.chat, {
    character: c,
    caption,
    quoted: m,
    buttons: [
      { text: 'Mi harem', id: `${usedPrefix}harem` },
      { text: 'Tirar w', id: `${usedPrefix}w` },
    ],
  })
}

export async function giftHaremCharacter(m, conn, usedPrefix = '.', args = []) {
  const { user: fromUser } = getUserForChars(m.sender, conn)
  syncSellerListings(fromUser, m.sender)

  const parsed = parseGiftTargetAndSlot(m, args)
  const targetJid = parsed.targetJid
  const slotNum = parsed.slot

  if (!targetJid || !slotNum) {
    await conn.sendMessage(m.chat, {
      text: `[❗] Uso: *${usedPrefix}darhr @usuario <n°>*\n> Ejemplo: *${usedPrefix}darhr @user 1*\n> El número es el orden de *${usedPrefix}harem* (ej. #1, #2…)`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
    return
  }

  if (sameJid(targetJid, m.sender)) {
    await conn.sendMessage(m.chat, {
      text: `[❗] No puedes regalarte un personaje a ti mismo.`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
    return
  }

  const idx = slotNum - 1
  if (idx < 0 || idx >= fromUser.characters.length) {
    await conn.sendMessage(m.chat, {
      text: `[❗] No tienes el slot *#${slotNum}* en tu harem.\n> Tienes *${fromUser.characters.length}* tipo(s). Revisa *${usedPrefix}harem*`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
    return
  }

  const stack = fromUser.characters[idx]
  const free = availableQty(stack)
  if (free < 1) {
    const listed = Number(stack.listed) || 0
    const orders = listActiveBySeller(m.sender)
      .filter(l => String(l.charId) === String(stack.id))
      .map(l => l.order)
    const orderTxt = orders.length
      ? `\n> Órdenes activas: *${orders.map(o => `#${o}`).join(', ')}*\n> Cancela con *${usedPrefix}cancelarg ${orders[0]}*`
      : `\n> Cancela la venta con *${usedPrefix}cancelarg <orden>*`

    await conn.sendMessage(m.chat, {
      text: [
        `[❗] *${stack.name}* (slot *#${slotNum}*) está *EN VENTA*.`,
        `> Unidades: *x${stack.qty}* · En venta: *${listed}* · Libres: *0*`,
        `> No puedes regalarlo mientras esté publicado.${orderTxt}`,
      ].join('\n'),
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
    return
  }

  const { user: toUser } = getUserForChars(targetJid, conn)
  const result = giftCharacterFromSlot(fromUser, toUser, idx)

  if (!result.ok) {
    if (result.reason === 'listed') {
      await conn.sendMessage(m.chat, {
        text: `[❗] *${result.name}* está en venta.\n> Cancela primero con *${usedPrefix}cancelarg <orden>* o usa otra copia libre.`,
        contextInfo: { ...(global.rcanal?.contextInfo || {}) },
      }, { quoted: m })
      return
    }
    await conn.sendMessage(m.chat, {
      text: `[❗] No se pudo regalar ese personaje.`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
    return
  }

  const c = result.character
  const caption = [
    `🎁 *Personaje regalado*`,
    ``,
    `> 𓂃 ࣪ ִֶָ☾.  ${c.name}`,
    `> 𓂃 ࣪ ִֶָ☾.  Slot: *#${slotNum}*`,
    `> 𓂃 ࣪ ִֶָ☾.  De: @${m.sender.split('@')[0]}`,
    `> 𓂃 ࣪ ִֶָ☾.  Para: @${String(targetJid).split('@')[0]}`,
    `> 𓂃 ࣪ ִֶָ☾.  Rareza: *${c.rarityLabel}*`,
    `> 𓂃 ࣪ ִֶָ☾.  HP: *${c.maxHp}* · Poder: *${c.power}*`,
    `> 𓂃 ࣪ ִֶָ☾.  Valor: *${formatMoney(c.price)}*`,
  ].join('\n')

  await sendCharacterCard(conn, m.chat, {
    character: c,
    caption,
    quoted: m,
    mentionedJid: [m.sender, targetJid],
    buttons: [
      { text: 'Mi harem', id: `${usedPrefix}harem` },
    ],
  })

  try {
    await conn.sendMessage(targetJid, {
      text: `🎁 *Te regalaron un personaje*\n\n> 𓂃 ࣪ ִֶָ☾.  ${c.name}\n> 𓂃 ࣪ ִֶָ☾.  De: @${m.sender.split('@')[0]}\n> 𓂃 ࣪ ִֶָ☾.  HP *${c.maxHp}* · Poder *${c.power}*\n> Mira tu harem con *${usedPrefix}harem*`,
      mentions: [m.sender],
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    })
  } catch {}
}

/**
 * Separa @usuario del número de slot.
 * Bug previo: el teléfono del mention se tomaba como slot.
 */
function parseGiftTargetAndSlot(m, args = []) {
  const ctxMentions = m.message?.extendedTextMessage?.contextInfo?.mentionedJid
    || m.msg?.contextInfo?.mentionedJid
    || []
  const mentioned = [...(m.mentionedJid || []), ...ctxMentions].filter(Boolean)
  const targetJid = mentioned[0] || null

  const mentionDigits = new Set(
    mentioned.map(j => String(j).split('@')[0].split(':')[0].replace(/\D/g, '')).filter(d => d.length >= 6)
  )

  const rawArgs = (args || []).map(a => String(a || '').trim()).filter(Boolean)

  // Quita tokens que son el @mention (el número largo del usuario)
  const withoutMentions = rawArgs.filter(a => {
    if (a.startsWith('@')) {
      const d = a.replace(/[^\d]/g, '')
      if (mentionDigits.has(d) || d.length >= 8) return false
    }
    const onlyDigits = a.replace(/[^\d]/g, '')
    if (onlyDigits.length >= 8 && mentionDigits.has(onlyDigits)) return false
    if (onlyDigits.length >= 10 && !mentionDigits.size) {
      // número tipo teléfono sin mention parseado: no es slot de harem
      return false
    }
    return true
  })

  let slot = null
  for (const a of withoutMentions) {
    const d = a.replace(/[^\d]/g, '')
    if (/^\d{1,3}$/.test(d)) {
      const n = parseInt(d, 10)
      if (n >= 1 && n <= 500) {
        slot = n
        break
      }
    }
  }

  // Fallback: último número corto del texto completo
  if (!slot && m.text) {
    const matches = String(m.text).match(/(?:^|\s)(\d{1,3})(?=\s|$)/g) || []
    for (let i = matches.length - 1; i >= 0; i--) {
      const n = parseInt(String(matches[i]).trim(), 10)
      if (n >= 1 && n <= 500) {
        slot = n
        break
      }
    }
  }

  return { targetJid, slot }
}

export {
  fetchRandomCharacter,
  getOffer,
  formatMoney,
  ROLL_COOLDOWN_MS,
}
