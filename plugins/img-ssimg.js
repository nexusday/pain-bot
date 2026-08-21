import sharp from '../lib/sharp.js'
import fetch from 'node-fetch'
import { webp2png } from '../lib/webp2mp4.js'



const W = 900
const H = 1560
const RADIUS = 42
const COVER = 700
const COVER_X = Math.round((W - COVER) / 2)
const COVER_Y = 110
const COVER_R = 28

function escapeXml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function truncate(text, max) {
  const t = String(text || '').trim()
  if (t.length <= max) return t
  return `${t.slice(0, Math.max(1, max - 1))}…`
}

function parseMeta(text = '') {
  const raw = String(text || '').trim()
  if (!raw) return { title: 'Song Title', artist: 'Artist Name' }

  if (raw.includes('|')) {
    const [a, ...rest] = raw.split('|')
    return {
      title: truncate(a.trim() || 'Song Title', 42),
      artist: truncate(rest.join('|').trim() || 'Artist Name', 36)
    }
  }

  return {
    title: truncate(raw, 42),
    artist: 'Artist Name'
  }
}

function isImageMedia(mime = '', mtype = '') {
  return /image|webp|sticker/i.test(mime) || /imageMessage|stickerMessage/i.test(mtype)
}

function resolveMediaTarget(m) {
  if (m.quoted) {
    const mime = (m.quoted.msg || m.quoted).mimetype || m.quoted.mediaType || ''
    const mtype = m.quoted.mtype || ''
    if (isImageMedia(mime, mtype) && m.quoted.download) return m.quoted
  }
  const mime = (m.msg || m).mimetype || m.mediaType || ''
  const mtype = m.mtype || ''
  if (isImageMedia(mime, mtype) && m.download) return m
  return null
}

async function loadImageBuffer(media, mime) {
  if (/webp/i.test(mime)) {
    try {
      return await sharp(media).rotate().toBuffer()
    } catch {
      const url = await webp2png(media)
      if (!url) throw new Error('No se pudo convertir el sticker')
      const res = await fetch(url)
      return Buffer.from(await res.arrayBuffer())
    }
  }
  if (/image\//i.test(mime)) {
    return sharp(media).rotate().toBuffer()
  }
  throw new Error('El archivo no es una imagen')
}

function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}


function fakeTimes(title) {
  let hash = 0
  for (const ch of String(title)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  const total = 120 + (hash % 220) // 2:00 – 5:39
  const current = Math.floor(total * (0.22 + ((hash >> 7) % 50) / 100)) // ~22%–71%
  return { current, total, progress: current / total }
}

async function makeRoundedCover(buffer, size, radius) {
  const cover = await sharp(buffer)
    .resize(size, size, { fit: 'cover', position: 'centre' })
    .png()
    .toBuffer()

  const mask = Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="#fff"/>
    </svg>`
  )

  return sharp(cover)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer()
}

function buildUiSvg(title, artist, current, total, progress) {
  const barX = 90
  const barW = W - barX * 2
  const barY = 980
  const filled = Math.max(8, Math.round(barW * progress))
  const thumbX = barX + filled

  const volY = 1280
  const volX = 140
  const volW = W - volX * 2
  const volFilled = Math.round(volW * 0.62)
  const volThumb = volX + volFilled

  const ctrlY = 1120
  const cx = W / 2

  return Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="48%" stop-color="#000000" stop-opacity="0.15"/>
      <stop offset="72%" stop-color="#050508" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#050508" stop-opacity="0.88"/>
    </linearGradient>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="10" stdDeviation="18" flood-color="#000" flood-opacity="0.45"/>
    </filter>
  </defs>

  <!-- velo inferior (no tapa el cover) -->
  <rect width="${W}" height="${H}" fill="url(#shade)"/>

  <!-- sombra del cover -->
  <rect x="${COVER_X}" y="${COVER_Y}" width="${COVER}" height="${COVER}"
    rx="${COVER_R}" ry="${COVER_R}" fill="#000" opacity="0.2" filter="url(#soft)"/>

  <!-- AirPlay -->
  <g transform="translate(${W - 120}, 860)" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity="0.92">
    <path d="M12 44 L36 20 L60 44"/>
    <path d="M4 52 Q36 20 68 52" opacity="0.55"/>
    <path d="M16 52 Q36 32 56 52" opacity="0.75"/>
    <path d="M28 52 Q36 42 44 52"/>
  </g>

  <!-- título / artista -->
  <text x="90" y="880" font-family="Arial, Helvetica, sans-serif" font-size="44" font-weight="600" fill="#ffffff">${escapeXml(title)}</text>
  <text x="90" y="930" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="700" fill="#ffffff">${escapeXml(artist)}</text>

  <!-- progress -->
  <line x1="${barX}" y1="${barY}" x2="${barX + barW}" y2="${barY}" stroke="#ffffff" stroke-opacity="0.28" stroke-width="5" stroke-linecap="round"/>
  <line x1="${barX}" y1="${barY}" x2="${thumbX}" y2="${barY}" stroke="#ffffff" stroke-width="6" stroke-linecap="round"/>
  <circle cx="${thumbX}" cy="${barY}" r="11" fill="#ffffff"/>
  <text x="${barX}" y="${barY + 38}" font-family="Arial, Helvetica, sans-serif" font-size="22" fill="#cfcfcf">${formatTime(current)}</text>
  <text x="${barX + barW}" y="${barY + 38}" font-family="Arial, Helvetica, sans-serif" font-size="22" fill="#cfcfcf" text-anchor="end">${formatTime(total)}</text>

  <!-- controles -->
  <g fill="#ffffff">
    <!-- prev -->
    <g transform="translate(${cx - 170}, ${ctrlY})">
      <polygon points="28,8 28,52 0,30"/>
      <polygon points="56,8 56,52 28,30"/>
    </g>
    <!-- pause -->
    <g transform="translate(${cx - 28}, ${ctrlY})">
      <rect x="0" y="4" width="16" height="52" rx="3"/>
      <rect x="28" y="4" width="16" height="52" rx="3"/>
    </g>
    <!-- next -->
    <g transform="translate(${cx + 90}, ${ctrlY})">
      <polygon points="0,8 0,52 28,30"/>
      <polygon points="28,8 28,52 56,30"/>
    </g>
  </g>

  <!-- volume -->
  <g fill="#ffffff" opacity="0.95">
    <g transform="translate(${volX - 56}, ${volY - 18}) scale(0.9)">
      <path d="M8 14 H18 L30 6 V34 L18 26 H8 Z"/>
    </g>
    <g transform="translate(${volX + volW + 18}, ${volY - 18}) scale(0.9)">
      <path d="M8 14 H18 L30 6 V34 L18 26 H8 Z"/>
      <path d="M34 12 Q42 20 34 28" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
      <path d="M40 8 Q52 20 40 32" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
    </g>
  </g>
  <line x1="${volX}" y1="${volY}" x2="${volX + volW}" y2="${volY}" stroke="#ffffff" stroke-opacity="0.28" stroke-width="5" stroke-linecap="round"/>
  <line x1="${volX}" y1="${volY}" x2="${volThumb}" y2="${volY}" stroke="#ffffff" stroke-width="6" stroke-linecap="round"/>
  <circle cx="${volThumb}" cy="${volY}" r="11" fill="#ffffff"/>

  <!-- home indicator -->
  <rect x="${W / 2 - 70}" y="${H - 46}" width="140" height="8" rx="4" fill="#ffffff" opacity="0.85"/>
</svg>`)
}

