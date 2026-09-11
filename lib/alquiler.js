const UNIDADES_TIEMPO = {
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

const TIPOS_INFINITOS = new Set(['infinite', 'infinito', 'official', 'oficial'])
const COMANDOS_OWNER_ALQUILER = new Set(['one', 'alquiler', 'rent'])

export function tienePrefijoComando(m, conn) {
  const text = (m.text || '').trim()
  if (!text) return false

  const prefix = conn?.prefix || global.prefix

  if (prefix instanceof RegExp) {
    return prefix.test(text)
  }

  if (typeof prefix === 'string') {
    return text.startsWith(prefix)
  }

  if (Array.isArray(prefix)) {
    return prefix.some((p) => {
      if (p instanceof RegExp) return p.test(text)
      return text.startsWith(p)
    })
  }

  return false
}

export function extraerComandoTemprano(m, conn) {
  const text = (m.text || '').trim()
  if (!text) return ''

  const prefix = conn?.prefix || global.prefix
  let body = null

  if (prefix instanceof RegExp) {
    const match = prefix.exec(text)
    if (match) body = text.slice(match[0].length).trim()
  } else if (typeof prefix === 'string' && text.startsWith(prefix)) {
    body = text.slice(prefix.length).trim()
  } else if (Array.isArray(prefix)) {
    for (const p of prefix) {
      if (p instanceof RegExp) {
        const match = p.exec(text)
        if (match) {
          body = text.slice(match[0].length).trim()
          break
        }
      } else if (text.startsWith(p)) {
        body = text.slice(p.length).trim()
        break
      }
    }
  }

  if (body === null) return ''
  return body.split(/\s+/)[0]?.toLowerCase() || ''
}

export function esComandoBypassAlquiler(m, conn, isOwner, isROwner) {
  if (!isOwner && !isROwner) return false
  return COMANDOS_OWNER_ALQUILER.has(extraerComandoTemprano(m, conn))
}

export function asegurarDbAlquiler() {
  if (!global.db.data.alquiler) global.db.data.alquiler = {}
  return global.db.data.alquiler
}

export function parsearTiempoAlquiler(input = '') {
  const raw = String(input).trim().toLowerCase().replace(/\s+/g, '')
  if (!raw) return null

  const match = raw.match(/^(\d+(?:\.\d+)?)(m|min|mins|minuto|minutos|h|hr|hrs|hora|horas|d|dia|dias|día|días|w|sem|semana|semanas)$/i)
  if (!match) return null

  const amount = Number(match[1])
  const unit = match[2].toLowerCase()
  const multiplier = UNIDADES_TIEMPO[unit]
  if (!amount || !multiplier) return null

  return Math.round(amount * multiplier)
}

export function esAlquilerInfinito(rental) {
  if (!rental) return false
  return rental.type === 'infinite' || rental.type === 'official' || rental.expiresAt === null
}

export function obtenerAlquiler(chatId) {
  const db = asegurarDbAlquiler()
  return db[chatId] || null
}

export function tieneAlquilerActivo(chatId) {
  const rental = obtenerAlquiler(chatId)
  if (!rental) return false
  if (esAlquilerInfinito(rental)) return true
  if (!rental.expiresAt) return true
  return rental.expiresAt > Date.now()
}

export function estaAlquilerExpirado(chatId) {
  const rental = obtenerAlquiler(chatId)
  if (!rental) return false
  if (esAlquilerInfinito(rental)) return false
  if (!rental.expiresAt) return false
  return rental.expiresAt <= Date.now()
}

export function formatearDuracion(ms) {
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

export function formatearRestante(expiresAt) {
  return formatearDuracion(Math.max(0, expiresAt - Date.now()))
}

export function formatearRestanteDetallado(expiresAt) {
  let ms = Math.max(0, expiresAt - Date.now())
  const totalSeconds = Math.floor(ms / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const parts = []

  if (days) parts.push(`${days}d`)
  if (hours) parts.push(`${String(hours).padStart(2, '0')}h`)
  if (minutes) parts.push(`${String(minutes).padStart(2, '0')}m`)
  parts.push(`${String(seconds).padStart(2, '0')}s`)

  return parts.join(' ')
}

const PREFILL_RENT_OWNER = 'Hola, deseo el bot privado para mi grupo(no subbot).'
const PLACEHOLDERS_OWNER = new Set(['tunumero', 'acaElLiD', 'number', 'numero', 'tu_numero'])
const MAX_BOTONES_OWNER = 3

/** Acepta número, @user, wa.me/@user o URL completa */
export function resolverContactoOwner(raw) {
  let s = String(raw || '').trim()
  if (!s || PLACEHOLDERS_OWNER.has(s.toLowerCase())) return null

  s = s.replace(/^<|>$/g, '').trim()

  // https://wa.me/... o wa.me/...
  const wame = s.match(/^(?:https?:\/\/)?(?:www\.)?wa\.me\/+(.+)$/i)
  if (wame) {
    let handle = decodeURIComponent(wame[1].split('?')[0].split('/')[0]).replace(/^@+/, '')
    if (!handle) return null
    const digits = handle.replace(/\D/g, '')
    if (/^\d{8,15}$/.test(digits) && digits === handle.replace(/\D/g, '') && !/[a-zA-Z]/.test(handle)) {
      return { kind: 'phone', value: digits }
    }
    return { kind: 'username', value: handle }
  }

  // URL cualquiera
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s)
      const path = u.pathname.replace(/^\/+/, '').split('/')[0]
      if (path) return { kind: 'username', value: path.replace(/^@+/, ''), url: s }
    } catch {}
  }

  // @username
  if (s.startsWith('@')) {
    const handle = s.slice(1).trim()
    if (handle) return { kind: 'username', value: handle }
  }

  // Solo username (letras)
  if (/^[a-zA-Z][\w.]{1,30}$/.test(s)) {
    return { kind: 'username', value: s }
  }

  // Número internacional
  const digits = s.replace(/\D/g, '')
  if (digits.length >= 8 && digits.length <= 15) {
    return { kind: 'phone', value: digits }
  }

  return null
}

