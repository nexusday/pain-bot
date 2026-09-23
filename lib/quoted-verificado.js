import { randomBytes } from 'crypto'
import fetch from 'node-fetch'

const JID_FANTASMA = '0@s.whatsapp.net'

function digitosDe(jid = '') {
  return String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '')
}

function esSoloNumero(texto = '') {
  const t = String(texto || '').trim()
  if (!t) return true
  return /^[+\d\s()-]{5,}$/.test(t) && digitosDe(t).length >= 5
}

/** Nombre visible: pushName, nunca el número. */
export function resolverNombreQuoted(quoted, conn) {
  const candidatos = [
    quoted?.pushName,
    quoted?.name,
    quoted?.verifiedBizName,
    typeof conn?.getName === 'function' ? null : null
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

async function obtenerMiniaturaPerfil(conn, jid) {
  if (!conn || !jid || jid === JID_FANTASMA) return null
  try {
    const url = await conn.profilePictureUrl(jid, 'image')
    if (!url) return null
    const res = await fetch(url)
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (!buf.length || buf.length > 200_000) return null
    return buf
  } catch {
    return null
  }
}

/**
 * Quoted verificado: contacto con pushName + foto de perfil (si tiene).
 * Si no hay foto, WhatsApp muestra el avatar por defecto.
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
 * Cambia el reply (quoted) por contacto verificado con pushName + foto.
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
  let nombre = resolverNombreQuoted(quoted, conn)

  
  if ((nombre === 'Usuario' || esSoloNumero(nombre)) && conn?.getName) {
    try {
      const jidTemp = resolverJidQuoted(quoted, conn)
      const n = await Promise.resolve(conn.getName(jidTemp))
      if (n && !esSoloNumero(n)) nombre = String(n).slice(0, 40)
    } catch {}
  }

  if (!nombre || esSoloNumero(nombre)) nombre = 'Usuario'

  const jidUser = resolverJidQuoted(quoted, conn)
  const jpegThumbnail = await obtenerMiniaturaPerfil(conn, jidUser)

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