async function buildSpotifyCard(photoBuffer, title, artist) {
  const { current, total, progress } = fakeTimes(title)

  const cover = await makeRoundedCover(photoBuffer, COVER, COVER_R)

  const blurred = await sharp(photoBuffer)
    .resize(W, H, { fit: 'cover', position: 'centre' })
    .blur(28)
    .modulate({ brightness: 0.55, saturation: 1.05 })
    .png()
    .toBuffer()

  const dim = Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" rx="${RADIUS}" ry="${RADIUS}" fill="#000" opacity="0.45"/>
    </svg>`
  )

  const ui = buildUiSvg(title, artist, current, total, progress)

 
  const cardMask = Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" rx="${RADIUS}" ry="${RADIUS}" fill="#fff"/>
    </svg>`
  )

  return sharp(blurred)
    .composite([
      { input: dim, top: 0, left: 0 },
      { input: cover, top: COVER_Y, left: COVER_X },
      { input: ui, top: 0, left: 0 },
      { input: cardMask, blend: 'dest-in' }
    ])
    .png()
    .toBuffer()
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
  try {
    const target = resolveMediaTarget(m)
    if (!target) {
      return conn.reply(
        m.chat,
        `*[❗] Responde a una *foto* (o envíala con el comando) y escribe el título.*\n\n` +
          `Ejemplos:\n` +
          `> ${usedPrefix + command} Mi canción\n` +
          `> ${usedPrefix + command} Blinding Lights | The Weeknd\n` +
          `> (foto + responder: ${usedPrefix + command} Título | Artista)`,
        m,
        global.rcanal
      )
    }

    const captionText = text || m.msg?.caption || m.text || ''
   
    const cleaned = String(captionText)
      .replace(new RegExp(`^\\s*${usedPrefix}?${command}\\s*`, 'i'), '')
      .trim()

    const { title, artist } = parseMeta(cleaned)
    const mime = (target.msg || target).mimetype || target.mediaType || ''
    const media = await target.download()
    const photo = await loadImageBuffer(media, mime)

    await conn.sendMessage(m.chat, { react: { text: '🎧', key: m.key } }).catch(() => {})

    const card = await buildSpotifyCard(photo, title, artist)

    await conn.sendFile(m.chat, card, 'spotify.png', '', m, null, global.rcanal)
  } catch (e) {
    console.error('[ssimg]', e)
    return conn.reply(
      m.chat,
      `*[❌] Error al crear la tarjeta Spotify.*\n> ${e?.message || e}`,
      m,
      global.rcanal
    )
  }
}

handler.help = ['#ssimg • #spotimg + {foto + título|artista} → tarjeta Spotify vertical']
handler.tags = ['tools', 'img']
handler.command = ['ssimg', 'spotimg', 'spotifyimg', 'nowplaying', 'img']

export { buildSpotifyCard }
export default handler
