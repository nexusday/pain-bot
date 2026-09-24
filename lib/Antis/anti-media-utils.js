/**
 * Utilidades compartidas para anti-img / sticker / video / audio.
 */

import { findGroupParticipant } from '../group-participant.js'

export function desempaquetarMensaje(message) {
  if (!message || typeof message !== 'object') return null
  let cur = message
  for (let i = 0; i < 10; i++) {
    if (cur.ephemeralMessage?.message) {
      cur = cur.ephemeralMessage.message
      continue
    }
    if (cur.viewOnceMessage?.message) {
      cur = cur.viewOnceMessage.message
      continue
    }
    if (cur.viewOnceMessageV2?.message) {
      cur = cur.viewOnceMessageV2.message
      continue
    }
    if (cur.viewOnceMessageV2Extension?.message) {
      cur = cur.viewOnceMessageV2Extension.message
      continue
    }
    if (cur.documentWithCaptionMessage?.message) {
      cur = cur.documentWithCaptionMessage.message
      continue
    }
    if (cur.editedMessage?.message) {
      cur = cur.editedMessage.message
      continue
    }
    if (cur.lottieStickerMessage?.message) {
      cur = cur.lottieStickerMessage.message
      continue
    }
    if (cur.associatedChildMessage?.message) {
      cur = cur.associatedChildMessage.message
      continue
    }
    break
  }
  return cur
}

export function tieneTipoMedia(m, tipos = []) {
  if (!m) return false
  const set = new Set(tipos)

  if (set.has(m.mtype) || set.has(m.mediaType)) return true
  for (const t of tipos) {
    if (m.message?.[t]) return true
  }

  const inner = desempaquetarMensaje(m.message)
  if (!inner) return false
  for (const t of tipos) {
    if (inner[t]) return true
  }
  return false
}

export function esComandoConPrefijo(m) {
  const texto = String(m.text || m.msg?.caption || '').trim()
  if (!texto) return false

  const escaparRegex = str => str.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&')
  const prefijo = global.prefix
  if (prefijo instanceof RegExp) return prefijo.test(texto)
  if (Array.isArray(prefijo)) {
    return prefijo.some(p => {
      const re = p instanceof RegExp ? p : new RegExp(`^${escaparRegex(String(p))}`)
      return re.test(texto)
    })
  }
  if (typeof prefijo === 'string' && prefijo) {
    return new RegExp(`^${escaparRegex(prefijo)}`).test(texto)
  }
  return false
}

/** Relee admin del grupo (LID) para no confiar solo en el flag viejo. */
export function esRemitenteAdminGrupo(m, conn, participants = [], esAdminFlag = false) {
  try {
    const part = findGroupParticipant(participants, m, conn)
    if (part?.admin === 'admin' || part?.admin === 'superadmin') return true
  } catch {}
  return !!esAdminFlag
}

export function clavesBorrado(m) {
  const remoteJid = m.key?.remoteJid || m.chat
  const id = m.key?.id
  const fromMe = !!m.key?.fromMe
  const participantes = [
    m.key?.participant,
    m.key?.participantAlt,
    m.participant,
    m.sender,
    m.senderPn,
  ].filter(Boolean)

  const keys = []
  // 1) key original intacta
  if (m.key) keys.push(m.key)

  // 2) variantes con distintos participant (LID / PN)
  for (const participant of participantes) {
    keys.push({ remoteJid, fromMe, id, participant })
  }

  // 3) sin participant (algunos grupos legacy)
  keys.push({ remoteJid, fromMe, id })

  return keys
}

export async function borrarMensajeAnti(m, conn, etiqueta = 'anti') {
  const keys = clavesBorrado(m)
  let ultimoError = null
  for (const key of keys) {
    try {
      await conn.sendMessage(m.chat, { delete: key })
      return true
    } catch (e) {
      ultimoError = e
    }
  }
  console.error(`[${etiqueta}] no se pudo borrar:`, ultimoError?.message || ultimoError)
  return false
}

/**
 * Flujo estándar anti-media.
 * @param {object} opts
 * @param {string} opts.dbKey - ej. 'antiImg'
 * @param {string[]} opts.tipos - ej. ['imageMessage']
 */
export async function manejarAntiMedia(m, conn, esAdmin, {
  dbKey,
  tipos,
  etiqueta = dbKey,
  participants = [],
} = {}) {
  if (!m?.isGroup || m.fromMe) return
  if (!global.db?.data?.[dbKey]?.[m.chat]) return
  if (!tieneTipoMedia(m, tipos)) return
  if (esComandoConPrefijo(m)) return

  if (esRemitenteAdminGrupo(m, conn, participants, esAdmin)) return false

  await borrarMensajeAnti(m, conn, etiqueta)
  return true
}
