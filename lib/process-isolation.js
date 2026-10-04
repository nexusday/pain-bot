import { randomUUID } from 'crypto'

export function assignSessions(sessions) {
  const assignments = new Map()
  const uniqueSessions = [...new Set(sessions.map(String))].sort()
  const validSessions = uniqueSessions.filter((session) => /^[a-zA-Z0-9_-]+$/.test(session))
  if (validSessions.length) assignments.set('subbot-group-0', validSessions)
  return assignments
}

export function removedSessions(previousSessions, nextSessions) {
  const previous = new Set(previousSessions.map(String))
  const next = new Set(nextSessions.map(String))
  if ([...next].some((session) => !previous.has(session))) return null
  const removed = [...previous].filter((session) => !next.has(session))
  return removed.length ? removed : null
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
