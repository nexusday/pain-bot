import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assignSessions,
  canStartSessions,
  requestSessionLease,
  SUBBOT_WORKER_COUNT
} from '../lib/process-isolation.js'
import { EventEmitter } from 'events'

test('distributes every valid sub-bot session across four stable worker groups', () => {
  const sessions = Array.from({ length: 80 }, (_, index) => `521${String(index).padStart(10, '0')}`)
  const grouped = assignSessions(sessions)
  const assigned = [...grouped.values()].flat()
  assert.equal(SUBBOT_WORKER_COUNT, 4)
  assert.equal(grouped.size, 4)
  assert.equal(assigned.length, sessions.length)
  assert.deepEqual(assigned.sort(), sessions.slice().sort())
  assert.deepEqual(assignSessions(sessions.slice().reverse()), grouped)
  assert.deepEqual(
    [...assignSessions([...sessions, sessions[0], '../invalid']).values()].flat().sort(),
    sessions.slice().sort()
  )
  assert.ok([...grouped.values()].every(group => group.length >= 10 && group.length <= 30))
})

test('does not start duplicate workers while another live worker owns a session', () => {
  const [[ownerId, target]] = assignSessions(['5211111111111'])
  const oldAssignment = new Map([[ownerId, target]])
  assert.equal(canStartSessions(target, oldAssignment, ownerId), true)
  assert.equal(canStartSessions(target, oldAssignment, 'other-worker'), false)

  oldAssignment.delete(ownerId)
  assert.equal(canStartSessions(target, oldAssignment, 'other-worker'), true)
})

test('session lease request waits for supervisor acknowledgement', async () => {
  const ipc = new EventEmitter()
  ipc.env = { PAIN_ROLE: 'primary' }
  ipc.send = (message, callback) => {
    callback?.()
    if (message.type === 'lease-session') {
      queueMicrotask(() => ipc.emit('message', {
        type: 'lease-session-ack',
        requestId: message.requestId,
        session: message.session
      }))
    }
  }
  assert.equal(await requestSessionLease('5211111111111', { processRef: ipc, timeoutMs: 100 }), true)
})
