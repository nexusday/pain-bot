/**
 * Utilidades compartidas para anti-img / sticker / video / audio.
 */

import { findGroupParticipant, findAdminBotConn } from '../group-participant.js'

/** Evita que N sockets Pain borren el mismo mensaje a la vez. */
const reclamosBorrado = new Map()

function reclamarBorradoAnti(chat, id) {
  if (!chat || !id) return true
  const key = `${chat}:${id}`
  const ahora = Date.now()
  const prev = reclamosBorrado.get(key)
  if (prev && ahora - prev < 12000) return false
  reclamosBorrado.set(key, ahora)
  if (reclamosBorrado.size > 800) {
    for (const [k, t] of reclamosBorrado) {
      if (ahora - t > 20000) reclamosBorrado.delete(k)
    }
  }
  return true
}

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

/**
 * Borra con la conexión Pain que SEA admin del grupo.
 * Si el socket que recibió el sticker no es admin, igual borra via principal/sub admin.
 */
export async function borrarMensajeAnti(m, conn, etiqueta = 'anti', participants = []) {
  const connAdmin = findAdminBotConn(participants, conn) || conn
  const keys = clavesBorrado(m)
  let ultimoError = null
  for (const key of keys) {
    try {
      await connAdmin.sendMessage(m.chat, { delete: key })
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

  let partes = participants
  if (!partes?.length) {
    try {
      partes = (await conn.groupMetadata(m.chat))?.participants || []
    } catch {
      partes = []
    }
  }

  if (esRemitenteAdminGrupo(m, conn, partes, esAdmin)) return false

  // Sin bot Pain admin: el delete de WhatsApp no funciona (edit=8 requiere admin)
  const connAdmin = findAdminBotConn(partes, conn)
  if (!connAdmin) {
    console.error(`[${etiqueta}] ningún bot Pain es admin en ${m.chat}`)
    return false
  }

  // Varios Pain en el grupo reciben el mismo sticker: solo uno reclama el borrado
  if (!reclamarBorradoAnti(m.chat, m.key?.id)) return true

  await borrarMensajeAnti(m, connAdmin, etiqueta, partes)
  return true
}
