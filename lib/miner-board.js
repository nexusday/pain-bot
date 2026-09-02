import sharp from './sharp.js'
import { getDisplayName } from './michi-users.js'

const WIDTH = 720
const INVITE_H = 900
const BOARD_H = 980
const COLS = 5
const ROWS = 2
const CELL = 112
const GAP = 14
const GRID_X = 58
const GRID_Y = 330
const AVATAR = 58
const INVITE_AVATAR = 92

function escapeXml(t) {
  return String(t || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function cleanName(raw) {
  return String(raw || '').replace(/[<>&"']/g, '').trim().slice(0, 18) || 'Jugador'
}

export function getMinerPlayerName(jid, conn, participants = null) {
  return cleanName(getDisplayName(jid, conn, participants))
}

function defaultAvatarSvg(letter, color = '#78350f', size = AVATAR) {
  const safe = escapeXml(String(letter || '?').slice(0, 1).toUpperCase())
  return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="av" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="${color}"/><stop offset="100%" stop-color="#1c1410"/>
  </linearGradient></defs>
  <circle cx="${size/2}" cy="${size/2}" r="${size/2}" fill="url(#av)"/>
  <text x="50%" y="54%" font-family="Arial,sans-serif" font-size="${Math.round(size*0.42)}" font-weight="700"
    fill="#fef3c7" text-anchor="middle" dominant-baseline="middle">${safe}</text>
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

async function fetchProfileBuffer(conn, jid, name, size = AVATAR) {
  if (!conn || !jid) return sharp(Buffer.from(defaultAvatarSvg(name, '#78350f', size))).png().toBuffer()
  try {
    let url = await conn.profilePictureUrl(jid, 'image').catch(() => null)
    if (!url) url = await conn.profilePictureUrl(jid, 'preview').catch(() => null)
    const data = await downloadImageUrl(conn, url)
    if (data) return data
  } catch {}
  return sharp(Buffer.from(defaultAvatarSvg(name, '#78350f', size))).png().toBuffer()
}

async function buildCircleAvatar(buffer, size, borderColor, borderW = 3) {
  const inner = await sharp(buffer).resize(size, size, { fit: 'cover' }).png().toBuffer()
  const mask = Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size/2}" cy="${size/2}" r="${size/2}" fill="white"/></svg>`)
  const circled = await sharp(inner).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer()
  const total = size + borderW * 2
  const ring = Buffer.from(`<svg width="${total}" height="${total}" xmlns="http://www.w3.org/2000/svg">
    <circle cx="${total/2}" cy="${total/2}" r="${size/2+borderW/2-0.5}" fill="none" stroke="${borderColor}" stroke-width="${borderW}"/>
  </svg>`)
  return sharp({ create: { width: total, height: total, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: circled, left: borderW, top: borderW }, { input: ring, left: 0, top: 0 }])
    .png().toBuffer()
}

function svgDefs() {
  return `
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0c0a08"/><stop offset="50%" stop-color="#1a1208"/><stop offset="100%" stop-color="#241a0c"/>
    </linearGradient>
    <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#fcd34d"/><stop offset="100%" stop-color="#d97706"/>
    </linearGradient>
    <linearGradient id="amber" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#fbbf24"/><stop offset="100%" stop-color="#b45309"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="40%" r="55%">
      <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.2"/><stop offset="100%" stop-color="#f59e0b" stop-opacity="0"/>
    </radialGradient>
    <filter id="glowF"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`
}

function iconPickaxe(cx, cy, sc = 1) {
  return `<g transform="translate(${cx},${cy}) scale(${sc})" filter="url(#glowF)">
    <rect x="-3" y="-16" width="6" height="22" rx="2" fill="#d97706" transform="rotate(-35)"/>
    <path d="M-14 -6 L-6 -14 L6 -6 L-2 2 Z" fill="url(#gold)" stroke="#b45309" stroke-width="1"/>
  </g>`
}

function iconGem(cx, cy, sc = 1) {
  return `<g transform="translate(${cx},${cy}) scale(${sc})" filter="url(#glowF)">
    <path d="M0 -14 L12 0 L0 14 L-12 0 Z" fill="#86efac" stroke="#22c55e" stroke-width="1.5"/>
    <path d="M0 -14 L0 14 M-12 0 L12 0" stroke="#bbf7d0" stroke-width="1" opacity="0.5"/>
  </g>`
}

function iconMine(cx, cy, sc = 1) {
  return `<g transform="translate(${cx},${cy}) scale(${sc})" filter="url(#glowF)">
    <circle cx="0" cy="0" r="12" fill="#450a0a" stroke="#fb7185" stroke-width="2"/>
    <line x1="0" y1="-16" x2="0" y2="-8" stroke="#fb7185" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="11" y1="-11" x2="6" y2="-6" stroke="#fb7185" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="-11" y1="-11" x2="-6" y2="-6" stroke="#fb7185" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="14" y1="0" x2="8" y2="0" stroke="#fb7185" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="-14" y1="0" x2="-8" y2="0" stroke="#fb7185" stroke-width="2.5" stroke-linecap="round"/>
  </g>`
}

function iconCheck(cx, cy) {
  return `<g transform="translate(${cx},${cy})"><circle cx="0" cy="0" r="14" fill="#13261c" stroke="#86efac" stroke-width="2"/>
    <path d="M-6 0 L-2 5 L7 -6" fill="none" stroke="#86efac" stroke-width="2.8" stroke-linecap="round"/></g>`
}

function iconReject(cx, cy) {
  return `<g transform="translate(${cx},${cy})"><circle cx="0" cy="0" r="14" fill="#2a1218" stroke="#fb7185" stroke-width="2"/>
    <line x1="-5" y1="-5" x2="5" y2="5" stroke="#fb7185" stroke-width="2.8" stroke-linecap="round"/>
    <line x1="5" y1="-5" x2="-5" y2="5" stroke="#fb7185" stroke-width="2.8" stroke-linecap="round"/></g>`
}

function iconClock(cx, cy) {
  return `<g transform="translate(${cx},${cy})"><circle cx="0" cy="0" r="12" fill="none" stroke="#fbbf24" stroke-width="2"/>
    <line x1="0" y1="0" x2="0" y2="-7" stroke="#fbbf24" stroke-width="2" stroke-linecap="round"/>
    <line x1="0" y1="0" x2="5" y2="3" stroke="#fbbf24" stroke-width="2" stroke-linecap="round"/></g>`
}

function iconTrophy(cx, cy, sc = 1) {
  return `<g transform="translate(${cx},${cy}) scale(${sc})" filter="url(#glowF)">
    <path d="M-11 -10 h22 v5 c0 9 -5 14 -11 14s-11 -5 -11 -14v-5z" fill="url(#gold)" stroke="#b45309" stroke-width="1.2"/>
    <rect x="-5" y="9" width="10" height="5" rx="1.5" fill="#fbbf24"/>
    <rect x="-9" y="14" width="18" height="5" rx="2.5" fill="#d97706"/>
  </g>`
}

function cellXY(index) {
  const row = Math.floor(index / COLS)
  const col = index % COLS
  return { x: GRID_X + col * (CELL + GAP), y: GRID_Y + row * (CELL + GAP) }
}

function renderMinerCell(index, cell, highlight) {
  const { x, y } = cellXY(index)
  const cx = x + CELL / 2
  const cy = y + CELL / 2
  const num = index + 1

  if (!cell?.opened) {
    const stroke = highlight ? '#fbbf24' : '#5c4a2a'
    const fill = highlight ? '#2a2010' : '#1a140c'
    return `
      <rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="16" fill="${fill}" stroke="${stroke}" stroke-width="${highlight ? 3 : 2}"/>
      <text x="${cx}" y="${cy + 8}" text-anchor="middle" font-family="Arial,sans-serif" font-size="34" font-weight="800" fill="#a68a5b">${num}</text>`
  }

  const gain = cell.result?.type === 'gain' || cell.result?.type === 'big'
  const stroke = gain ? '#86efac' : '#fb7185'
  const fill = gain ? '#142818' : '#2a1010'
  const icon = gain ? iconGem(cx, cy, 0.85) : iconMine(cx, cy, 0.85)
  const amt = cell.result?.amount || 0
  const sign = gain ? '+' : '-'
  const amtColor = gain ? '#86efac' : '#fca5a5'

  return `
    <rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="16" fill="${fill}" stroke="${stroke}" stroke-width="2.5" ${highlight ? 'filter="url(#glowF)"' : ''}/>
    ${icon}
    <text x="${cx}" y="${y + CELL - 10}" text-anchor="middle" font-family="Arial,sans-serif" font-size="11" font-weight="700" fill="${amtColor}">${sign}${amt}</text>`
}

function playerPanel(x, name, score, active, color, champion = false) {
  const bg = champion ? '#3b2a10' : active ? '#2a1f10' : '#14100a'
  const border = champion ? '#fbbf24' : active ? color : '#3d3018'
  const scoreTxt = score >= 0 ? `+${score}` : `${score}`
  const scoreColor = score >= 0 ? '#86efac' : '#fca5a5'
  return `
    <rect x="${x}" y="168" width="288" height="104" rx="20" fill="${bg}" stroke="${border}" stroke-width="${active || champion ? 2.5 : 1.5}"/>
    <circle cx="${x + 52}" cy="220" r="34" fill="#221a10" stroke="${color}" stroke-width="2"/>
    <text x="${x + 100}" y="206" font-family="Arial,sans-serif" font-size="12" font-weight="600" fill="#a68a5b" letter-spacing="1">MINERO</text>
    <text x="${x + 100}" y="230" font-family="Arial,sans-serif" font-size="19" font-weight="700" fill="#fef3c7">${escapeXml(name)}</text>
    <text x="${x + 268}" y="206" text-anchor="end" font-family="Arial,sans-serif" font-size="12" fill="#a68a5b">TOTAL</text>
    <text x="${x + 268}" y="230" text-anchor="end" font-family="Arial,sans-serif" font-size="17" font-weight="800" fill="${scoreColor}">${scoreTxt}</text>`
}

function ambientMiner() {
  const pts = [[50, 70], [670, 90], [100, 260], [620, 250], [40, 500], [680, 520], [360, 40]]
  return pts.map(([x, y], i) =>
    `<circle cx="${x}" cy="${y}" r="${2 + (i % 2)}" fill="${i % 2 ? '#fbbf24' : '#d97706'}" opacity="0.35"/>`
  ).join('\n')
}

export function buildMinerBoardSvg(game, options = {}) {
  const {
    status = 'playing',
    statusText = '',
    highlightIndex = null,
    winnerJid = null,
    participants = null,
    conn = null,
  } = options

  const p1 = game.player1
  const p2 = game.player2
  const p1Name = getMinerPlayerName(p1, conn, participants)
  const p2Name = getMinerPlayerName(p2, conn, participants)
  const s1 = game.summary?.[p1]?.gained || 0
  const s2 = game.summary?.[p2]?.gained || 0
  const turnP1 = game.currentPlayer === p1
  const p1Win = status === 'finished' && winnerJid === p1
  const p2Win = status === 'finished' && winnerJid === p2

  const footer = statusText || (
    status === 'finished'
      ? (p1Win ? `Ganador: ${p1Name}` : p2Win ? `Ganador: ${p2Name}` : 'Empate en ganancias')
      : `Turno de ${turnP1 ? p1Name : p2Name}`
  )
  const footerColor = status === 'finished' ? '#fcd34d' : '#fbbf24'

  const cells = (game.cells || []).map((cell, i) => renderMinerCell(i, cell, i === highlightIndex)).join('\n')

  let header = ''
  if (status === 'finished') {
    header = `
      <rect x="56" y="52" width="608" height="88" rx="22" fill="#1f1608" stroke="#fbbf24" stroke-width="2"/>
      ${iconTrophy(360, 34, 0.9)}
      <text x="360" y="88" text-anchor="middle" font-family="Arial,sans-serif" font-size="26" font-weight="800" fill="url(#gold)">MINER FINALIZADO</text>
      <text x="360" y="118" text-anchor="middle" font-family="Arial,sans-serif" font-size="15" fill="#fde68a">${escapeXml(footer)}</text>`
  } else {
    header = `
      ${iconPickaxe(360, 56, 1.1)}
      <text x="360" y="98" text-anchor="middle" font-family="Arial,sans-serif" font-size="34" font-weight="800" fill="url(#gold)">MINER</text>
      <text x="360" y="126" text-anchor="middle" font-family="Arial,sans-serif" font-size="13" fill="#a68a5b" letter-spacing="2">PAIN-BOT · CAJA MINERA</text>`
  }

  return `<svg width="${WIDTH}" height="${BOARD_H}" xmlns="http://www.w3.org/2000/svg">
  <defs>${svgDefs()}</defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <ellipse cx="360" cy="480" rx="300" ry="260" fill="url(#glow)"/>
  ${ambientMiner()}
  <rect x="24" y="24" width="${WIDTH-48}" height="${BOARD_H-48}" rx="30" fill="none" stroke="#5c4a2a" stroke-width="2"/>
  ${header}
  ${playerPanel(56, p1Name, s1, status === 'playing' && turnP1, '#fbbf24', p1Win)}
  ${playerPanel(376, p2Name, s2, status === 'playing' && !turnP1, '#d97706', p2Win)}
  ${cells}
  <rect x="48" y="890" width="${WIDTH-96}" height="54" rx="16" fill="#120e08" stroke="#5c4a2a" stroke-width="1.5"/>
  <text x="360" y="923" text-anchor="middle" font-family="Arial,sans-serif" font-size="16" font-weight="700" fill="${footerColor}">${escapeXml(footer)}</text>
  <text x="360" y="310" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" fill="#a68a5b">Responde con el numero de casilla (1-10)</text>
</svg>`
}

export function buildMinerInviteSvg({ challengerName, opponentName, moneda = 'USD' }) {
  return `<svg width="${WIDTH}" height="${INVITE_H}" xmlns="http://www.w3.org/2000/svg">
  <defs>${svgDefs()}</defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <ellipse cx="360" cy="360" rx="290" ry="240" fill="url(#glow)"/>
  ${ambientMiner()}
  <rect x="24" y="24" width="${WIDTH-48}" height="${INVITE_H-48}" rx="30" fill="none" stroke="#5c4a2a" stroke-width="2"/>

  ${iconPickaxe(360, 62, 1.2)}
  <text x="360" y="108" text-anchor="middle" font-family="Arial,sans-serif" font-size="30" font-weight="800" fill="url(#gold)">INVITACION MINER</text>
  <text x="360" y="136" text-anchor="middle" font-family="Arial,sans-serif" font-size="13" fill="#a68a5b" letter-spacing="2">PAIN-BOT · CAJA MINERA</text>

  <rect x="56" y="156" width="608" height="48" rx="16" fill="#1f1608" stroke="#d97706" stroke-width="1.5"/>
  <text x="360" y="186" text-anchor="middle" font-family="Arial,sans-serif" font-size="15" font-weight="600" fill="#fde68a">Te retan a abrir casillas mineras</text>

  <rect x="56" y="220" width="256" height="210" rx="24" fill="#1a140c" stroke="#fbbf24" stroke-width="2.5"/>
  <circle cx="184" cy="310" r="54" fill="#221a10" stroke="#fbbf24" stroke-width="2"/>
  <text x="184" y="390" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" font-weight="700" fill="#fef3c7">${escapeXml(challengerName)}</text>
  <text x="184" y="412" text-anchor="middle" font-family="Arial,sans-serif" font-size="11" fill="#a68a5b">RETADOR</text>

  <rect x="408" y="220" width="256" height="210" rx="24" fill="#1a140c" stroke="#d97706" stroke-width="2.5"/>
  <circle cx="536" cy="310" r="54" fill="#221a10" stroke="#d97706" stroke-width="2"/>
  <text x="536" y="390" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" font-weight="700" fill="#fef3c7">${escapeXml(opponentName)}</text>
  <text x="536" y="412" text-anchor="middle" font-family="Arial,sans-serif" font-size="11" fill="#a68a5b">INVITADO</text>

  <circle cx="360" cy="325" r="36" fill="#221a10" stroke="url(#gold)" stroke-width="2.5"/>
  <text x="360" y="333" text-anchor="middle" font-family="Arial,sans-serif" font-size="22" font-weight="800" fill="url(#gold)">VS</text>

  <rect x="72" y="460" width="576" height="44" rx="12" fill="#14100a" stroke="#3d3018" stroke-width="1.5"/>
  <text x="104" y="488" font-family="Arial,sans-serif" font-size="14" fill="#a68a5b">Minimo para jugar</text>
  <text x="648" y="488" text-anchor="end" font-family="Arial,sans-serif" font-size="15" font-weight="700" fill="#fbbf24">450 ${escapeXml(moneda)}</text>

  <rect x="72" y="514" width="576" height="44" rx="12" fill="#14100a" stroke="#3d3018" stroke-width="1.5"/>
  <text x="104" y="542" font-family="Arial,sans-serif" font-size="14" fill="#a68a5b">Ganancia por casilla</text>
  <text x="648" y="542" text-anchor="end" font-family="Arial,sans-serif" font-size="15" font-weight="700" fill="#86efac">+100 a +500</text>

  <rect x="72" y="568" width="576" height="44" rx="12" fill="#14100a" stroke="#3d3018" stroke-width="1.5"/>
  <text x="104" y="596" font-family="Arial,sans-serif" font-size="14" fill="#a68a5b">Perdida por mina</text>
  <text x="648" y="596" text-anchor="end" font-family="Arial,sans-serif" font-size="15" font-weight="700" fill="#fca5a5">-50 a -150</text>

  <rect x="72" y="636" width="260" height="56" rx="16" fill="#13261c" stroke="#86efac" stroke-width="2"/>
  ${iconCheck(104, 664)}
  <text x="200" y="670" text-anchor="middle" font-family="Arial,sans-serif" font-size="16" font-weight="700" fill="#86efac">SI — ACEPTAR</text>

  <rect x="388" y="636" width="260" height="56" rx="16" fill="#2a1218" stroke="#fb7185" stroke-width="2"/>
  ${iconReject(420, 664)}
  <text x="518" y="670" text-anchor="middle" font-family="Arial,sans-serif" font-size="16" font-weight="700" fill="#fb7185">NO — RECHAZAR</text>

  <rect x="72" y="712" width="576" height="36" rx="12" fill="#120e08" stroke="#5c4a2a" stroke-width="1.5"/>
  ${iconClock(96, 730)}
  <text x="380" y="735" text-anchor="middle" font-family="Arial,sans-serif" font-size="14" font-weight="700" fill="#fbbf24">Responde en 20 segundos</text>
</svg>`
}

async function svgToPng(svg, height = BOARD_H) {
  try {
    const { Resvg } = await import('@resvg/resvg-js')
    const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: WIDTH }, font: { loadSystemFonts: true } })
    return Buffer.from(resvg.render().asPng())
  } catch {
    return sharp(Buffer.from(svg)).png().toBuffer()
  }
}

async function compositeAvatars(base, conn, slots) {
  if (!conn || !slots?.length) return base
  const composites = []
  for (const { jid, name, left, top, size, color } of slots) {
    const raw = await fetchProfileBuffer(conn, jid, name, size)
    const av = await buildCircleAvatar(raw, size, color, 3)
    composites.push({ input: av, left: Math.round(left), top: Math.round(top) })
  }
  if (!composites.length) return base
  return sharp(base).composite(composites).png().toBuffer()
}

export async function renderMinerBoardPng(game, conn, options = {}) {
  const participants = options.participants || null
  const svg = buildMinerBoardSvg(game, { ...options, conn, participants })
  let base = await svgToPng(svg, BOARD_H)
  const half = AVATAR / 2 + 3
  base = await compositeAvatars(base, conn, [
    { jid: game.player1, name: getMinerPlayerName(game.player1, conn, participants), left: 56 + 52 - half, top: 220 - half, size: AVATAR, color: '#fbbf24' },
    { jid: game.player2, name: getMinerPlayerName(game.player2, conn, participants), left: 376 + 52 - half, top: 220 - half, size: AVATAR, color: '#d97706' },
  ])
  return base
}

export async function renderMinerInvitePng(conn, challenger, opponent, participants = null) {
  const cName = getMinerPlayerName(challenger, conn, participants)
  const oName = getMinerPlayerName(opponent, conn, participants)
  const svg = buildMinerInviteSvg({ challengerName: cName, opponentName: oName, moneda: global.moneda || 'USD' })
  let base = await svgToPng(svg, INVITE_H)
  const half = INVITE_AVATAR / 2 + 4
  base = await compositeAvatars(base, conn, [
    { jid: challenger, name: cName, left: 184 - half, top: 310 - half, size: INVITE_AVATAR, color: '#fbbf24' },
    { jid: opponent, name: oName, left: 536 - half, top: 310 - half, size: INVITE_AVATAR, color: '#d97706' },
  ])
  return base
}

export async function sendMinerBoard(conn, chat, game, opts = {}) {
  const png = await renderMinerBoardPng(game, conn, opts)
  const mentions = (opts.mentionedJid || []).filter(Boolean)
  return conn.sendFile(chat, png, 'miner-board.png', opts.caption || '', opts.quoted || null, false, {
    contextInfo: { ...(global.rcanal?.contextInfo || {}), ...(mentions.length ? { mentionedJid: mentions } : {}) },
  })
}

export async function sendMinerInvite(conn, chat, opts = {}) {
  const png = await renderMinerInvitePng(conn, opts.challenger, opts.opponent, opts.participants)
  const mentions = (opts.mentionedJid || []).filter(Boolean)
  return conn.sendFile(chat, png, 'miner-invite.png', opts.caption || '', opts.quoted || null, false, {
    contextInfo: { ...(global.rcanal?.contextInfo || {}), ...(mentions.length ? { mentionedJid: mentions } : {}) },
  })
}

export function getMinerWinner(game) {
  const s1 = game.summary?.[game.player1]?.gained || 0
  const s2 = game.summary?.[game.player2]?.gained || 0
  if (s1 > s2) return game.player1
  if (s2 > s1) return game.player2
  return null
}