export function construirUrlChatDesdeContacto(contact, prefillText = PREFILL_RENT_OWNER) {
  if (!contact) return null
  const q = encodeURIComponent(prefillText)

  if (contact.kind === 'phone') {
    return `https://wa.me/${contact.value}?text=${q}`
  }

  if (contact.kind === 'username') {
    return `https://wa.me/@${contact.value}?text=${q}`
  }

  if (contact.url) {
    try {
      const u = new URL(contact.url)
      u.searchParams.set('text', prefillText)
      return u.toString()
    } catch {
      return contact.url
    }
  }

  return null
}

/** Owners válidos de global.owner con nombre, @/número y link */
export function listarObjetivosRentOwner(prefillText = PREFILL_RENT_OWNER) {
  const out = []
  const seen = new Set()

  for (const entry of global.owner || []) {
    const contact = resolverContactoOwner(entry?.[0])
    if (!contact) continue

    const name = String(entry?.[1] || 'Owner').trim() || 'Owner'
    const handle = contact.kind === 'phone'
      ? `+${contact.value}`
      : `@${contact.value}`
    const url = construirUrlChatDesdeContacto(contact, prefillText)
    if (!url) continue

    const key = `${contact.kind}:${contact.value || contact.url}`
    if (seen.has(key)) continue
    seen.add(key)

    out.push({
      name,
      handle,
      url,
      contact,
      buttonText: name.slice(0, 20),
    })
  }

  return out
}

export function obtenerContactosOwner() {
  const targets = listarObjetivosRentOwner()
  if (!targets.length) return '✰ Owner'
  return targets.map(t => `✰ *${t.name}* · ${t.handle}`).join('\n> ')
}

export function obtenerContactoOwnerPrincipal() {
  return listarObjetivosRentOwner()[0]?.contact || null
}

/** @deprecated usar obtenerContactoOwnerPrincipal / listarObjetivosRentOwner */
export function obtenerNumeroOwnerPrincipal() {
  const contact = obtenerContactoOwnerPrincipal()
  return contact?.kind === 'phone' ? contact.value : null
}

export function construirUrlChatRentOwner(prefillText = PREFILL_RENT_OWNER) {
  return listarObjetivosRentOwner(prefillText)[0]?.url || null
}

export function construirBotonesRentOwner(prefillText = PREFILL_RENT_OWNER) {
  return listarObjetivosRentOwner(prefillText)
    .slice(0, MAX_BOTONES_OWNER)
    .map(t => ({
      text: t.buttonText,
      url: t.url,
    }))
}

export async function guardarAlquiler(chatId, durationMs, activatedBy) {
  const db = asegurarDbAlquiler()
  const now = Date.now()
  const current = db[chatId]

  db[chatId] = {
    type: 'timed',
    expiresAt: now + durationMs,
    activatedAt: current?.activatedAt || now,
    activatedBy: current?.activatedBy || activatedBy,
    lastRenewBy: activatedBy,
    lastRenewAt: now,
    lastDurationMs: durationMs,
    notifiedExpired: false
  }

  await limpiarNotifAlquiler(chatId)
  await global.db.write()
  return db[chatId]
}

export async function guardarAlquilerPermanente(chatId, type, activatedBy) {
  const db = asegurarDbAlquiler()
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

  await limpiarNotifAlquiler(chatId)
  await global.db.write()
  return db[chatId]
}

