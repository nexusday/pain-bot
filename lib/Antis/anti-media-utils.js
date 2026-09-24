/**
 * Utilidades compartidas para anti-img / sticker / video / audio.
 */

import { findGroupParticipant, findAdminBotConn, participantJids } from '../group-participant.js'
import {
  esteBotEsResponsableDelGrupo,
  elegirBotResponsableGrupo,
} from '../../plugins/modo-sub.js'

function mismoSocketBot(a, b) {
  if (!a || !b) return false
  if (a === b) return true
  const dig = (c) => {
    const s = new Set()
    for (const v of [
      c?.user?.jid,
      c?.user?.id,
      c?.user?.lid,
      c?.phoneNumber,
      c?.botNumber,
      c?.authState?.creds?.me?.id,
      c?.authState?.creds?.me?.lid,
    ]) {
      const n = String(v || '').split('@')[0].split(':')[0].replace(/\D/g, '')
      if (n.length >= 6) s.add(n)
    }
    return s
  }
  const A = dig(a)
  const B = dig(b)
  for (const n of A) if (B.has(n)) return true
  return false
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

/**
 * Admin check estricto: solo el participante real del mensaje.
 */
export function esRemitenteAdminGrupo(m, conn, participants = [], _esAdminFlag = false) {
  try {
    const part = findGroupParticipant(participants, m, conn)
    if (part?.admin === 'admin' || part?.admin === 'superadmin') return true
  } catch {}
  return false
}

function uniqJids(list) {
  const out = []
  const seen = new Set()
  for (const j of list) {
    if (!j) continue
    const s = String(j)
    if (seen.has(s)) continue
    seen.add(s)
    out.push(s)
  }
  return out
}

/**
 * Claves de borrado: original + LID + PN del mensaje y del participante en metadata.
 */
export function clavesBorrado(m, conn, participants = []) {
  const remoteJid = m.key?.remoteJid || m.chat
  const id = m.key?.id
  const fromMe = !!m.key?.fromMe

  const participantes = uniqJids([
    m.key?.participant,
    m.key?.participantAlt,
    m.participant,
    m.participantPn,
    m.participantAlt,
    typeof m.sender === 'string' ? m.sender : null,
    m.senderPn,
  ])

  try {
    const part = findGroupParticipant(participants, m, conn)
    if (part) {
      for (const j of participantJids(part, conn)) participantes.push(j)
      if (part.phoneNumber) {
        const dig = String(part.phoneNumber).replace(/\D/g, '')
        if (dig.length >= 6) participantes.push(`${dig}@s.whatsapp.net`)
      }
      if (part.lid) {
        const dig = String(part.lid).replace(/\D/g, '')
        if (dig.length >= 6) {
          participantes.push(`${dig}@lid`)
          participantes.push(`${dig}@hosted.lid`)
        }
      }
    }
  } catch {}

  const keys = []
  const seen = new Set()
  const pushKey = (key) => {
    if (!key?.id && !id) return
    const k = {
      remoteJid: key.remoteJid || remoteJid,
      fromMe: key.fromMe ?? fromMe,
      id: key.id || id,
      ...(key.participant ? { participant: key.participant } : {}),
    }
    const sig = `${k.remoteJid}|${k.id}|${k.participant || ''}|${k.fromMe}`
    if (seen.has(sig)) return
    seen.add(sig)
    keys.push(k)
  }

  if (m.key) pushKey({ ...m.key })

  for (const participant of uniqJids(participantes)) {
    pushKey({ remoteJid, fromMe, id, participant })
  }

  pushKey({ remoteJid, fromMe, id })

  return keys
}

/**
 * Borra con el bot Pain admin. Preferencia: responsable del grupo si es admin,
 * si no cualquier Pain admin del grupo.
 */
export async function borrarMensajeAnti(m, connPreferido, etiqueta = 'anti', participants = []) {
  const responsable = elegirBotResponsableGrupo(m.chat, participants)
  // Orden: preferido → responsable → cualquier admin Pain
  let connAdmin =
    (responsable && findAdminBotConn(participants, responsable)) ||
    findAdminBotConn(participants, connPreferido) ||
    connPreferido

  // Si el preferido YA es admin, usarlo (misma sesión que recibió el msg)
  if (connPreferido && mismoSocketBot(connPreferido, connAdmin)) {
    connAdmin = connPreferido
  }

  const keys = clavesBorrado(m, connAdmin, participants)
  let ultimoError = null
  let intentos = 0

  for (const key of keys) {
    try {
      intentos++
      await connAdmin.sendMessage(m.chat, { delete: key })
    } catch (e) {
      ultimoError = e
    }
  }

  if (intentos === 0) {
    console.error(`[${etiqueta}] sin claves de borrado para ${m.key?.id}`)
    return false
  }
  if (ultimoError && keys.length === 1) {
    console.error(`[${etiqueta}] error borrando:`, ultimoError?.message || ultimoError)
  }
  return true
}

/**
 * Flujo estándar anti-media.
 * Solo el bot responsable del grupo (/modosub o principal en modo all) aplica el borrado.
 * Así 3 subbots admin no pelean el revoke con el principal.
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
  try {
    const fresco = await conn.groupMetadata(m.chat).catch(() => null)
    if (fresco?.participants?.length) {
      partes = fresco.participants
      if (conn.chats?.[m.chat]) {
        conn.chats[m.chat].metadata = fresco
      }
    }
  } catch {}
  if (!partes?.length) partes = participants || []

  // Gate crítico: con varios Pain admin, solo UNO borra
  if (!esteBotEsResponsableDelGrupo(conn, m.chat, partes)) return false

  if (esRemitenteAdminGrupo(m, conn, partes, esAdmin)) return false

  const connAdmin = findAdminBotConn(partes, conn)
  if (!connAdmin) {
    console.error(`[${etiqueta}] ningún bot Pain es admin en ${m.chat}`)
    return false
  }

  await borrarMensajeAnti(m, conn, etiqueta, partes)
  return true
}
