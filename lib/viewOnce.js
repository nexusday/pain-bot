import { extractMessageContent } from '@whiskeysockets/baileys'
import { findGroupParticipant } from './group-participant.js'

const TIPOS_VER_UNA_VEZ = new Set([
  'viewOnceMessage',
  'viewOnceMessageV2',
  'viewOnceMessageV2Extension',
  'ephemeralMessage'
])

const CLAVES_OMITIR = new Set(['messageContextInfo', 'senderKeyDistributionMessage'])
const MAX_IDS_VER_UNA_VEZ = 500
const MAX_RAW_VER_UNA_VEZ = 200

const escuchadores = new WeakSet()

function asegurarCaches() {
  if (!global.viewOnceIds) global.viewOnceIds = new Set()
  if (!global.viewOnceRawCache) global.viewOnceRawCache = new Map()
}

export function buscarEnvoltorioVerUnaVez(obj, profundidad = 0) {
  if (!obj || typeof obj !== 'object' || profundidad > 5) return false

  for (const clave of Object.keys(obj)) {
    if (CLAVES_OMITIR.has(clave)) continue
    if (TIPOS_VER_UNA_VEZ.has(clave) || /viewonce/i.test(clave)) return true
    const anidado = obj[clave]?.message
    if (anidado && buscarEnvoltorioVerUnaVez(anidado, profundidad + 1)) return true
  }
  return false
}

export function esMediaVerUnaVez(mediaMsg) {
  return mediaMsg?.viewOnce === true
}

function obtenerCuerpoMensaje(entrada) {
  return entrada?.message || entrada?.msg || null
}

function obtenerIdMensaje(entrada) {
  return entrada?.id || entrada?.key?.id || null
}

export function esRawVerUnaVez(raw, key) {
  if (!raw) return false
  const contenido = extractMessageContent(raw)
  return buscarEnvoltorioVerUnaVez(raw)
    || esMediaVerUnaVez(contenido?.imageMessage)
    || esMediaVerUnaVez(contenido?.videoMessage)
    || key?.isViewOnce === true
}

export function esCandidatoVerUnaVez(m) {
  if (!m) return false
  return esRawVerUnaVez(obtenerCuerpoMensaje(m), m.key)
}

export function esVerUnaVezConocido(id) {
  asegurarCaches()
  return !!(id && global.viewOnceIds.has(id))
}

export function marcarMensajeVerUnaVez(entrada) {
  asegurarCaches()
  const id = obtenerIdMensaje(entrada)
  const raw = obtenerCuerpoMensaje(entrada)
  if (!id || !raw) return
  if (!esRawVerUnaVez(raw, entrada?.key)) return

  global.viewOnceIds.add(id)
  if (global.viewOnceIds.size > MAX_IDS_VER_UNA_VEZ) {
    global.viewOnceIds.delete(global.viewOnceIds.values().next().value)
  }
}

export function cachearRawVerUnaVez(entrada) {
  asegurarCaches()
  const id = entrada?.key?.id
  const raw = entrada?.message
  if (!id || !raw) return
  if (!esRawVerUnaVez(raw, entrada.key)) return

  global.viewOnceRawCache.set(id, JSON.parse(JSON.stringify(entrada)))
  if (global.viewOnceRawCache.size > MAX_RAW_VER_UNA_VEZ) {
    const primero = global.viewOnceRawCache.keys().next().value
    global.viewOnceRawCache.delete(primero)
  }
}

export function obtenerRawVerUnaVezCacheado(id) {
  asegurarCaches()
  return id ? global.viewOnceRawCache.get(id) || null : null
}

export function obtenerClavesMensaje(msg) {
  if (!msg || typeof msg !== 'object') return []
  return Object.keys(msg).filter((k) => !CLAVES_OMITIR.has(k))
}

export function extraerContenidoMedia(raw) {
  if (!raw) return null
  const contenido = extractMessageContent(raw)
  if (contenido?.imageMessage) return { type: 'image', mediaMsg: contenido.imageMessage }
  if (contenido?.videoMessage) return { type: 'video', mediaMsg: contenido.videoMessage }
  return null
}

export function puntuarMensajeGuardado(entrada) {
  if (!entrada?.message) return -1
  if (buscarEnvoltorioVerUnaVez(entrada.message)) return 3
  const media = extraerContenidoMedia(entrada.message)
  if (media && esMediaVerUnaVez(media.mediaMsg)) return 2
  if (entrada.key?.isViewOnce === true) return 2
  return media ? 0 : -1
}

export function detectarVerUnaVez(raw, mediaMsg, stored, quotedId) {
  return buscarEnvoltorioVerUnaVez(raw)
    || esMediaVerUnaVez(mediaMsg)
    || stored?.key?.isViewOnce === true
    || esVerUnaVezConocido(quotedId)
}

export function iniciarAntiEscuchaVerUnaVez(conn) {
  asegurarCaches()
  if (!conn || escuchadores.has(conn)) return
  escuchadores.add(conn)
}

export async function ejecutarAntiVerUnaVez(conn, m) {
  if (!m?.isGroup || m.fromMe || !esCandidatoVerUnaVez(m)) return false

  marcarMensajeVerUnaVez(m)
  cachearRawVerUnaVez({ key: m.key, message: m.message })

  if (!global.db?.data?.antiViewOnce?.[m.chat]) return false

  try {
    const metadata = conn.chats?.[m.chat]?.metadata || await conn.groupMetadata(m.chat).catch(() => null)
    const participants = metadata?.participants || []
    const user = findGroupParticipant(participants, m, conn) || {}
    const isAdmin = user?.admin === 'admin' || user?.admin === 'superadmin'

    if (isAdmin) return false

    await conn.sendMessage(m.chat, { delete: m.key })
    return true
  } catch (e) {
    console.error('[viewOnce] anti delete error:', e.message)
    return false
  }
}

export {
  buscarEnvoltorioVerUnaVez as findViewOnceWrapper,
  esMediaVerUnaVez as isViewOnceMedia,
  esRawVerUnaVez as isViewOnceRaw,
  esCandidatoVerUnaVez as isViewOnceCandidate,
  esVerUnaVezConocido as isKnownViewOnce,
  marcarMensajeVerUnaVez as markViewOnceMessage,
  cachearRawVerUnaVez as cacheViewOnceRaw,
  obtenerRawVerUnaVezCacheado as getCachedViewOnceRaw,
  obtenerClavesMensaje as getMessageKeys,
  extraerContenidoMedia as extractMediaContent,
  puntuarMensajeGuardado as scoreStoredMessage,
  detectarVerUnaVez as detectViewOnce,
  iniciarAntiEscuchaVerUnaVez as initViewOnceAntiListener,
  ejecutarAntiVerUnaVez as runAntiViewOnce
}
