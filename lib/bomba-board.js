import sharp from './sharp.js'
import { getDisplayName } from './michi-users.js'
import { BOMBA_CELL_COUNT, BOMBA_CELL_PREFIX } from './bomba-game.js'
import { isInteractiveBaileysEnabled } from './baileys-dual.js'

const WIDTH = 720
const INVITE_H = 920
const BOARD_H = 1000
const COLS = 5
const ROWS = 2
const CELL = 112
const GAP = 14
const GRID_X = 58
const GRID_Y = 340
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

export function getBombaPlayerName(jid, conn, participants = null) {
  return cleanName(getDisplayName(jid, conn, participants))
}

function defaultAvatarSvg(letter, color = '#7f1d1d', size = AVATAR) {
  const safe = escapeXml(String(letter || '?').slice(0, 1).toUpperCase())
  return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="av" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="${color}"/><stop offset="100%" stop-color="#1a0a0a"/>
  </linearGradient></defs>
  <circle cx="${size/2}" cy="${size/2}" r="${size/2}" fill="url(#av)"/>
  <text x="50%" y="54%" font-family="Arial,sans-serif" font-size="${Math.round(size*0.42)}" font-weight="700"
    fill="#fecaca" text-anchor="middle" dominant-baseline="middle">${safe}</text>
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
  if (!conn || !jid) return sharp(Buffer.from(defaultAvatarSvg(name, '#7f1d1d', size))).png().toBuffer()
  try {
    let url = await conn.profilePictureUrl(jid, 'image').catch(() => null)
    if (!url) url = await conn.profilePictureUrl(jid, 'preview').catch(() => null)
    const data = await downloadImageUrl(conn, url)
    if (data) return data
  } catch {}
  return sharp(Buffer.from(defaultAvatarSvg(name, '#7f1d1d', size))).png().toBuffer()
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
      <stop offset="0%" stop-color="#0a0608"/><stop offset="45%" stop-color="#1a0c10"/><stop offset="100%" stop-color="#240e12"/>
    </linearGradient>
    <linearGradient id="fire" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#fca5a5"/><stop offset="100%" stop-color="#dc2626"/>
    </linearGradient>
    <linearGradient id="ember" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#f97316"/><stop offset="100%" stop-color="#ef4444"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="42%" r="58%">
      <stop offset="0%" stop-color="#ef4444" stop-opacity="0.22"/><stop offset="100%" stop-color="#ef4444" stop-opacity="0"/>
    </radialGradient>
    <filter id="glowF"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`
}

function iconBomb(cx, cy, sc = 1) {
  return `<g transform="translate(${cx},${cy}) scale(${sc})" filter="url(#glowF)">
    <circle cx="0" cy="0" r="14" fill="#1a0a0a" stroke="#fb7185" stroke-width="2.5"/>
    <ellipse cx="0" cy="-2" rx="10" ry="11" fill="#262626" stroke="#525252" stroke-width="1"/>
    <rect x="-3" y="-20" width="6" height="8" rx="2" fill="#78716c"/>
    <path d="M4 -18 Q10 -22 8 -14" fill="none" stroke="#fbbf24" stroke-width="2" stroke-linecap="round"/>
    <circle cx="8" cy="-15" r="2.5" fill="#fbbf24" opacity="0.9"/>
  </g>`
}

function iconSafe(cx, cy, sc = 1) {
  return `<g transform="translate(${cx},${cy}) scale(${sc})" filter="url(#glowF)">
    <circle cx="0" cy="0" r="13" fill="#0f1f14" stroke="#4ade80" stroke-width="2"/>
    <path d="M-5 0 L-1 5 L7 -6" fill="none" stroke="#86efac" stroke-width="2.8" stroke-linecap="round"/>
  </g>`
}

function iconFuse(cx, cy) {
  return `<g transform="translate(${cx},${cy})">
    <path d="M0 0 Q6 -8 12 -4 Q8 2 14 8" fill="none" stroke="#fbbf24" stroke-width="2" stroke-linecap="round" opacity="0.7"/>
    <circle cx="14" cy="8" r="3" fill="#f97316" opacity="0.8"/>
  </g>`
}

function iconSkull(cx, cy, sc = 1) {
  return `<g transform="translate(${cx},${cy}) scale(${sc})" filter="url(#glowF)">
    <circle cx="0" cy="0" r="14" fill="#2a1010" stroke="#fb7185" stroke-width="2"/>
    <circle cx="-5" cy="-2" r="3" fill="#fecaca"/>
    <circle cx="5" cy="-2" r="3" fill="#fecaca"/>
    <path d="M-6 8 Q0 4 6 8" fill="none" stroke="#fecaca" stroke-width="2" stroke-linecap="round"/>
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
  return `<g transform="translate(${cx},${cy})"><circle cx="0" cy="0" r="12" fill="none" stroke="#fca5a5" stroke-width="2"/>
    <line x1="0" y1="0" x2="0" y2="-7" stroke="#fca5a5" stroke-width="2" stroke-linecap="round"/>
    <line x1="0" y1="0" x2="5" y2="3" stroke="#fca5a5" stroke-width="2" stroke-linecap="round"/></g>`
}

