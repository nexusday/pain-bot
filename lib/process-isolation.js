import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'

export function normalizeMode(mode) {
  const value = Number(mode)
  return value === 1 || value === 2 ? value : null
}

export function resolveMode({ storedMode, configuredIsolation = false } = {}) {
  return normalizeMode(storedMode) || (configuredIsolation === true ? 2 : 1)
}

export function limitModeToConfiguration(mode, configuredIsolation = false) {
  return mode === 2 && configuredIsolation !== true ? 1 : mode
}

export function readModeState(filePath, configuredIsolation = false) {
  let storedMode = null
  try {
    if (existsSync(filePath)) {
      storedMode = JSON.parse(readFileSync(filePath, 'utf8'))?.mode
    }
  } catch {}
  return resolveMode({ storedMode, configuredIsolation })
}

export function writeModeState(filePath, mode) {
  const normalized = normalizeMode(mode)
  if (!normalized) throw new TypeError('El modo debe ser 1 o 2')
  const directory = path.dirname(filePath)
  mkdirSync(directory, { recursive: true })
  const tempPath = `${filePath}.tmp`
  writeFileSync(tempPath, `${JSON.stringify({ mode: normalized, updatedAt: new Date().toISOString() }, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600
  })
  renameSync(tempPath, filePath)
  return normalized
}

function groupForSession(session) {
  let hash = 2166136261
  for (const character of String(session)) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) % 2
}

export function assignSessions(mode, sessions) {
  const normalized = normalizeMode(mode)
  if (!normalized) throw new TypeError('El modo debe ser 1 o 2')
  const assignments = new Map()
  const uniqueSessions = [...new Set(sessions.map(String))].sort()
  for (const session of uniqueSessions) {
    if (!/^[a-zA-Z0-9_-]+$/.test(session)) continue
    const workerId = normalized === 2
      ? `subbot-${encodeURIComponent(session)}`
      : `subbot-group-${groupForSession(session)}`
    if (!assignments.has(workerId)) assignments.set(workerId, [])
    assignments.get(workerId).push(session)
  }
  return assignments
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

export function acceptModeRequest({ senderRole, authenticatedOwner, mode }) {
  return senderRole === 'primary' && authenticatedOwner === true && normalizeMode(mode) !== null
}
