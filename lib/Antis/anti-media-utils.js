/**
 * Utilidades compartidas para anti-img / sticker / video / audio.
 */

import { findGroupParticipant, findAdminBotConn } from '../group-participant.js'
import { modoAnti, expulsarParticipante } from './anti-modo.js'
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

/** Detecta el tipo de anti-media del mensaje (una sola pasada). */
export function detectarTipoAntiMedia(m) {
  if (!m) return null
  const orden = [
    ['stickerMessage', 'lottieStickerMessage'],
    ['imageMessage'],
    ['videoMessage'],
    ['audioMessage', 'pttMessage'],
    ['documentMessage'],
  ]
  const labels = ['sticker', 'image', 'video', 'audio', 'document']
  for (let i = 0; i < orden.length; i++) {
    if (tieneTipoMedia(m, orden[i])) return labels[i]
  }
  return null
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

export function esRemitenteAdminGrupo(m, conn, participants = [], _esAdminFlag = false) {
  try {
    const part = findGroupParticipant(participants, m, conn)
    if (part?.admin === 'admin' || part?.admin === 'superadmin') return true
  } catch {}
  return false
}

/**
 * Borrado rápido: 1–2 keys máx (original + alt si existe).
 * Antes se hacían N sendMessage en serie → se sentía lento.
 */
export async function borrarMensajeAnti(m, connPreferido, etiqueta = 'anti', participants = []) {
  const responsable = elegirBotResponsableGrupo(m.chat, participants)
  let connAdmin =
    (responsable && findAdminBotConn(participants, responsable)) ||
    findAdminBotConn(participants, connPreferido) ||
    connPreferido

  if (connPreferido && mismoSocketBot(connPreferido, connAdmin)) {
    connAdmin = connPreferido
  }

  const remoteJid = m.key?.remoteJid || m.chat
  const id = m.key?.id
  const fromMe = !!m.key?.fromMe
  const keys = []
  const seen = new Set()
  const push = (key) => {
    if (!key?.id && !id) return
    const k = {
      remoteJid: key.remoteJid || remoteJid,
      fromMe: key.fromMe ?? fromMe,
      id: key.id || id,
      ...(key.participant ? { participant: key.participant } : {}),
    }
    const sig = `${k.remoteJid}|${k.id}|${k.participant || ''}`
    if (seen.has(sig)) return
    seen.add(sig)
    keys.push(k)
  }

  // Prioridad: key cruda de WhatsApp (la más rápida y fiable)
  if (m.key) push({ ...m.key })
  if (m.key?.participantAlt && m.key.participantAlt !== m.key.participant) {
    push({
      remoteJid,
      fromMe,
      id,
      participant: m.key.participantAlt,
    })
  }

  if (!keys.length) {
    console.error(`[${etiqueta}] sin claves de borrado para ${id}`)
    return false
  }

  try {
    await connAdmin.sendMessage(m.chat, { delete: keys[0] })
  } catch (e) {
    if (keys[1]) {
      try {
        await connAdmin.sendMessage(m.chat, { delete: keys[1] })
      } catch (e2) {
        console.error(`[${etiqueta}] error borrando:`, e2?.message || e?.message || e2)
        return false
      }
    } else {
      console.error(`[${etiqueta}] error borrando:`, e?.message || e)
      return false
    }
  }
  return true
}

/**
 * Flujo anti-media (rápido): sin groupMetadata extra ni borrados en bucle.
 */
export async function manejarAntiMedia(m, conn, esAdmin, {
  dbKey,
  tipos,
  etiqueta = dbKey,
  participants = [],
} = {}) {
  if (!m?.isGroup || m.fromMe) return
  if (m._antiMediaDone) return
  const guardado = global.db?.data?.[dbKey]?.[m.chat]
  const modo = modoAnti(guardado, 'del')
  if (modo === 'off') return
  if (!tieneTipoMedia(m, tipos)) return
  if (esComandoConPrefijo(m)) return

  // Usar cache del handler; solo pedir metadata si viene vacío
  let partes = participants
  if (!partes?.length) {
    partes = conn.chats?.[m.chat]?.metadata?.participants || []
  }
  if (!partes?.length) {
    try {
      const fresco = await conn.groupMetadata(m.chat)
      partes = fresco?.participants || []
      if (fresco && conn.chats?.[m.chat]) conn.chats[m.chat].metadata = fresco
    } catch {
      partes = []
    }
  }

  if (!esteBotEsResponsableDelGrupo(conn, m.chat, partes)) return false
  if (esRemitenteAdminGrupo(m, conn, partes, esAdmin)) return false

  if (!findAdminBotConn(partes, conn)) {
    console.error(`[${etiqueta}] ningún bot Pain es admin en ${m.chat}`)
    return false
  }

  m._antiMediaDone = true
  await borrarMensajeAnti(m, conn, etiqueta, partes)
  if (modo === 'all') {
    const adminConn = findAdminBotConn(partes, conn) || conn
    await expulsarParticipante(adminConn, m.chat, m.sender, etiqueta)
  }
  return true
}