function cellXY(index) {
  const row = Math.floor(index / COLS)
  const col = index % COLS
  return { x: GRID_X + col * (CELL + GAP), y: GRID_Y + row * (CELL + GAP) }
}

function renderCell(index, cell, game, options = {}) {
  const { x, y } = cellXY(index)
  const cx = x + CELL / 2
  const cy = y + CELL / 2
  const num = index + 1
  const highlight = options.highlightIndex === index
  const showBomb = options.revealAll || (options.status === 'finished' && index === game.bombIndex)

  if (!cell?.opened && options.status !== 'finished') {
    const stroke = highlight ? '#f87171' : '#5c2a2a'
    const fill = highlight ? '#2a1018' : '#160c10'
    return `
      <rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="16" fill="${fill}" stroke="${stroke}" stroke-width="${highlight ? 3 : 2}"/>
      <text x="${cx}" y="${cy + 8}" text-anchor="middle" font-family="Arial,sans-serif" font-size="34" font-weight="800" fill="#a86a6a">${num}</text>`
  }

  if (showBomb || (cell.opened && index === game.bombIndex)) {
    return `
      <rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="16" fill="#2a0a0a" stroke="#ef4444" stroke-width="3" filter="url(#glowF)"/>
      ${iconBomb(cx, cy, 0.9)}`
  }

  if (cell?.opened && cell.safe) {
    return `
      <rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="16" fill="#0f1a12" stroke="#4ade80" stroke-width="2.5"/>
      ${iconSafe(cx, cy, 0.85)}`
  }

  if (!cell?.opened && options.status === 'finished') {
    return `
      <rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="16" fill="#160c10" stroke="#5c2a2a" stroke-width="2"/>
      <text x="${cx}" y="${cy + 8}" text-anchor="middle" font-family="Arial,sans-serif" font-size="34" font-weight="800" fill="#6b4040">${num}</text>`
  }

  return ''
}

function playerPanel(x, name, active, color, champion = false) {
  const bg = champion ? '#3b1010' : active ? '#2a1018' : '#12080c'
  const border = champion ? '#f87171' : active ? color : '#3d1a22'
  return `
    <rect x="${x}" y="168" width="288" height="104" rx="20" fill="${bg}" stroke="${border}" stroke-width="${active || champion ? 2.5 : 1.5}"/>
    <circle cx="${x + 52}" cy="220" r="34" fill="#1a0a0a" stroke="${color}" stroke-width="2"/>
    <text x="${x + 100}" y="206" font-family="Arial,sans-serif" font-size="12" font-weight="600" fill="#a86a6a" letter-spacing="1">JUGADOR</text>
    <text x="${x + 100}" y="230" font-family="Arial,sans-serif" font-size="19" font-weight="700" fill="#fecaca">${escapeXml(name)}</text>
    ${active ? `<text x="${x + 268}" y="220" text-anchor="end" font-family="Arial,sans-serif" font-size="11" font-weight="700" fill="#f87171">TU TURNO</text>` : ''}`
}

function ambientSparks() {
  const pts = [[48, 72], [672, 88], [90, 280], [630, 270], [36, 520], [684, 540], [360, 36]]
  return pts.map(([x, y], i) =>
    `<circle cx="${x}" cy="${y}" r="${2 + (i % 2)}" fill="${i % 2 ? '#f87171' : '#f97316'}" opacity="0.4"/>`
  ).join('\n')
}

