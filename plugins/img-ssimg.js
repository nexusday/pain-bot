import sharp from '../lib/sharp.js'
import fetch from 'node-fetch'
import { webp2png } from '../lib/webp2mp4.js'



const W = 900
const H = 1560
const RADIO = 42
const PORTADA = 700
const PORTADA_X = Math.round((W - PORTADA) / 2)
const PORTADA_Y = 110
const PORTADA_R = 28

function escaparXml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function truncar(text, max) {
  const t = String(text || '').trim()
  if (t.length <= max) return t
  return `${t.slice(0, Math.max(1, max - 1))}…`
}

function parsearMeta(text = '') {
  const crudo = String(text || '').trim()
  if (!crudo) return { title: 'Song Title', artist: 'Artist Name' }

  if (crudo.includes('|')) {
    const [a, ...resto] = crudo.split('|')
    return {
      title: truncar(a.trim() || 'Song Title', 42),
      artist: truncar(resto.join('|').trim() || 'Artist Name', 36)
    }
  }

  return {
    title: truncar(crudo, 42),
    artist: 'Artist Name'
  }
}

function esMedioImagen(mime = '', mtype = '') {
  return /image|webp|sticker/i.test(mime) || /imageMessage|stickerMessage/i.test(mtype)
}

function resolverObjetivoMedio(m) {
  if (m.quoted) {
    const mime = (m.quoted.msg || m.quoted).mimetype || m.quoted.mediaType || ''
    const mtype = m.quoted.mtype || ''
    if (esMedioImagen(mime, mtype) && m.quoted.download) return m.quoted
  }
  const mime = (m.msg || m).mimetype || m.mediaType || ''
  const mtype = m.mtype || ''
  if (esMedioImagen(mime, mtype) && m.download) return m
  return null
}

async function cargarBuferImagen(medio, mime) {
  if (/webp/i.test(mime)) {
    try {
      return await sharp(medio).rotate().toBuffer()
    } catch {
      const url = await webp2png(medio)
      if (!url) throw new Error('No se pudo convertir el sticker')
      const respuesta = await fetch(url)
      return Buffer.from(await respuesta.arrayBuffer())
    }
  }
  if (/image\//i.test(mime)) {
    return sharp(medio).rotate().toBuffer()
  }
  throw new Error('El archivo no es una imagen')
}

function formatearTiempo(seg) {
  const s = Math.max(0, Math.floor(seg))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}


