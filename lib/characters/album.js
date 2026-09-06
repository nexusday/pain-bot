import sharp from 'sharp'
import { downloadCharacterImage } from './catalog.js'
import { formatMoney } from './rarity.js'

function gridCols(count) {
  if (count <= 1) return 1
  if (count <= 4) return 2
  if (count <= 9) return 3
  if (count <= 16) return 4
  if (count <= 25) return 5
  if (count <= 36) return 6
  return 7
}

function escapeXml(text = '') {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function shortName(name = '', max = 16) {
  const s = String(name || '').trim()
  if (s.length <= max) return s
  return `${s.slice(0, max - 1)}…`
}

async function loadThumb(character, size) {
  try {
    let buf
    if (character.imageBuffer && Buffer.isBuffer(character.imageBuffer)) buf = character.imageBuffer
    else buf = await downloadCharacterImage(character)
    return sharp(buf)
      .rotate()
      .resize(size, size, { fit: 'cover', position: 'centre' })
      .png()
      .toBuffer()
  } catch {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
      <rect width="100%" height="100%" fill="#1c1c1c"/>
      <text x="50%" y="50%" fill="#888" font-size="${Math.max(14, Math.floor(size / 8))}" text-anchor="middle" dominant-baseline="middle">?</text>
    </svg>`
    return sharp(Buffer.from(svg)).png().toBuffer()
  }
}

async function renderAlbumGrid(items, opts = {}) {
  const list = Array.isArray(items) ? items.slice(0, 49) : []
  const n = list.length
  if (!n) throw new Error('Álbum vacío')

  const canvasW = 1080
  const headerH = 118
  const pad = 16
  const gap = 12
  const cols = gridCols(n)
  const rows = Math.ceil(n / cols)
  const cell = Math.floor((canvasW - pad * 2 - gap * (cols - 1)) / cols)
  const labelH = Math.max(64, Math.floor(cell * 0.42))
  const tileH = cell + labelH
  const canvasH = headerH + pad + rows * tileH + gap * (rows - 1) + pad
  const fontMain = Math.max(11, Math.floor(cell / 12))
  const fontSub = Math.max(10, Math.floor(cell / 14))

  const title = escapeXml(opts.title || 'ALBUM')
  const subtitle = escapeXml(opts.subtitle || `${n} items`)

  const headerSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${headerH}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#121212"/>
        <stop offset="100%" stop-color="#2a2218"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#bg)"/>
    <text x="36" y="50" fill="#f3e9d7" font-size="34" font-family="Segoe UI, Arial" font-weight="700">${title}</text>
    <text x="36" y="86" fill="#c9b79a" font-size="18" font-family="Segoe UI, Arial">${subtitle}</text>
  </svg>`

  let base = await sharp({
    create: {
      width: canvasW,
      height: canvasH,
      channels: 3,
      background: { r: 16, g: 16, b: 16 },
    },
  })
    .png()
    .toBuffer()

  const composites = [
    { input: await sharp(Buffer.from(headerSvg)).png().toBuffer(), top: 0, left: 0 },
  ]

  for (let i = 0; i < n; i++) {
    const item = list[i]
    const col = i % cols
    const row = Math.floor(i / cols)
    const left = pad + col * (cell + gap)
    const top = headerH + pad + row * (tileH + gap)

    const thumb = await loadThumb(item, cell)
    const qty = Math.max(1, Number(item.qty) || 1)
    const listed = Math.max(0, Number(item.listed) || 0)
    const sold = item.status === 'sold'
    const fullyListed = item.status === 'listed' || (listed > 0 && listed >= qty)
    const badgeW = Math.max(42, Math.floor(cell * 0.3))
    const badgeH = Math.max(26, Math.floor(cell * 0.15))
    const badge = qty > 1
      ? `<rect x="${cell - badgeW - 8}" y="8" width="${badgeW}" height="${badgeH}" rx="8" fill="#c45c26"/>
         <text x="${cell - badgeW / 2 - 8}" y="${8 + badgeH * 0.7}" fill="#fff" font-size="${Math.max(12, Math.floor(cell / 11))}" text-anchor="middle" font-family="Segoe UI, Arial" font-weight="700">x${qty}</text>`
      : ''

    const line1 = escapeXml(item.line1 || `#${item.slot || i + 1}`)
    const line2 = escapeXml(item.line2 || '')
    const line3 = escapeXml(item.line3 || '')
    const y1 = cell + Math.floor(labelH * 0.28)
    const y2 = cell + Math.floor(labelH * 0.55)
    const y3 = cell + Math.floor(labelH * 0.82)

    const frameSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cell}" height="${tileH}">
      <rect width="${cell}" height="${cell}" rx="12" ry="12" fill="#111"/>
      <rect y="${cell}" width="${cell}" height="${labelH}" fill="#171717"/>
      <text x="10" y="${y1}" fill="#f0e6d6" font-size="${fontMain}" font-family="Segoe UI, Arial" font-weight="700">${line1}</text>
      <text x="10" y="${y2}" fill="#d2c3a8" font-size="${fontSub}" font-family="Segoe UI, Arial">${line2}</text>
      <text x="10" y="${y3}" fill="#a99478" font-size="${fontSub}" font-family="Segoe UI, Arial">${line3}</text>
    </svg>`

    const overlays = []
    if (sold) {
      overlays.push(`<rect width="${cell}" height="${cell}" fill="rgba(0,0,0,0.55)"/>
        <text x="50%" y="50%" fill="#ffb4b4" font-size="${Math.max(16, Math.floor(cell / 8))}" text-anchor="middle" dominant-baseline="middle" font-family="Segoe UI, Arial" font-weight="700">AGOTADO</text>`)
    } else if (fullyListed) {
      overlays.push(`<rect width="${cell}" height="${cell}" fill="rgba(40,28,8,0.55)"/>
        <text x="50%" y="50%" fill="#ffd28a" font-size="${Math.max(14, Math.floor(cell / 9))}" text-anchor="middle" dominant-baseline="middle" font-family="Segoe UI, Arial" font-weight="700">EN VENTA</text>`)
    } else if (listed > 0) {
      overlays.push(`<rect x="8" y="8" width="${Math.max(70, Math.floor(cell * 0.42))}" height="${badgeH}" rx="8" fill="#8a5a12"/>
        <text x="${8 + Math.max(70, Math.floor(cell * 0.42)) / 2}" y="${8 + badgeH * 0.7}" fill="#ffe6b0" font-size="${Math.max(10, Math.floor(cell / 13))}" text-anchor="middle" font-family="Segoe UI, Arial" font-weight="700">${listed} venta</text>`)
    }
    if (badge) overlays.push(badge)

    let tile = await sharp(Buffer.from(frameSvg))
      .composite([{ input: thumb, top: 0, left: 0 }])
      .png()
      .toBuffer()

    if (overlays.length) {
      const topSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cell}" height="${cell}">${overlays.join('\n')}</svg>`
      tile = await sharp(tile)
        .composite([{ input: await sharp(Buffer.from(topSvg)).png().toBuffer(), top: 0, left: 0 }])
        .png()
        .toBuffer()
    }

    composites.push({ input: tile, top, left })
  }

  return sharp(base).composite(composites).png().toBuffer()
}