export function buildBombaBoardSvg(game, options = {}) {
  const {
    status = 'playing',
    statusText = '',
    highlightIndex = null,
    winnerJid = null,
    participants = null,
    conn = null,
    revealAll = false,
  } = options

  const p1 = game.player1
  const p2 = game.player2
  const p1Name = getBombaPlayerName(p1, conn, participants)
  const p2Name = getBombaPlayerName(p2, conn, participants)
  const turnP1 = game.currentPlayer === p1
  const p1Win = status === 'finished' && winnerJid === p1
  const p2Win = status === 'finished' && winnerJid === p2
  const moneda = global.moneda || 'USD'

  const footer = statusText || (
    status === 'finished'
      ? (p1Win ? `Ganador: ${p1Name}` : p2Win ? `Ganador: ${p2Name}` : 'Partida finalizada')
      : `Turno de ${turnP1 ? p1Name : p2Name}`
  )
  const footerColor = status === 'finished' ? '#fca5a5' : '#f87171'

  const cells = (game.cells || []).map((cell, i) =>
    renderCell(i, cell, game, { highlightIndex, status, revealAll })
  ).join('\n')

  let header = ''
  if (status === 'finished') {
    header = `
      <rect x="56" y="52" width="608" height="88" rx="22" fill="#1f0a0c" stroke="#ef4444" stroke-width="2"/>
      ${iconSkull(360, 34, 0.85)}
      <text x="360" y="88" text-anchor="middle" font-family="Arial,sans-serif" font-size="26" font-weight="800" fill="url(#fire)">BOMBA CALIENTE</text>
      <text x="360" y="118" text-anchor="middle" font-family="Arial,sans-serif" font-size="15" fill="#fecaca">${escapeXml(footer)}</text>`
  } else {
    header = `
      ${iconBomb(360, 56, 1.05)}
      ${iconFuse(320, 40)}
      <text x="360" y="98" text-anchor="middle" font-family="Arial,sans-serif" font-size="32" font-weight="800" fill="url(#fire)">BOMBA CALIENTE</text>
      <text x="360" y="126" text-anchor="middle" font-family="Arial,sans-serif" font-size="13" fill="#a86a6a" letter-spacing="2">PAIN-BOT · CAJA EXPLOSIVA</text>`
  }

  return `<svg width="${WIDTH}" height="${BOARD_H}" xmlns="http://www.w3.org/2000/svg">
  <defs>${svgDefs()}</defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <ellipse cx="360" cy="500" rx="300" ry="260" fill="url(#glow)"/>
  ${ambientSparks()}
  <rect x="24" y="24" width="${WIDTH-48}" height="${BOARD_H-48}" rx="30" fill="none" stroke="#5c2a2a" stroke-width="2"/>
  ${header}
  ${playerPanel(56, p1Name, status === 'playing' && turnP1, '#f87171', p1Win)}
  ${playerPanel(376, p2Name, status === 'playing' && !turnP1, '#fb923c', p2Win)}
  <rect x="56" y="286" width="608" height="36" rx="12" fill="#1a0a0c" stroke="#5c2a2a" stroke-width="1.5"/>
  <text x="104" y="310" font-family="Arial,sans-serif" font-size="14" fill="#a86a6a">Premio al ganador</text>
  <text x="616" y="310" text-anchor="end" font-family="Arial,sans-serif" font-size="16" font-weight="800" fill="#fca5a5">${game.pot || game.bet * 2} ${escapeXml(moneda)}</text>
  ${cells}
  <rect x="48" y="900" width="${WIDTH-96}" height="54" rx="16" fill="#12080c" stroke="#5c2a2a" stroke-width="1.5"/>
  <text x="360" y="933" text-anchor="middle" font-family="Arial,sans-serif" font-size="16" font-weight="700" fill="${footerColor}">${escapeXml(footer)}</text>
  <text x="360" y="318" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" fill="#a86a6a">1 bomba oculta · 10 casillas · elige con el boton de abajo</text>
</svg>`
}