export function asegurarDbNotifAlquiler() {
  if (!global.db.data.alquilerNotify) global.db.data.alquilerNotify = {}
  return global.db.data.alquilerNotify
}

export async function limpiarNotifAlquiler(chatId) {
  const notify = asegurarDbNotifAlquiler()
  if (!notify[chatId]) return
  delete notify[chatId]
  await global.db.write()
}

export async function eliminarAlquiler(chatId) {
  const db = asegurarDbAlquiler()
  delete db[chatId]
  await limpiarNotifAlquiler(chatId)
  await global.db.write()
}

export function obtenerLineaAlquilerMenu(chatId) {
  const rental = obtenerAlquiler(chatId)

  if (!rental) return 'Sin plan ❌'

  if (rental.type === 'official') return 'Grupo Oficial ♾️'
  if (rental.type === 'infinite') return 'Infinito ♾️'

  if (rental.expiresAt && rental.expiresAt > Date.now()) {
    return `${formatearRestanteDetallado(rental.expiresAt)} restante`
  }

  if (rental.expiresAt) return 'Expirado ⏳'

  return 'Sin plan ❌'
}

async function reaccionarAlquilerBloqueado(m, conn) {
  await conn.sendMessage(m.chat, {
    react: { text: '❌', key: m.key }
  }).catch(() => {})
}

function resolverPrefijoAlquiler(m, conn) {
  const text = (m?.text || '').trim()
  const prefix = conn?.prefix || global.prefix

  if (prefix instanceof RegExp) {
    const match = prefix.exec(text)
    if (match?.[0]) return match[0]
  } else if (typeof prefix === 'string' && text.startsWith(prefix)) {
    return prefix
  } else if (Array.isArray(prefix)) {
    for (const p of prefix) {
      if (p instanceof RegExp) {
        const match = p.exec(text)
        if (match?.[0]) return match[0]
      } else if (typeof p === 'string' && text.startsWith(p)) {
        return p
      }
    }
  }

  return typeof prefix === 'string' ? prefix : '.'
}

export async function notificarSinPlan(m, conn) {
  const notify = asegurarDbNotifAlquiler()
  const entry = notify[m.chat] || {}

  if (!entry.noPlanNotified) {
    notify[m.chat] = { ...entry, noPlan: true, noPlanNotified: true, at: Date.now() }
    await global.db.write()

    const owners = obtenerContactosOwner()
    const ownerButtons = construirBotonesRentOwner()
    const p = resolverPrefijoAlquiler(m, conn)
    const text =
      `[❌] *Sin plan activo*\n\n` +
      `El bot no está habilitado en este grupo.\n\n` +
      `*Si eres dueño del subbot o del bot privado:*\n` +
      `Escribe en este grupo:\n` +
      `> ${p}rent infinito\n` +
      `para habilitar tu subbot aquí sin límite de tiempo.\n\n` +
      `*Si quieres el bot privado para tu grupo (no subbot):*\n` +
      `Toca el botón del owner o contactalo:\n` +
      `> ${owners}`

    try {
      if (ownerButtons.length && typeof conn.sendMessageLia === 'function') {
        await conn.sendMessageLia(m.chat, {
          text,
          footer: global.packname || global.namebot || 'Pain-Bot',
          nativeFlow: ownerButtons,
          contextInfo: { ...(global.rcanal?.contextInfo || {}) },
        }, { quoted: m })
        return
      }

      if (!ownerButtons.length) {
        console.warn('[alquiler] Sin owners válidos en global.owner. Usa número o wa.me/@usuario')
      }
    } catch (e) {
      console.error('notificarSinPlan interactive falló:', e?.message || e)
    }

    const fallbackLinks = listarObjetivosRentOwner()
      .map(t => `> *${t.name}* (${t.handle})\n> ${t.url}`)
      .join('\n')

    await conn.sendMessage(m.chat, {
      text: fallbackLinks ? `${text}\n\n${fallbackLinks}` : text,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m }).catch(() => {})
    return
  }

  await reaccionarAlquilerBloqueado(m, conn)
}

export async function notificarAlquilerExpirado(m, conn) {
  const rental = obtenerAlquiler(m.chat)
  if (!rental || esAlquilerInfinito(rental)) return

  if (!rental.notifiedExpired) {
    rental.notifiedExpired = true
    await global.db.write()

    const owners = obtenerContactosOwner()
    const ownerButtons = construirBotonesRentOwner()
    const text =
      `[❌] *Tiempo de uso expirado*\n\n` +
      `El bot dejó de funcionar en este grupo porque terminó el período de alquiler.\n\n` +
      `Para obtener más tiempo, tocá el botón del owner o contactalo:\n` +
      `> ${owners}`

    try {
      if (ownerButtons.length && typeof conn.sendMessageLia === 'function') {
        await conn.sendMessageLia(m.chat, {
          text,
          footer: global.packname || global.namebot || 'Pain-Bot',
          nativeFlow: ownerButtons,
          contextInfo: { ...(global.rcanal?.contextInfo || {}) },
        }, { quoted: m })
        return
      }
    } catch (e) {
      console.error('notificarAlquilerExpirado interactive falló:', e?.message || e)
    }

    await conn.sendMessage(m.chat, {
      text,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m }).catch(() => {})
    return
  }

  await reaccionarAlquilerBloqueado(m, conn)
}