export async function renderHaremAlbum(characters = [], opts = {}) {
  const slots = characters.map((c, i) => {
    const qty = c.qty || 1
    const listed = Number(c.listed) || 0
    const available = Math.max(0, qty - listed)
    const saleNote = listed > 0
      ? (available <= 0 ? 'EN VENTA' : `${listed} en venta`)
      : ''
    return {
      ...c,
      slot: c.slot || i + 1,
      qty,
      listed,
      status: available <= 0 && listed > 0 ? 'listed' : c.status,
      line1: `#${c.slot || i + 1}  ·  ${shortName(c.name, 14)}`,
      line2: [c.rarityLabel || '', saleNote].filter(Boolean).join(' · '),
      line3: formatMoney(c.price),
    }
  })

  const units = slots.reduce((s, c) => s + (c.qty || 1), 0)
  return renderAlbumGrid(slots, {
    title: opts.title || 'HAREM',
    subtitle: opts.subtitle || `${slots.length} tipos · ${units} unidades`,
  })
}

export async function renderMarketAlbum(groups = [], opts = {}) {
  const items = groups.map((g, i) => {
    const sellers = [...new Set(g.sellers || [])].slice(0, 3)
    const sellerText = sellers.join(', ') + ((g.sellers || []).length > 3 ? '…' : '')
    const priceText =
      g.priceMin === g.priceMax
        ? formatMoney(g.priceMin)
        : `${formatMoney(g.priceMin)} ~ ${formatMoney(g.priceMax)}`
    const orderText = (g.orders || [g.order]).slice(0, 3).map(n => `#${n}`).join(' ')
    return {
      ...g,
      qty: g.qty || 1,
      line1: g.status === 'sold' ? `AGOTADO · ${shortName(g.name, 12)}` : `${orderText} · ${shortName(g.name, 12)}`,
      line2: shortName(sellerText || 'Usuario', 22),
      line3: priceText,
      status: g.status,
    }
  })

  return renderAlbumGrid(items, {
    title: opts.title || 'TIENDA G',
    subtitle: opts.subtitle || `${items.filter(x => x.status === 'active').length} en venta`,
  })
}

