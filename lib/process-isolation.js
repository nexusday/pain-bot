import { randomUUID } from 'crypto'
import { existsSync, readFileSync } from 'fs'

export const DEFAULT_SUBBOT_GROUPS = 5
const MAX_SUBBOT_GROUPS = 8

export function configuredGroupCount(env = process.env) {
  const value = Number.parseInt(env?.PAIN_SUBBOT_WORKERS, 10)
  if (!Number.isInteger(value)) return DEFAULT_SUBBOT_GROUPS
  return Math.min(Math.max(value, 1), MAX_SUBBOT_GROUPS)
}

// El grupo depende solo del nombre de la sesión: añadir o quitar una no mueve a las demás.
export function groupIdForSession(session, groupCount = configuredGroupCount()) {
  let hash = 0x811c9dc5
  for (const char of String(session)) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193) >>> 0
  }
  hash = Math.imul(hash ^ (hash >>> 15), 0x2c1b3c6d) >>> 0
  hash = Math.imul(hash ^ (hash >>> 12), 0x297a2d39) >>> 0
  hash = (hash ^ (hash >>> 15)) >>> 0
  return `subbot-group-${hash % groupCount}`
}

export function assignSessions(sessions, groupCount = configuredGroupCount()) {
  const uniqueSessions = [...new Set(sessions.map(String))].sort()
  const validSessions = uniqueSessions.filter((session) => /^[a-zA-Z0-9_-]+$/.test(session))
  const groups = new Map()
  for (const session of validSessions) {
    const id = groupIdForSession(session, groupCount)
    if (!groups.has(id)) groups.set(id, [])
    groups.get(id).push(session)
  }
  return new Map([...groups].sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true })))
}

export function removedSessions(previousSessions, nextSessions) {
  const previous = new Set(previousSessions.map(String))
  const next = new Set(nextSessions.map(String))
  if ([...next].some((session) => !previous.has(session))) return null
  const removed = [...previous].filter((session) => !next.has(session))
  return removed.length ? removed : null
}

export function addedSessions(previousSessions, nextSessions) {
  const previous = new Set(previousSessions.map(String))
  const next = new Set(nextSessions.map(String))
  if ([...previous].some((session) => !next.has(session))) return null
  const added = [...next].filter((session) => !previous.has(session))
  return added.length ? added : null
}

export function canStartSessions(sessions, liveAssignments, workerId = null) {
  const requested = new Set(sessions.map(String))
  for (const [ownerId, ownedSessions] of liveAssignments) {
    if (ownerId === workerId) continue
    if (ownedSessions.some((session) => requested.has(String(session)))) return false
  }
  return true
}

export function requestSessionLease(session, { processRef = process, timeoutMs = 15_000 } = {}) {
  if (processRef.env?.PAIN_ROLE !== 'primary' || typeof processRef.send !== 'function') {
    return Promise.resolve(false)
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(String(session))) return Promise.resolve(false)

  const requestId = randomUUID()
  return new Promise((resolve) => {
    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      processRef.off('message', onMessage)
      if (!result) releaseSessionLease(session, { processRef })
      resolve(result)
    }
    const onMessage = (message) => {
      if (message?.type === 'lease-session-ack' && message.requestId === requestId &&
          message.session === session) finish(true)
    }
    const timer = setTimeout(() => finish(false), timeoutMs)
    processRef.on('message', onMessage)
    processRef.send({ type: 'lease-session', requestId, session }, (error) => {
      if (error) finish(false)
    })
  })
}

export function releaseSessionLease(session, { processRef = process } = {}) {
  if (processRef.env?.PAIN_ROLE !== 'primary' || typeof processRef.send !== 'function') return false
  if (!/^[a-zA-Z0-9_-]+$/.test(String(session))) return false
  processRef.send({ type: 'release-session', session })
  return true
}

export function confirmSessionLease(session, { processRef = process } = {}) {
  if (processRef.env?.PAIN_ROLE !== 'subbot' || typeof processRef.send !== 'function') return false
  if (!/^[a-zA-Z0-9_-]+$/.test(String(session))) return false
  processRef.send({ type: 'session-removed', session })
  return true
}

function esperarAck(processRef, requestId, ackType, timeoutMs = 20_000) {
  return new Promise((resolve) => {
    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      processRef.off('message', onMessage)
      resolve(result)
    }
    const onMessage = (message) => {
      if (message?.type === ackType && message.requestId === requestId) finish(message)
    }
    const timer = setTimeout(() => finish(null), timeoutMs)
    timer.unref?.()
    processRef.on('message', onMessage)
  })
}

export async function requestReconnectOne(session, { processRef = process, timeoutMs = 20_000 } = {}) {
  if (processRef.env?.PAIN_ROLE !== 'primary' || typeof processRef.send !== 'function') {
    return null
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(String(session))) return null
  const requestId = randomUUID()
  const ackPromise = esperarAck(processRef, requestId, 'reconnect-one-ack', timeoutMs)
  const queued = processRef.send({ type: 'request-reconnect-one', requestId, session }, () => {})
  if (!queued) return null
  return ackPromise
}

export async function requestReconnectAll({ processRef = process, timeoutMs = 30_000 } = {}) {
  if (processRef.env?.PAIN_ROLE !== 'primary' || typeof processRef.send !== 'function') {
    return null
  }
  const requestId = randomUUID()
  const ackPromise = esperarAck(processRef, requestId, 'reconnect-all-ack', timeoutMs)
  const queued = processRef.send({ type: 'request-reconnect-all', requestId }, () => {})
  if (!queued) return null
  return ackPromise
}

/**
 * Pide al supervisor que cada worker mande el mensaje al owner desde sus
 * sub-bots (cada sub-bot escribe en su propio privado, no el principal).
 */
export async function requestEnviarPrivadoSubBots({
  processRef = process,
  jid,
  text,
  timeoutMs = 180_000,
} = {}) {
  if (processRef.env?.PAIN_ROLE !== 'primary' || typeof processRef.send !== 'function') {
    return null
  }
  const destino = String(jid || '').trim()
  const contenido = String(text || '')
  if (!destino || !contenido) return null
  const requestId = randomUUID()
  const ackPromise = esperarAck(processRef, requestId, 'subme-ack', timeoutMs)
  const queued = processRef.send({ type: 'request-send-private', requestId, jid: destino, text: contenido }, () => {})
  if (!queued) return null
  return ackPromise
}

/**
 * ¿La sesión del bot principal ya está vinculada?
 * Baileys escribe `creds.json` antes de terminar el emparejamiento, así que
 * solo cuenta cuando el propio archivo dice `registered: true`.
 */
export function sesionPrincipalRegistrada(rutaCreds) {
  try {
    if (!rutaCreds || !existsSync(rutaCreds)) return false
    const datos = JSON.parse(readFileSync(rutaCreds, 'utf8'))
    return datos?.registered === true
  } catch {
    return false
  }
}

/**
 * Los sub-bots solo conectan cuando el bot principal ya está vinculado:
 * durante el emparejamiento no tiene sentido levantar 150 sub-bots.
 */
export function subBotsPermitidos({ principalVinculado = false, sesionRegistrada = false } = {}) {
  return Boolean(principalVinculado || sesionRegistrada)
}