export function buildBombaInviteSvg({ challengerName, opponentName, bet, moneda = 'USD' }) {
  const pot = bet * 2
  return `<svg width="${WIDTH}" height="${INVITE_H}" xmlns="http://www.w3.org/2000/svg">
  <defs>${svgDefs()}</defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <ellipse cx="360" cy="360" rx="290" ry="240" fill="url(#glow)"/>
  ${ambientSparks()}
  <rect x="24" y="24" width="${WIDTH-48}" height="${INVITE_H-48}" rx="30" fill="none" stroke="#5c2a2a" stroke-width="2"/>
  ${iconBomb(360, 62, 1.15)}
  <text x="360" y="108" text-anchor="middle" font-family="Arial,sans-serif" font-size="30" font-weight="800" fill="url(#fire)">INVITACION BOMBA</text>
  <text x="360" y="136" text-anchor="middle" font-family="Arial,sans-serif" font-size="13" fill="#a86a6a" letter-spacing="2">PAIN-BOT · CAJA EXPLOSIVA</text>

  <rect x="56" y="156" width="608" height="48" rx="16" fill="#1f0a0c" stroke="#dc2626" stroke-width="1.5"/>
  <text x="360" y="186" text-anchor="middle" font-family="Arial,sans-serif" font-size="15" font-weight="600" fill="#fecaca">Abre casillas por turnos. Evita la bomba.</text>

  <rect x="56" y="220" width="256" height="210" rx="24" fill="#160c10" stroke="#f87171" stroke-width="2.5"/>
  <circle cx="184" cy="310" r="54" fill="#1a0a0a" stroke="#f87171" stroke-width="2"/>
  <text x="184" y="390" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" font-weight="700" fill="#fecaca">${escapeXml(challengerName)}</text>
  <text x="184" y="412" text-anchor="middle" font-family="Arial,sans-serif" font-size="11" fill="#a86a6a">RETADOR</text>

  <rect x="408" y="220" width="256" height="210" rx="24" fill="#160c10" stroke="#fb923c" stroke-width="2.5"/>
  <circle cx="536" cy="310" r="54" fill="#1a0a0a" stroke="#fb923c" stroke-width="2"/>
  <text x="536" y="390" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" font-weight="700" fill="#fecaca">${escapeXml(opponentName)}</text>
  <text x="536" y="412" text-anchor="middle" font-family="Arial,sans-serif" font-size="11" fill="#a86a6a">INVITADO</text>

  <circle cx="360" cy="325" r="36" fill="#1a0a0a" stroke="url(#fire)" stroke-width="2.5"/>
  <text x="360" y="333" text-anchor="middle" font-family="Arial,sans-serif" font-size="22" font-weight="800" fill="url(#fire)">VS</text>

  <rect x="72" y="460" width="576" height="44" rx="12" fill="#12080c" stroke="#3d1a22" stroke-width="1.5"/>
  <text x="104" y="488" font-family="Arial,sans-serif" font-size="14" fill="#a86a6a">Apuesta por jugador</text>
  <text x="648" y="488" text-anchor="end" font-family="Arial,sans-serif" font-size="15" font-weight="700" fill="#fca5a5">${bet} ${escapeXml(moneda)}</text>

  <rect x="72" y="514" width="576" height="44" rx="12" fill="#12080c" stroke="#3d1a22" stroke-width="1.5"/>
  <text x="104" y="542" font-family="Arial,sans-serif" font-size="14" fill="#a86a6a">Premio al ganador</text>
  <text x="648" y="542" text-anchor="end" font-family="Arial,sans-serif" font-size="15" font-weight="700" fill="#86efac">${pot} ${escapeXml(moneda)}</text>

  <rect x="72" y="568" width="576" height="44" rx="12" fill="#12080c" stroke="#3d1a22" stroke-width="1.5"/>
  <text x="104" y="596" font-family="Arial,sans-serif" font-size="14" fill="#a86a6a">Minimo para jugar</text>
  <text x="648" y="596" text-anchor="end" font-family="Arial,sans-serif" font-size="15" font-weight="700" fill="#fca5a5">${bet} ${escapeXml(moneda)}</text>

  <rect x="72" y="636" width="260" height="56" rx="16" fill="#13261c" stroke="#86efac" stroke-width="2"/>
  ${iconCheck(104, 664)}
  <text x="200" y="670" text-anchor="middle" font-family="Arial,sans-serif" font-size="16" font-weight="700" fill="#86efac">SI — ACEPTAR</text>

  <rect x="388" y="636" width="260" height="56" rx="16" fill="#2a1218" stroke="#fb7185" stroke-width="2"/>
  ${iconReject(420, 664)}
  <text x="518" y="670" text-anchor="middle" font-family="Arial,sans-serif" font-size="16" font-weight="700" fill="#fb7185">NO — RECHAZAR</text>

  <rect x="72" y="712" width="576" height="36" rx="12" fill="#12080c" stroke="#5c2a2a" stroke-width="1.5"/>
  ${iconClock(96, 730)}
  <text x="380" y="735" text-anchor="middle" font-family="Arial,sans-serif" font-size="14" font-weight="700" fill="#fca5a5">Responde en 20 segundos</text>
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

export async function renderBombaBoardPng(game, conn, options = {}) {
  const participants = options.participants || null
  const svg = buildBombaBoardSvg(game, { ...options, conn, participants })
  let base = await svgToPng(svg, BOARD_H)
  const half = AVATAR / 2 + 3
  base = await compositeAvatars(base, conn, [
    { jid: game.player1, name: getBombaPlayerName(game.player1, conn, participants), left: 56 + 52 - half, top: 220 - half, size: AVATAR, color: '#f87171' },
    { jid: game.player2, name: getBombaPlayerName(game.player2, conn, participants), left: 376 + 52 - half, top: 220 - half, size: AVATAR, color: '#fb923c' },
  ])
  return base
}

export async function renderBombaInvitePng(conn, challenger, opponent, bet, participants = null) {
  const cName = getBombaPlayerName(challenger, conn, participants)
  const oName = getBombaPlayerName(opponent, conn, participants)
  const svg = buildBombaInviteSvg({ challengerName: cName, opponentName: oName, bet, moneda: global.moneda || 'USD' })
  let base = await svgToPng(svg, INVITE_H)
  const half = INVITE_AVATAR / 2 + 4
  base = await compositeAvatars(base, conn, [
    { jid: challenger, name: cName, left: 184 - half, top: 310 - half, size: INVITE_AVATAR, color: '#f87171' },
    { jid: opponent, name: oName, left: 536 - half, top: 310 - half, size: INVITE_AVATAR, color: '#fb923c' },
  ])
  return base
}

function buildCellSections(game) {
  const rows = game.getUnopenedIndices().map(i => ({
    header: '',
    title: `Casilla ${i + 1}`,
    description: 'Abrir esta casilla',
    id: `${BOMBA_CELL_PREFIX}${i + 1}`,
  }))
  if (!rows.length) return []
  return [{ title: 'Casillas libres', rows }]
}

function buildInteractiveFields(sections, turnName) {
  return {
    footer: global.packname || 'Pain-Bot',
    optionText: 'Elegir casilla',
    optionTitle: `Turno: ${turnName}`,
    nativeFlow: [{
      text: 'Elegir casilla',
      sections,
      icon: 'default',
    }],
  }
}

export async function sendBombaBoard(conn, chat, game, opts = {}) {
  const png = await renderBombaBoardPng(game, conn, opts)
  const mentions = (opts.mentionedJid || []).filter(Boolean)
  const ctx = { ...(global.rcanal?.contextInfo || {}), ...(mentions.length ? { mentionedJid: mentions } : {}) }
  const caption = opts.caption || ''
  const interactive = opts.interactive !== false && opts.status === 'playing' && game.gameActive

  if (interactive && isInteractiveBaileysEnabled()) {
    const turnName = getBombaPlayerName(game.currentPlayer, conn, opts.participants)
    const sections = buildCellSections(game)
    if (sections.length) {
      try {
        const content = {
          image: png,
          caption,
          ...buildInteractiveFields(sections, turnName),
          contextInfo: ctx,
        }
        return conn.sendMessageLia(chat, content, { quoted: opts.quoted || null })
      } catch (e) {
        console.error('Bomba interactivo fallo, usando imagen:', e?.message || e)
      }
    }
  }

  return conn.sendFile(chat, png, 'bomba-board.png', caption, opts.quoted || null, false, { contextInfo: ctx })
}

export async function sendBombaInvite(conn, chat, opts = {}) {
  const png = await renderBombaInvitePng(conn, opts.challenger, opts.opponent, opts.bet, opts.participants)
  const mentions = (opts.mentionedJid || []).filter(Boolean)
  return conn.sendFile(chat, png, 'bomba-invite.png', opts.caption || '', opts.quoted || null, false, {
    contextInfo: { ...(global.rcanal?.contextInfo || {}), ...(mentions.length ? { mentionedJid: mentions } : {}) },
  })
}