export function buildHaremCaption(slots, totalValue, usedPrefix = '.') {
  const units = slots.reduce((s, c) => s + (c.qty || 1), 0)
  const listedTotal = slots.reduce((s, c) => s + (Number(c.listed) || 0), 0)
  const blocks = slots.slice(0, 24).map(c => {
    const qty = c.qty || 1
    const listed = Number(c.listed) || 0
    const free = Math.max(0, qty - listed)
    const qtyTxt = qty > 1 ? ` x${qty}` : ''
    let state = ''
    if (listed > 0 && free <= 0) state = ' · 🏷 *EN VENTA*'
    else if (listed > 0) state = ` · 🏷 ${listed} en venta · libres ${free}`
    return [
      `*#${c.slot}* ${c.name}${qtyTxt}${state}`,
      `   ${c.rarityLabel} · ${formatMoney(c.price)} · ID \`${c.id}\``,
    ].join('\n')
  })
  const more = slots.length > 24 ? `\n> … +${slots.length - 24} tipos más` : ''

  return [
    `🎴 *TU HAREM*`,
    `> Tipos: *${slots.length}* · Unidades: *${units}*${listedTotal ? ` · En venta: *${listedTotal}*` : ''}`,
    `> Valor catálogo: *${formatMoney(totalValue)}*`,
    ``,
    ...blocks,
    more,
    ``,
    `> Publicar: *${usedPrefix}vender <n°> <precio>*`,
    `> Cancelar: *${usedPrefix}cancelarg <orden>*`,
    `> Tienda: *${usedPrefix}tiendag*`,
  ].filter(Boolean).join('\n')
}

export function buildShopCaption(activeListings = [], usedPrefix = '.') {
  if (!activeListings.length) {
    return `🏪 *TIENDA G*\n\n> No hay personajes en venta.\n> Publica con *${usedPrefix}vender <n°> <precio>*`
  }

  const byChar = new Map()
  for (const l of activeListings) {
    const key = String(l.charId)
    if (!byChar.has(key)) {
      byChar.set(key, { name: l.name, items: [] })
    }
    byChar.get(key).items.push(l)
  }

  const blocks = []
  for (const g of byChar.values()) {
    const items = g.items.sort((a, b) => a.order - b.order)
    const qty = items.length
    const title = qty > 1 ? `*${g.name}* x${qty}` : `*${g.name}*`
    const rows = items.map(l =>
      `   Orden *${l.order}* · ${l.sellerName} · ${formatMoney(l.price)}`
    )
    blocks.push([title, ...rows].join('\n'))
    if (blocks.length >= 12) break
  }
  const more = activeListings.length > 30 ? `\n> … más órdenes en la foto` : ''

  return [
    `🏪 *TIENDA G*`,
    `> Órdenes activas: *${activeListings.length}*`,
    `> Compra: *${usedPrefix}comprarg <orden>*`,
    `> Cancelar tu orden: *${usedPrefix}cancelarg <orden>*`,
    `> Si hay iguales, el *menor orden* se vende primero`,
    ``,
    ...blocks,
    more,
  ].filter(Boolean).join('\n')
}
