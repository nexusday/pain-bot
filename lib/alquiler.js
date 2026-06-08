const TIME_UNITS = {
  m: 60 * 1000,
  min: 60 * 1000,
  mins: 60 * 1000,
  minuto: 60 * 1000,
  minutos: 60 * 1000,
  h: 60 * 60 * 1000,
  hr: 60 * 60 * 1000,
  hrs: 60 * 60 * 1000,
  hora: 60 * 60 * 1000,
  horas: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  dia: 24 * 60 * 60 * 1000,
  dias: 24 * 60 * 60 * 1000,
  'día': 24 * 60 * 60 * 1000,
  'días': 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
  sem: 7 * 24 * 60 * 60 * 1000,
  semana: 7 * 24 * 60 * 60 * 1000,
  semanas: 7 * 24 * 60 * 60 * 1000
}

const INFINITE_TYPES = new Set(['infinite', 'infinito', 'official', 'oficial'])
const RENTAL_OWNER_COMMANDS = new Set(['one', 'alquiler', 'rent'])

export function extractEarlyCommand(m, conn) {
  const text = (m.text || '').trim()
  if (!text) return ''

  const prefix = conn?.prefix || global.prefix
  let body = text

  if (prefix instanceof RegExp) {
    const match = prefix.exec(text)
    if (match) body = text.slice(match[0].length).trim()
  } else if (typeof prefix === 'string' && text.startsWith(prefix)) {
    body = text.slice(prefix.length).trim()
  }

  return body.split(/\s+/)[0]?.toLowerCase() || ''
}

export function isRentalBypassCommand(m, conn, isOwner, isROwner) {
  if (!isOwner && !isROwner) return false
  return RENTAL_OWNER_COMMANDS.has(extractEarlyCommand(m, conn))
}

export function ensureAlquilerDb() {
  if (!global.db.data.alquiler) global.db.data.alquiler = {}
  return global.db.data.alquiler
}

export function parseRentalTime(input = '') {
  const raw = String(input).trim().toLowerCase().replace(/\s+/g, '')
  if (!raw) return null

  const match = raw.match(/^(\d+(?:\.\d+)?)(m|min|mins|minuto|minutos|h|hr|hrs|hora|horas|d|dia|dias|día|días|w|sem|semana|semanas)$/i)
  if (!match) return null

  const amount = Number(match[1])
  const unit = match[2].toLowerCase()
  const multiplier = TIME_UNITS[unit]
  if (!amount || !multiplier) return null

  return Math.round(amount * multiplier)
}

export function isInfiniteRental(rental) {
  if (!rental) return false
  return rental.type === 'infinite' || rental.type === 'official' || rental.expiresAt === null
}

export function getRental(chatId) {
  const db = ensureAlquilerDb()
  return db[chatId] || null
}

export function hasActiveRental(chatId) {
  const rental = getRental(chatId)
  if (!rental) return false
  if (isInfiniteRental(rental)) return true
  if (!rental.expiresAt) return true
  return rental.expiresAt > Date.now()
}

export function isRentalExpired(chatId) {
  const rental = getRental(chatId)
  if (!rental) return false
  if (isInfiniteRental(rental)) return false
  if (!rental.expiresAt) return false
  return rental.expiresAt <= Date.now()
}

export function formatDuration(ms) {
  if (!ms || ms <= 0) return '0 minutos'

  const totalMinutes = Math.ceil(ms / 60000)
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  const parts = []

  if (days) parts.push(`${days} día${days === 1 ? '' : 's'}`)
  if (hours) parts.push(`${hours} hora${hours === 1 ? '' : 's'}`)
  if (minutes || !parts.length) parts.push(`${minutes} minuto${minutes === 1 ? '' : 's'}`)

  return parts.join(', ')
}

export function formatRemaining(expiresAt) {
  return formatDuration(Math.max(0, expiresAt - Date.now()))
}

export function getOwnerContacts() {
  const lines = []

  for (const entry of global.owner || []) {
    const number = String(entry?.[0] || '').replace(/\D/g, '')
    const name = entry?.[1] || 'Owner'
    if (number) lines.push(`✰ ${name} (+${number})`)
  }

  for (const entry of global.ownerLid || []) {
    const name = entry?.[1] || 'Owner'
    lines.push(`✰ ${name}`)
  }

  return lines.length ? lines.join('\n> ') : '✰ Sunkovv'
}

export async function saveRental(chatId, durationMs, activatedBy) {
  const db = ensureAlquilerDb()
  const now = Date.now()
  const current = db[chatId]
  const base = current?.expiresAt && current.expiresAt > now && current.type === 'timed'
    ? current.expiresAt
    : now

  db[chatId] = {
    type: 'timed',
    expiresAt: base + durationMs,
    activatedAt: current?.activatedAt || now,
    activatedBy,
    lastRenewBy: activatedBy,
    lastRenewAt: now,
    totalMs: (current?.totalMs || 0) + durationMs,
    notifiedExpired: false
  }

  await clearRentalNotify(chatId)
  await global.db.write()
  return db[chatId]
}