function tiemposFalsos(titulo) {
  let hash = 0
  for (const ch of String(titulo)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  const total = 120 + (hash % 220) // 2:00 – 5:39
  const actual = Math.floor(total * (0.22 + ((hash >> 7) % 50) / 100)) // ~22%–71%
  return { actual, total, progress: actual / total }
}

async function hacerPortadaRedondeada(bufer, tamano, radio) {
  const portada = await sharp(bufer)
    .resize(tamano, tamano, { fit: 'cover', position: 'centre' })
    .png()
    .toBuffer()

  const mascara = Buffer.from(
    `<svg width="${tamano}" height="${tamano}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${tamano}" height="${tamano}" rx="${radio}" ry="${radio}" fill="#fff"/>
    </svg>`
  )

  return sharp(portada)
    .composite([{ input: mascara, blend: 'dest-in' }])
    .png()
    .toBuffer()
}

function construirSvgUi(titulo, artista, actual, total, progreso) {
  const barraX = 90
  const barraW = W - barraX * 2
  const barraY = 980
  const rellenado = Math.max(8, Math.round(barraW * progreso))
  const pulgarX = barraX + rellenado

  const volY = 1280
  const volX = 140
  const volW = W - volX * 2
  const volRellenado = Math.round(volW * 0.62)
  const volPulgar = volX + volRellenado

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
  <rect x="${PORTADA_X}" y="${PORTADA_Y}" width="${PORTADA}" height="${PORTADA}"
    rx="${PORTADA_R}" ry="${PORTADA_R}" fill="#000" opacity="0.2" filter="url(#soft)"/>

  <!-- AirPlay -->
  <g transform="translate(${W - 120}, 860)" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity="0.92">
    <path d="M12 44 L36 20 L60 44"/>
    <path d="M4 52 Q36 20 68 52" opacity="0.55"/>
    <path d="M16 52 Q36 32 56 52" opacity="0.75"/>
    <path d="M28 52 Q36 42 44 52"/>
  </g>

  <!-- título / artista -->
  <text x="90" y="880" font-family="Arial, Helvetica, sans-serif" font-size="44" font-weight="600" fill="#ffffff">${escaparXml(titulo)}</text>
  <text x="90" y="930" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="700" fill="#ffffff">${escaparXml(artista)}</text>

  <!-- progress -->
  <line x1="${barraX}" y1="${barraY}" x2="${barraX + barraW}" y2="${barraY}" stroke="#ffffff" stroke-opacity="0.28" stroke-width="5" stroke-linecap="round"/>
  <line x1="${barraX}" y1="${barraY}" x2="${pulgarX}" y2="${barraY}" stroke="#ffffff" stroke-width="6" stroke-linecap="round"/>
  <circle cx="${pulgarX}" cy="${barraY}" r="11" fill="#ffffff"/>
  <text x="${barraX}" y="${barraY + 38}" font-family="Arial, Helvetica, sans-serif" font-size="22" fill="#cfcfcf">${formatearTiempo(actual)}</text>
  <text x="${barraX + barraW}" y="${barraY + 38}" font-family="Arial, Helvetica, sans-serif" font-size="22" fill="#cfcfcf" text-anchor="end">${formatearTiempo(total)}</text>

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
  <line x1="${volX}" y1="${volY}" x2="${volPulgar}" y2="${volY}" stroke="#ffffff" stroke-width="6" stroke-linecap="round"/>
  <circle cx="${volPulgar}" cy="${volY}" r="11" fill="#ffffff"/>

  <!-- home indicator -->
  <rect x="${W / 2 - 70}" y="${H - 46}" width="140" height="8" rx="4" fill="#ffffff" opacity="0.85"/>
</svg>`)
}

async function construirTarjetaSpotify(buferFoto, titulo, artista) {
  const { actual, total, progreso } = tiemposFalsos(titulo)

  const portada = await hacerPortadaRedondeada(buferFoto, PORTADA, PORTADA_R)

  const difuminado = await sharp(buferFoto)
    .resize(W, H, { fit: 'cover', position: 'centre' })
    .blur(28)
    .modulate({ brightness: 0.55, saturation: 1.05 })
    .png()
    .toBuffer()

  const dim = Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" rx="${RADIO}" ry="${RADIO}" fill="#000" opacity="0.45"/>
    </svg>`
  )

  const ui = construirSvgUi(titulo, artista, actual, total, progreso)

 
  const mascaraTarjeta = Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" rx="${RADIO}" ry="${RADIO}" fill="#fff"/>
    </svg>`
  )

  return sharp(difuminado)
    .composite([
      { input: dim, top: 0, left: 0 },
      { input: portada, top: PORTADA_Y, left: PORTADA_X },
      { input: ui, top: 0, left: 0 },
      { input: mascaraTarjeta, blend: 'dest-in' }
    ])
    .png()
    .toBuffer()
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
  try {
    const objetivo = resolverObjetivoMedio(m)
    if (!objetivo) {
      return conn.reply(
        m.chat,
        `*[❗] Responde a una foto* (o envíala con el comando) y escribe el título.*\n\n` +
          `Ejemplos:\n` +
          `> ${usedPrefix + command} Mi canción\n` +
          `> ${usedPrefix + command} Blinding Lights | The Weeknd\n` +
          `> (foto + responder: ${usedPrefix + command} Título | Artista)`,
        m,
        global.rcanal
      )
    }

    const textoLeyenda = text || m.msg?.caption || m.text || ''
   
    const limpiado = String(textoLeyenda)
      .replace(new RegExp(`^\\s*${usedPrefix}?${command}\\s*`, 'i'), '')
      .trim()

    const { titulo, artista } = parsearMeta(limpiado)
    const mime = (objetivo.msg || objetivo).mimetype || objetivo.mediaType || ''
    const medio = await objetivo.download()
    const foto = await cargarBuferImagen(medio, mime)

    await conn.sendMessage(m.chat, { react: { text: '🎧', key: m.key } }).catch(() => {})

    const tarjeta = await construirTarjetaSpotify(foto, titulo, artista)

    await conn.sendFile(m.chat, tarjeta, 'spotify.png', '', m, null, global.rcanal)
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

export default handler

export { construirTarjetaSpotify as buildSpotifyCard }