export async function verificarAlquilerGrupo(m, conn) {
  if (!m.isGroup || m.fromMe) return false
  if (!tienePrefijoComando(m, conn)) return false

  const rental = obtenerAlquiler(m.chat)

  if (!rental) {
    await notificarSinPlan(m, conn)
    return true
  }

  if (tieneAlquilerActivo(m.chat)) return false

  await notificarAlquilerExpirado(m, conn)
  return true
}

export function construirTextoEstadoAlquiler(chatId, groupName = 'Grupo') {
  const rental = obtenerAlquiler(chatId)

  if (!rental) {
    return `☾. *Estado de alquiler*\n\n> *Grupo:* ${groupName}\n> *Estado:* Sin plan activo`
  }

  if (rental.type === 'official') {
    return `☾. *Estado de alquiler*\n\n> *Grupo:* ${groupName}\n> *Estado:* Grupo Oficial ♾️\n> *Tiempo:* Sin expiración`
  }

  if (rental.type === 'infinite') {
    return `☾. *Estado de alquiler*\n\n> *Grupo:* ${groupName}\n> *Estado:* Infinito ♾️\n> *Tiempo:* Sin expiración`
  }

  if (tieneAlquilerActivo(chatId)) {
    return `☾. *Estado de alquiler*\n\n> *Grupo:* ${groupName}\n> *Estado:* Activo\n> *Tiempo restante:* ${formatearRestanteDetallado(rental.expiresAt)}\n> *Vence:* ${new Date(rental.expiresAt).toLocaleString('es-ES')}`
  }

  return `☾. *Estado de alquiler*\n\n> *Grupo:* ${groupName}\n> *Estado:* Expirado\n> *Venció:* ${new Date(rental.expiresAt).toLocaleString('es-ES')}`
}

export function esAccionAlquilerPermanente(action = '') {
  return TIPOS_INFINITOS.has(String(action).toLowerCase().trim())
}

export function resolverTipoAlquilerPermanente(action = '') {
  const value = String(action).toLowerCase().trim()
  if (value === 'oficial' || value === 'official') return 'official'
  if (value === 'infinito' || value === 'infinite' || value === 'perm' || value === 'permanente') return 'infinite'
  return null
}

export {
  tienePrefijoComando as hasCommandPrefix,
  extraerComandoTemprano as extractEarlyCommand,
  esComandoBypassAlquiler as isRentalBypassCommand,
  asegurarDbAlquiler as ensureAlquilerDb,
  parsearTiempoAlquiler as parseRentalTime,
  esAlquilerInfinito as isInfiniteRental,
  obtenerAlquiler as getRental,
  tieneAlquilerActivo as hasActiveRental,
  estaAlquilerExpirado as isRentalExpired,
  formatearDuracion as formatDuration,
  formatearRestante as formatRemaining,
  formatearRestanteDetallado as formatRemainingDetailed,
  resolverContactoOwner as resolveOwnerContact,
  construirUrlChatDesdeContacto as buildChatUrlFromContact,
  listarObjetivosRentOwner as listOwnerRentTargets,
  obtenerContactosOwner as getOwnerContacts,
  obtenerContactoOwnerPrincipal as getPrimaryOwnerContact,
  obtenerNumeroOwnerPrincipal as getPrimaryOwnerNumber,
  construirUrlChatRentOwner as buildOwnerRentChatUrl,
  construirBotonesRentOwner as buildOwnerRentButtons,
  guardarAlquiler as saveRental,
  guardarAlquilerPermanente as savePermanentRental,
  asegurarDbNotifAlquiler as ensureAlquilerNotifyDb,
  limpiarNotifAlquiler as clearRentalNotify,
  eliminarAlquiler as removeRental,
  obtenerLineaAlquilerMenu as getMenuRentalLine,
  notificarSinPlan as notifyNoPlan,
  notificarAlquilerExpirado as notifyRentalExpired,
  verificarAlquilerGrupo as checkGroupRental,
  construirTextoEstadoAlquiler as buildRentalStatusText,
  esAccionAlquilerPermanente as isPermanentRentalAction,
  resolverTipoAlquilerPermanente as resolvePermanentRentalType
}
