import sharp from './sharp.js'

const WIDTH = 720
const HEIGHT = 980
const CELL = 176
const GAP = 14
const GRID_X = 76
const GRID_Y = 300
const AVATAR_SIZE = 62

function escapeXml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function getPlayerDisplayName(jid) {
  const user = global.db?.data?.users?.[jid]
  const raw = user?.name || jid?.split('@')[0] || 'Jugador'
  return String(raw).replace(/[<>&"']/g, '').trim().slice(0, 18) || 'Jugador'
}

export function getWinningCells(board) {
  const patterns = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ]
  for (const pattern of patterns) {
    const [a, b, c] = pattern
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return pattern
  }
  return null
}

function defaultAvatarSvg(letter, color = '#4c3d6e') {
  const safe = escapeXml(String(letter || '?').slice(0, 1).toUpperCase())
  return `<svg width="${AVATAR_SIZE}" height="${AVATAR_SIZE}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="av" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${color}"/>
      <stop offset="100%" stop-color="#1a1528"/>
    </linearGradient>
  </defs>
  <circle cx="${AVATAR_SIZE / 2}" cy="${AVATAR_SIZE / 2}" r="${AVATAR_SIZE / 2}" fill="url(#av)"/>
  <text x="50%" y="54%" font-family="Arial, sans-serif" font-size="28" font-weight="700"
    fill="#f3ecff" text-anchor="middle" dominant-baseline="middle">${safe}</text>
</svg>`
}

async function downloadImageUrl(conn, url) {
  if (!url) return null
  try {
    const file = await conn.getFile(url)
    if (file?.data?.length > 512) return file.data
  } catch {}
  try {
    const data = await sharp(url).rotate().png().toBuffer()
    if (data?.length > 512) return data
  } catch {}
  return null
}

async function fetchProfileBuffer(conn, jid, name) {
  if (!conn || !jid) {
    return sharp(Buffer.from(defaultAvatarSvg(name))).png().toBuffer()
  }
  try {
    let url = await conn.profilePictureUrl(jid, 'image').catch(() => null)
    if (!url) url = await conn.profilePictureUrl(jid, 'preview').catch(() => null)
    const data = await downloadImageUrl(conn, url)
    if (data) return data
  } catch {}
  return sharp(Buffer.from(defaultAvatarSvg(name))).png().toBuffer()
}

async function buildCircleAvatar(buffer, size, borderColor, borderW = 3) {
  const inner = await sharp(buffer)
    .resize(size, size, { fit: 'cover' })
    .png()
    .toBuffer()

  const mask = Buffer.from(
    `<svg width="${size}" height="${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/>
    </svg>`
  )

  const circled = await sharp(inner)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer()

  const total = size + borderW * 2
  const ring = Buffer.from(
    `<svg width="${total}" height="${total}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${total / 2}" cy="${total / 2}" r="${size / 2 + borderW / 2 - 0.5}"
        fill="none" stroke="${borderColor}" stroke-width="${borderW}"/>
    </svg>`
  )

  return sharp({
    create: {
      width: total,
      height: total,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: circled, left: borderW, top: borderW },
      { input: ring, left: 0, top: 0 },
    ])
    .png()
    .toBuffer()
}

function cellXY(index) {
  const row = Math.floor(index / 3)
  const col = index % 3
  return {
    x: GRID_X + col * (CELL + GAP),
    y: GRID_Y + row * (CELL + GAP),
  }
}

function iconTrophy(cx, cy, scale = 1) {
  return `
    <g transform="translate(${cx}, ${cy}) scale(${scale})" filter="url(#iconGlow)">
      <path d="M-11 -10 h22 v5 c0 9 -5 14 -11 14s-11 -5 -11 -14v-5z" fill="url(#gold)" stroke="#f59e0b" stroke-width="1.2"/>
      <path d="M-11 -8 h-7 c0 7 2.5 11 7 13" fill="none" stroke="#fde68a" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M11 -8 h7 c0 7 -2.5 11 -7 13" fill="none" stroke="#fde68a" stroke-width="2.2" stroke-linecap="round"/>
      <rect x="-5" y="9" width="10" height="5" rx="1.5" fill="#fbbf24"/>
      <rect x="-9" y="14" width="18" height="5" rx="2.5" fill="#f59e0b"/>
    </g>`
}

function iconCrown(cx, cy, scale = 1) {
  return `
    <g transform="translate(${cx}, ${cy}) scale(${scale})" filter="url(#iconGlow)">
      <path d="M-15 6 L-11 -7 L-5 1 L0 -9 L5 1 L11 -7 L15 6 Z" fill="url(#gold)" stroke="#f59e0b" stroke-width="1.2" stroke-linejoin="round"/>
      <rect x="-15" y="6" width="30" height="7" rx="2" fill="#fbbf24" stroke="#f59e0b" stroke-width="1"/>
      <circle cx="-11" cy="-2" r="2" fill="#fde68a"/>
      <circle cx="0" cy="-4" r="2" fill="#fde68a"/>
      <circle cx="11" cy="-2" r="2" fill="#fde68a"/>
    </g>`
}

function iconDraw(cx, cy, scale = 1) {
  return `
    <g transform="translate(${cx}, ${cy}) scale(${scale})" filter="url(#iconGlow)">
      <circle cx="-16" cy="0" r="11" fill="none" stroke="#5eead4" stroke-width="3"/>
      <circle cx="16" cy="0" r="11" fill="none" stroke="#ff6b8a" stroke-width="3"/>
      <line x1="-21" y1="-6" x2="-11" y2="6" stroke="#ff6b8a" stroke-width="2.8" stroke-linecap="round"/>
      <line x1="-11" y1="-6" x2="-21" y2="6" stroke="#ff6b8a" stroke-width="2.8" stroke-linecap="round"/>
      <rect x="-3" y="-14" width="6" height="28" rx="3" fill="url(#gold)" opacity="0.95"/>
      <rect x="-14" y="-3" width="28" height="6" rx="3" fill="url(#gold)" opacity="0.95"/>
    </g>`
}

function iconTimeout(cx, cy, scale = 1) {
  return `
    <g transform="translate(${cx}, ${cy}) scale(${scale})">
      <circle cx="0" cy="0" r="14" fill="none" stroke="#fca5a5" stroke-width="2.5"/>
      <line x1="0" y1="0" x2="0" y2="-8" stroke="#fca5a5" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="0" y1="0" x2="6" y2="4" stroke="#fca5a5" stroke-width="2.5" stroke-linecap="round"/>
    </g>`
}

function iconGameLogo(cx, cy) {
  return `
    <g transform="translate(${cx}, ${cy})" opacity="0.9">
      <rect x="-18" y="-18" width="36" height="36" rx="10" fill="none" stroke="url(#title)" stroke-width="2"/>
      <line x1="-8" y1="-8" x2="8" y2="8" stroke="#ff6b8a" stroke-width="3" stroke-linecap="round"/>
      <line x1="8" y1="-8" x2="-8" y2="8" stroke="#ff6b8a" stroke-width="3" stroke-linecap="round"/>
      <circle cx="0" cy="0" r="9" fill="none" stroke="#5eead4" stroke-width="3"/>
    </g>`
}

function ambientDecorations(status) {
  const stars = []
  const colors = {
    playing: ['#c084fc', '#f472b6'],
    win: ['#86efac', '#fcd34d', '#fbbf24'],
    draw: ['#fcd34d', '#c084fc'],
    timeout: ['#fca5a5', '#fb7185'],
  }
  const palette = colors[status] || colors.playing
  const points = [
    [58, 64], [642, 88], [120, 248], [610, 220], [48, 520], [668, 560],
    [90, 760], [630, 780], [360, 44], [200, 900], [520, 920],
    [180, 140], [500, 130], [700, 340], [30, 400],
  ]
  for (let i = 0; i < points.length; i++) {
    const [x, y] = points[i]
    const c = palette[i % palette.length]
    stars.push(`<circle cx="${x}" cy="${y}" r="${status === 'win' ? 3 : 2.5}" fill="${c}" opacity="0.4"/>`)
    if (status === 'win' || status === 'draw') {
      stars.push(`<rect x="${x + 8}" y="${y - 6}" width="5" height="10" rx="1" fill="${palette[(i + 1) % palette.length]}" opacity="0.35" transform="rotate(${20 + i * 11} ${x + 10} ${y})"/>`)
    }
  }
  return stars.join('\n')
}

function renderCell(index, value, number, highlight) {
  const { x, y } = cellXY(index)
  const cx = x + CELL / 2
  const cy = y + CELL / 2
  const fill = highlight ? '#35265a' : '#17122a'
  const stroke = highlight ? '#e879f9' : '#3f335f'
  const glow = highlight ? 'filter="url(#cellGlow)"' : ''

  let content = ''
  if (value === 'X') {
    content = `
      <line x1="${x + 40}" y1="${y + 40}" x2="${x + CELL - 40}" y2="${y + CELL - 40}" stroke="#ff6b8a" stroke-width="13" stroke-linecap="round" filter="url(#markGlow)"/>
      <line x1="${x + CELL - 40}" y1="${y + 40}" x2="${x + 40}" y2="${y + CELL - 40}" stroke="#ff6b8a" stroke-width="13" stroke-linecap="round" filter="url(#markGlow)"/>`
  } else if (value === 'O') {
    content = `<circle cx="${cx}" cy="${cy}" r="54" fill="none" stroke="#5eead4" stroke-width="12" filter="url(#markGlow)"/>`
  } else {
    content = `<text x="${cx}" y="${cy + 16}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="50" font-weight="700" fill="#5f5380">${number}</text>`
  }

  return `
    <rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="20" fill="${fill}" stroke="${stroke}" stroke-width="${highlight ? 3 : 2}" ${glow}/>
    ${content}`
}

function playerCard(x, symbol, name, active, color, champion = false) {
  const bg = champion ? '#3b2460' : active ? '#2a1f45' : '#14101f'
  const border = champion ? '#fbbf24' : active ? color : '#2f2644'
  const borderW = champion ? 3.5 : active ? 2.5 : 1.5
  const label = symbol === 'X' ? 'JUGADOR 1' : 'JUGADOR 2'
  const badge = symbol === 'X'
    ? `<text x="${x + 248}" y="182" font-family="Arial, sans-serif" font-size="22" font-weight="800" fill="#ff6b8a">X</text>`
    : `<circle cx="${x + 256}" cy="174" r="12" fill="none" stroke="#5eead4" stroke-width="4"/>`

  const crown = champion ? iconCrown(x + 196, 182, 0.72) : ''

  return `
    <rect x="${x}" y="168" width="288" height="104" rx="20" fill="${bg}" stroke="${border}" stroke-width="${borderW}"/>
    <circle cx="${x + 52}" cy="220" r="34" fill="#221a35" stroke="${color}" stroke-width="2"/>
    ${crown}
    <text x="${x + 100}" y="206" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="600" fill="#9d8ec0" letter-spacing="1">${label}</text>
    <text x="${x + 100}" y="234" font-family="Arial, Helvetica, sans-serif" font-size="21" font-weight="700" fill="#f8f4ff">${escapeXml(name)}</text>
    ${badge}`
}

function resultBanner(status, winnerName = '', subtitle = '') {
  if (status === 'win') {
    return `
      <rect x="56" y="52" width="608" height="96" rx="22" fill="#1f1635" stroke="#fbbf24" stroke-width="2" opacity="0.95"/>
      ${iconTrophy(360, 36, 0.95)}
      <text x="360" y="88" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="800" fill="url(#gold)">GANADOR</text>
      <text x="360" y="124" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="700" fill="#fde68a">${escapeXml(winnerName)}</text>`
  }
  if (status === 'draw') {
    return `
      <rect x="56" y="52" width="608" height="96" rx="22" fill="#1f1635" stroke="#fcd34d" stroke-width="2" opacity="0.95"/>
      ${iconDraw(360, 36, 0.82)}
      <text x="360" y="88" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="800" fill="url(#gold)">EMPATE</text>
      <text x="360" y="124" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="17" fill="#fde68a">${escapeXml(subtitle)}</text>`
  }
  if (status === 'timeout') {
    return `
      <rect x="56" y="52" width="608" height="80" rx="22" fill="#1f1635" stroke="#f87171" stroke-width="2" opacity="0.95"/>
      ${iconTimeout(92, 92, 1)}
      <text x="380" y="100" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="800" fill="#fca5a5">JUEGO CANCELADO</text>`
  }
  return `
    ${iconGameLogo(360, 56)}
    <text x="360" y="98" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="36" font-weight="800" fill="url(#title)">3 EN RAYA</text>
    <text x="360" y="126" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="14" fill="#8b7faa" letter-spacing="2">PAIN-BOT · MICHI</text>`
}

export function buildMichiBoardSvg(game, options = {}) {
  const {
    status = 'playing',
    statusText = '',
    highlightCells = null,
    winnerJid = null,
  } = options

  const board = game.board || Array(9).fill(null)
  const highlightSet = new Set(highlightCells || [])
  const p1NameStr = getPlayerDisplayName(game.player1)
  const p2NameStr = getPlayerDisplayName(game.player2)
  const turnIsP1 = game.currentPlayer === game.player1
  const p1Champion = status === 'win' && winnerJid === game.player1
  const p2Champion = status === 'win' && winnerJid === game.player2
  const p1Active = status === 'playing' && turnIsP1
  const p2Active = status === 'playing' && !turnIsP1

  const footer = statusText || (
    status === 'win' ? `Victoria de ${p1Champion ? p1NameStr : p2NameStr}` :
    status === 'draw' ? 'Nadie ganó — empate' :
    status === 'timeout' ? 'Partida cancelada por inactividad' :
    turnIsP1 ? `Turno de ${p1NameStr} (X)` : `Turno de ${p2NameStr} (O)`
  )

  const cells = board.map((cell, i) => renderCell(i, cell, i + 1, highlightSet.has(i))).join('\n')
  const statusColor = {
    win: '#86efac',
    draw: '#fcd34d',
    timeout: '#fca5a5',
    playing: '#c4b5fd',
  }[status] || '#c4b5fd'

  const winnerName = p1Champion ? p1NameStr : p2NameStr

  return `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#090612"/>
      <stop offset="45%" stop-color="#130f22"/>
      <stop offset="100%" stop-color="#1c1434"/>
    </linearGradient>
    <linearGradient id="title" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#c084fc"/>
      <stop offset="50%" stop-color="#f472b6"/>
      <stop offset="100%" stop-color="#5eead4"/>
    </linearGradient>
    <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#fcd34d"/>
      <stop offset="100%" stop-color="#f59e0b"/>
    </linearGradient>
    <radialGradient id="boardGlow" cx="50%" cy="45%" r="55%">
      <stop offset="0%" stop-color="#7c3aed" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#7c3aed" stop-opacity="0"/>
    </radialGradient>
    <filter id="cellGlow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="5" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="markGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="2.5" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="iconGlow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="2" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <rect width="100%" height="100%" fill="url(#bg)"/>
  <ellipse cx="360" cy="480" rx="300" ry="260" fill="url(#boardGlow)"/>
  ${ambientDecorations(status)}

  <rect x="24" y="24" width="${WIDTH - 48}" height="${HEIGHT - 48}" rx="30" fill="none" stroke="#4c3d72" stroke-width="2"/>
  <rect x="30" y="30" width="${WIDTH - 60}" height="${HEIGHT - 60}" rx="26" fill="none" stroke="#2a2044" stroke-width="1"/>

  ${resultBanner(status, winnerName, `${p1NameStr}  ·  ${p2NameStr}`)}

  ${playerCard(56, 'X', p1NameStr, p1Active, '#ff6b8a', p1Champion)}
  ${playerCard(376, 'O', p2NameStr, p2Active, '#5eead4', p2Champion)}

  ${cells}

  <rect x="48" y="890" width="${WIDTH - 96}" height="54" rx="16" fill="#120e1e" stroke="#3b2f5c" stroke-width="1.5"/>
  <text x="${WIDTH / 2}" y="923" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="17" font-weight="700" fill="${statusColor}">${escapeXml(footer)}</text>
</svg>`
}

async function svgToPng(svg) {
  try {
    const { Resvg } = await import('@resvg/resvg-js')
    const resvg = new Resvg(svg, {
      fitTo: { mode: 'width', value: WIDTH },
      font: { loadSystemFonts: true },
    })
    return Buffer.from(resvg.render().asPng())
  } catch {
    return sharp(Buffer.from(svg)).png().toBuffer()
  }
}

async function loadPlayerAvatars(conn, game) {
  const p1Name = getPlayerDisplayName(game.player1)
  const p2Name = getPlayerDisplayName(game.player2)
  const [p1Raw, p2Raw] = await Promise.all([
    fetchProfileBuffer(conn, game.player1, p1Name),
    fetchProfileBuffer(conn, game.player2, p2Name),
  ])
  const [p1, p2] = await Promise.all([
    buildCircleAvatar(p1Raw, AVATAR_SIZE, '#ff6b8a', 3),
    buildCircleAvatar(p2Raw, AVATAR_SIZE, '#5eead4', 3),
  ])
  return { p1, p2, p1Left: 56 + 52 - (AVATAR_SIZE / 2 + 3), p1Top: 220 - (AVATAR_SIZE / 2 + 3), p2Left: 376 + 52 - (AVATAR_SIZE / 2 + 3), p2Top: 220 - (AVATAR_SIZE / 2 + 3) }
}

export async function renderMichiBoardPng(game, conn, options = {}) {
  const svg = buildMichiBoardSvg(game, options)
  let base = await svgToPng(svg)

  if (!conn) return base

  try {
    const av = await loadPlayerAvatars(conn, game)
    const composites = [
      { input: av.p1, left: Math.round(av.p1Left), top: Math.round(av.p1Top) },
      { input: av.p2, left: Math.round(av.p2Left), top: Math.round(av.p2Top) },
    ]

    if (options.status === 'win' && options.winnerJid) {
      const winnerName = getPlayerDisplayName(options.winnerJid)
      const heroRaw = await fetchProfileBuffer(conn, options.winnerJid, winnerName)
      const hero = await buildCircleAvatar(heroRaw, 76, '#fbbf24', 4)
      composites.unshift({ input: hero, left: 72, top: 64 })
    }

    base = await sharp(base).composite(composites).png().toBuffer()
  } catch (e) {
    console.error('[michi-board] avatar composite:', e?.message || e)
  }

  return base
}

export async function sendMichiBoard(conn, chat, game, {
  quoted = null,
  caption = '',
  mentionedJid = [],
  status = 'playing',
  statusText = '',
  highlightCells = null,
  winnerJid = null,
} = {}) {
  const png = await renderMichiBoardPng(game, conn, {
    status,
    statusText,
    highlightCells,
    winnerJid,
  })
  const mentions = Array.isArray(mentionedJid) ? mentionedJid.filter(Boolean) : []

  return conn.sendFile(
    chat,
    png,
    'michi-board.png',
    caption,
    quoted,
    false,
    {
      contextInfo: {
        ...(global.rcanal?.contextInfo || {}),
        ...(mentions.length ? { mentionedJid: mentions } : {}),
      },
    }
  )
}

const INVITE_HEIGHT = 880
const INVITE_AVATAR = 96

function svgBaseDefs() {
  return `
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#090612"/>
      <stop offset="45%" stop-color="#130f22"/>
      <stop offset="100%" stop-color="#1c1434"/>
    </linearGradient>
    <linearGradient id="title" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#c084fc"/>
      <stop offset="50%" stop-color="#f472b6"/>
      <stop offset="100%" stop-color="#5eead4"/>
    </linearGradient>
    <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#fcd34d"/>
      <stop offset="100%" stop-color="#f59e0b"/>
    </linearGradient>
    <radialGradient id="centerGlow" cx="50%" cy="42%" r="50%">
      <stop offset="0%" stop-color="#7c3aed" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#7c3aed" stop-opacity="0"/>
    </radialGradient>
    <filter id="iconGlow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="2" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>`
}

function iconCheck(cx, cy, scale = 1) {
  return `
    <g transform="translate(${cx}, ${cy}) scale(${scale})">
      <circle cx="0" cy="0" r="14" fill="#163d2a" stroke="#86efac" stroke-width="2"/>
      <path d="M-6 0 L-2 5 L7 -6" fill="none" stroke="#86efac" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
    </g>`
}

function iconReject(cx, cy, scale = 1) {
  return `
    <g transform="translate(${cx}, ${cy}) scale(${scale})">
      <circle cx="0" cy="0" r="14" fill="#3d1620" stroke="#fb7185" stroke-width="2"/>
      <line x1="-5" y1="-5" x2="5" y2="5" stroke="#fb7185" stroke-width="2.8" stroke-linecap="round"/>
      <line x1="5" y1="-5" x2="-5" y2="5" stroke="#fb7185" stroke-width="2.8" stroke-linecap="round"/>
    </g>`
}

function iconCoin(cx, cy) {
  return `
    <g transform="translate(${cx}, ${cy})">
      <circle cx="0" cy="0" r="11" fill="none" stroke="#fbbf24" stroke-width="2"/>
      <text x="0" y="4" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" font-weight="700" fill="#fcd34d">$</text>
    </g>`
}

function inviteInfoRow(y, label, value, color = '#c4b5fd') {
  return `
    <rect x="72" y="${y}" width="576" height="48" rx="14" fill="#14101f" stroke="#2f2644" stroke-width="1.5"/>
    <text x="104" y="${y + 30}" font-family="Arial, Helvetica, sans-serif" font-size="15" font-weight="600" fill="#9d8ec0">${escapeXml(label)}</text>
    <text x="648" y="${y + 30}" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="700" fill="${color}">${escapeXml(value)}</text>`
}

function invitePlayerSlot(cx, cy, symbol, name, role) {
  const color = symbol === 'X' ? '#ff6b8a' : '#5eead4'
  const x = cx - 128
  const mark = symbol === 'X'
    ? `<line x1="${cx - 14}" y1="${cy - 58}" x2="${cx + 14}" y2="${cy - 30}" stroke="${color}" stroke-width="4" stroke-linecap="round"/>
       <line x1="${cx + 14}" y1="${cy - 58}" x2="${cx - 14}" y2="${cy - 30}" stroke="${color}" stroke-width="4" stroke-linecap="round"/>`
    : `<circle cx="${cx}" cy="${cy - 44}" r="14" fill="none" stroke="${color}" stroke-width="4"/>`

  return `
    <rect x="${x}" y="${cy - 108}" width="256" height="216" rx="24" fill="#1a1528" stroke="${color}" stroke-width="2.5"/>
    <circle cx="${cx}" cy="${cy}" r="54" fill="#221a35" stroke="${color}" stroke-width="2.5"/>
    ${mark}
    <text x="${cx}" y="${cy + 84}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="19" font-weight="700" fill="#f8f4ff">${escapeXml(name)}</text>
    <text x="${cx}" y="${cy + 106}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="12" font-weight="600" fill="#9d8ec0" letter-spacing="1">${escapeXml(role)}</text>`
}

export function buildMichiInviteSvg({ challengerName, opponentName, moneda = 'USD' }) {
  const deco = ambientDecorations('playing')
  return `<svg width="${WIDTH}" height="${INVITE_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>${svgBaseDefs()}</defs>

  <rect width="100%" height="100%" fill="url(#bg)"/>
  <ellipse cx="360" cy="360" rx="290" ry="240" fill="url(#centerGlow)"/>
  ${deco}

  <rect x="24" y="24" width="${WIDTH - 48}" height="${INVITE_HEIGHT - 48}" rx="30" fill="none" stroke="#4c3d72" stroke-width="2"/>
  <rect x="30" y="30" width="${WIDTH - 60}" height="${INVITE_HEIGHT - 60}" rx="26" fill="none" stroke="#2a2044" stroke-width="1"/>

  ${iconGameLogo(360, 62)}
  <text x="360" y="108" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="32" font-weight="800" fill="url(#title)">INVITACION</text>
  <text x="360" y="136" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="14" fill="#8b7faa" letter-spacing="2">3 EN RAYA · PAIN-BOT</text>

  <rect x="56" y="156" width="608" height="52" rx="16" fill="#1f1635" stroke="#c084fc" stroke-width="1.5"/>
  <text x="360" y="188" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="600" fill="#ddd6fe">Un jugador te reta a una partida</text>

  ${invitePlayerSlot(180, 340, 'X', challengerName, 'RETADOR')}
  ${invitePlayerSlot(540, 340, 'O', opponentName, 'INVITADO')}

  <circle cx="360" cy="340" r="38" fill="#221a35" stroke="url(#title)" stroke-width="2.5"/>
  <text x="360" y="348" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="800" fill="url(#title)">VS</text>

  ${iconCoin(92, 598)}
  ${inviteInfoRow(580, 'Premio al ganar', `450-700 ${moneda}`, '#86efac')}
  ${inviteInfoRow(636, 'Empate', `150 ${moneda} c/u`, '#fcd34d')}
  ${inviteInfoRow(692, 'Inactividad', `150 ${moneda} penalizacion`, '#fca5a5')}

  <rect x="72" y="756" width="260" height="58" rx="16" fill="#13261c" stroke="#86efac" stroke-width="2"/>
  ${iconCheck(104, 785, 1.1)}
  <text x="200" y="792" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="17" font-weight="700" fill="#86efac">SI — ACEPTAR</text>

  <rect x="388" y="756" width="260" height="58" rx="16" fill="#2a1218" stroke="#fb7185" stroke-width="2"/>
  ${iconReject(420, 785, 1.1)}
  <text x="518" y="792" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="17" font-weight="700" fill="#fb7185">NO — RECHAZAR</text>

  <rect x="72" y="828" width="576" height="36" rx="12" fill="#120e1e" stroke="#3b2f5c" stroke-width="1.5"/>
  ${iconTimeout(96, 846, 0.85)}
  <text x="380" y="851" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="14" font-weight="700" fill="#c4b5fd">Responde en 20 segundos</text>
</svg>`
}

async function svgToInvitePng(svg) {
  try {
    const { Resvg } = await import('@resvg/resvg-js')
    const resvg = new Resvg(svg, {
      fitTo: { mode: 'width', value: WIDTH },
      font: { loadSystemFonts: true },
    })
    return Buffer.from(resvg.render().asPng())
  } catch {
    return sharp(Buffer.from(svg)).png().toBuffer()
  }
}

export async function renderMichiInvitePng(conn, challengerJid, opponentJid) {
  const challengerName = getPlayerDisplayName(challengerJid)
  const opponentName = getPlayerDisplayName(opponentJid)
  const moneda = global.moneda || 'USD'
  const svg = buildMichiInviteSvg({ challengerName, opponentName, moneda })
  let base = await svgToInvitePng(svg)

  if (!conn) return base

  try {
    const [cRaw, oRaw] = await Promise.all([
      fetchProfileBuffer(conn, challengerJid, challengerName),
      fetchProfileBuffer(conn, opponentJid, opponentName),
    ])
    const [cAv, oAv] = await Promise.all([
      buildCircleAvatar(cRaw, INVITE_AVATAR, '#ff6b8a', 4),
      buildCircleAvatar(oRaw, INVITE_AVATAR, '#5eead4', 4),
    ])
    const half = INVITE_AVATAR / 2 + 4
    base = await sharp(base).composite([
      { input: cAv, left: Math.round(180 - half), top: Math.round(340 - half) },
      { input: oAv, left: Math.round(540 - half), top: Math.round(340 - half) },
    ]).png().toBuffer()
  } catch (e) {
    console.error('[michi-board] invite avatar:', e?.message || e)
  }

  return base
}

export async function sendMichiInvite(conn, chat, {
  challenger,
  opponent,
  quoted = null,
  caption = '',
  mentionedJid = [],
} = {}) {
  const png = await renderMichiInvitePng(conn, challenger, opponent)
  const mentions = Array.isArray(mentionedJid) ? mentionedJid.filter(Boolean) : []

  return conn.sendFile(
    chat,
    png,
    'michi-invite.png',
    caption,
    quoted,
    false,
    {
      contextInfo: {
        ...(global.rcanal?.contextInfo || {}),
        ...(mentions.length ? { mentionedJid: mentions } : {}),
      },
    }
  )
}
