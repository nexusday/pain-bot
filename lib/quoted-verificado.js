import { randomBytes } from 'crypto'
import { obtenerAvatarCacheado, precargarAvatar } from './avatar-cache.js'

const JID_FANTASMA = '0@s.whatsapp.net'

// La foto se sirve solo desde caché: el envío no espera a WhatsApp ni a la red.
const AVATAR_ACTIVO = process.env.PAIN_QUOTED_AVATAR !== '0'

function digitosDe(jid = '') {
  return String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '')
}

function esSoloNumero(texto = '') {
  const t = String(texto || '').trim()
  if (!t) return true
  return /^[+\d\s()-]{5,}$/.test(t) && digitosDe(t).length >= 5
}

/** Nombre visible: pushName del mensaje citado, nombre del chat o "Usuario". */
export function resolverNombreQuoted(quoted, conn) {
  const jid = resolverJidQuoted(quoted, conn)
  const candidatos = [
    quoted?.pushName,
    quoted?.name,
    quoted?.verifiedBizName,
    conn?.chats?.[jid]?.name,
    conn?.chats?.[jid]?.notify,
    conn?.chats?.[jid]?.vname
  ].filter(Boolean)

  for (const c of candidatos) {
    const n = String(c).trim()
    if (n && !esSoloNumero(n)) return n.slice(0, 40)
  }

  return 'Usuario'
}

export function resolverJidQuoted(quoted, conn) {
  const crudo =
    quoted?.sender ||
    quoted?.participant ||
    quoted?.key?.participantAlt ||
    quoted?.key?.participant ||
    quoted?.key?.remoteJidAlt ||
    (!String(quoted?.key?.remoteJid || '').endsWith('@g.us')
      ? quoted?.key?.remoteJid
      : null) ||
    ''

  try {
    return conn?.decodeJid?.(crudo) || crudo
  } catch {
    return crudo
  }
}

/** Miniatura ya cacheada (sincrónico, sin red). */
export function miniaturaCacheada(conn, jid) {
  if (!AVATAR_ACTIVO) return null
  const cacheada = obtenerAvatarCacheado(jid)
  if (cacheada) return cacheada
  // Deja la descarga en segundo plano para la próxima respuesta.
  precargarAvatar(conn, jid)
  return null
}

/**
 * Quoted verificado: contacto con pushName + foto (si ya está en caché).
 * Si no hay foto cacheada, WhatsApp muestra el avatar por defecto.
 */
export function construirQuotedVerificado(opts = {}) {
  const nombre = String(opts.name || 'Usuario').slice(0, 40)
  const waid = digitosDe(opts.waid || opts.jid) || '0'
  const id =
    opts.id ||
    '3EB0' + randomBytes(8).toString('hex').toUpperCase()

  const vcard =
    'BEGIN:VCARD\n' +
    'VERSION:3.0\n' +
    `N:;${nombre};;;\n` +
    `FN:${nombre}\n` +
    `TEL;type=CELL;type=VOICE;waid=${waid}:+${waid}\n` +
    'END:VCARD'

  const contactMessage = {
    displayName: nombre,
    vcard
  }

  if (opts.jpegThumbnail) {
    contactMessage.jpegThumbnail = opts.jpegThumbnail
  }

  return {
    key: {
      remoteJid: 'status@broadcast',
      fromMe: false,
      id,
      participant: JID_FANTASMA
    },
    message: { contactMessage },
    participant: JID_FANTASMA
  }
}

function yaEsQuotedContacto(quoted) {
  return Boolean(
    quoted?.message?.contactMessage ||
    quoted?.message?.contactsArrayMessage
  )
}

/**
 * Cambia el reply (quoted) por contacto verificado con pushName + foto cacheada.
 * No hace ninguna operación de red en el camino del envío.
 * Desactivar: global.quotedVerificado = false
 * Quote real: options.keepQuoted = true
 */
export async function aplicarQuotedVerificado(conn, options = {}) {
  if (global.quotedVerificado === false || global.fakeBizReply === false) {
    return options
  }
  if (!options || typeof options !== 'object') return options
  if (options.keepQuoted === true || options.quotedReal === true) return options
  if (!options.quoted) return options
  if (yaEsQuotedContacto(options.quoted)) return options

  const quoted = options.quoted
  const nombre = resolverNombreQuoted(quoted, conn)
  const jidUser = resolverJidQuoted(quoted, conn)
  const jpegThumbnail = miniaturaCacheada(conn, jidUser)

  return {
    ...options,
    quoted: construirQuotedVerificado({
      name: nombre,
      jid: jidUser,
      jpegThumbnail: jpegThumbnail || undefined
    })
  }
}

export {
  construirQuotedVerificado as buildVerifiedQuoted,
  aplicarQuotedVerificado as applyVerifiedQuoted
}
