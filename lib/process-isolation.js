import { randomUUID } from 'crypto'

export const SUBBOT_WORKER_COUNT = 4

function workerIndex(session, workerCount) {
  let hash = 2166136261
  for (const character of session) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) % workerCount
}

export function assignSessions(sessions, workerCount = SUBBOT_WORKER_COUNT) {
  if (!Number.isInteger(workerCount) || workerCount < 1) {
    throw new RangeError('workerCount debe ser un entero positivo')
  }

  const assignments = new Map()
  const uniqueSessions = [...new Set(sessions.map(String))].sort()
  const validSessions = uniqueSessions.filter((session) => /^[a-zA-Z0-9_-]+$/.test(session))
  for (const session of validSessions) {
    const id = `subbot-group-${workerIndex(session, workerCount)}`
    if (!assignments.has(id)) assignments.set(id, [])
    assignments.get(id).push(session)
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