export async function savePermanentRental(chatId, type, activatedBy) {
  const db = ensureAlquilerDb()
  const now = Date.now()

  db[chatId] = {
    type,
    expiresAt: null,
    activatedAt: now,
    activatedBy,
    lastRenewBy: activatedBy,
    lastRenewAt: now,
    totalMs: null,
    notifiedExpired: false
  }

  await clearRentalNotify(chatId)
  await global.db.write()
  return db[chatId]
}

export function ensureAlquilerNotifyDb() {
  if (!global.db.data.alquilerNotify) global.db.data.alquilerNotify = {}
  return global.db.data.alquilerNotify
}

export async function clearRentalNotify(chatId) {
  const notify = ensureAlquilerNotifyDb()
  if (!notify[chatId]) return
  delete notify[chatId]
  await global.db.write()
}

export async function removeRental(chatId) {
  const db = ensureAlquilerDb()
  delete db[chatId]
  await clearRentalNotify(chatId)
  await global.db.write()
}

export function getMenuRentalLine(chatId) {
  const rental = getRental(chatId)

  if (!rental) return 'Sin plan ❌'

  if (rental.type === 'official') return 'Grupo Oficial ♾️'
  if (rental.type === 'infinite') return 'Infinito ♾️'

  if (rental.expiresAt && rental.expiresAt > Date.now()) {
    return `${formatRemaining(rental.expiresAt)} restante`
  }

  if (rental.expiresAt) return 'Expirado ⏳'

  return 'Sin plan ❌'
}

async function reactRentalBlocked(m, conn) {
  await conn.sendMessage(m.chat, {
    react: { text: '❌', key: m.key }
  }).catch(() => {})
}

export async function notifyNoPlan(m, conn) {
  const notify = ensureAlquilerNotifyDb()
  const entry = notify[m.chat] || {}

  if (!entry.noPlanNotified) {
    notify[m.chat] = { ...entry, noPlan: true, noPlanNotified: true, at: Date.now() }
    await global.db.write()

    const owners = getOwnerContacts()

    await conn.sendMessage(m.chat, {
      text: `⏳ *Sin plan activo*\n\nEl bot no está habilitado en este grupo.\n\nPara activarlo, contactá con un owner:\n> ${owners}`,
      contextInfo: { ...global.rcanal.contextInfo }
    }, { quoted: m }).catch(() => {})
    return
  }

  await reactRentalBlocked(m, conn)
}

export async function notifyRentalExpired(m, conn) {
  const rental = getRental(m.chat)
  if (!rental || isInfiniteRental(rental)) return

  if (!rental.notifiedExpired) {
    rental.notifiedExpired = true
    await global.db.write()

    const owners = getOwnerContacts()

    await conn.sendMessage(m.chat, {
      text: `⏳ *Tiempo de uso expirado*\n\nEl bot dejó de funcionar en este grupo porque terminó el período de alquiler.\n\nPara obtener más tiempo de uso, contactá con un owner:\n> ${owners}`,
      contextInfo: { ...global.rcanal.contextInfo }
    }, { quoted: m }).catch(() => {})
    return
  }

  await reactRentalBlocked(m, conn)
}

export async function checkGroupRental(m, conn) {
  if (!m.isGroup || m.fromMe) return false

  const rental = getRental(m.chat)

  if (!rental) {
    await notifyNoPlan(m, conn)
    return true
  }

  if (hasActiveRental(m.chat)) return false

  await notifyRentalExpired(m, conn)
  return true
}

export function buildRentalStatusText(chatId, groupName = 'Grupo') {
  const rental = getRental(chatId)

  if (!rental) {
    return `☾. *Estado de alquiler*\n\n> *Grupo:* ${groupName}\n> *Estado:* Sin plan activo`
  }

  if (rental.type === 'official') {
    return `☾. *Estado de alquiler*\n\n> *Grupo:* ${groupName}\n> *Estado:* Grupo Oficial ♾️\n> *Tiempo:* Sin expiración`
  }

  if (rental.type === 'infinite') {
    return `☾. *Estado de alquiler*\n\n> *Grupo:* ${groupName}\n> *Estado:* Infinito ♾️\n> *Tiempo:* Sin expiración`
  }

  if (hasActiveRental(chatId)) {
    return `☾. *Estado de alquiler*\n\n> *Grupo:* ${groupName}\n> *Estado:* Activo\n> *Tiempo restante:* ${formatRemaining(rental.expiresAt)}\n> *Vence:* ${new Date(rental.expiresAt).toLocaleString('es-ES')}`
  }

  return `☾. *Estado de alquiler*\n\n> *Grupo:* ${groupName}\n> *Estado:* Expirado\n> *Venció:* ${new Date(rental.expiresAt).toLocaleString('es-ES')}`
}

export function isPermanentRentalAction(action = '') {
  return INFINITE_TYPES.has(String(action).toLowerCase().trim())
}

export function resolvePermanentRentalType(action = '') {
  const value = String(action).toLowerCase().trim()
  if (value === 'oficial' || value === 'official') return 'official'
  if (value === 'infinito' || value === 'infinite' || value === 'perm' || value === 'permanente') return 'infinite'
  return null
}
