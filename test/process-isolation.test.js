import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assignSessions,
  canStartSessions,
  requestSessionLease,
  removedSessions
} from '../lib/process-isolation.js'
import { EventEmitter } from 'events'

test('assigns all valid sub-bots to the single shared worker', () => {
  const sessions = Array.from({ length: 80 }, (_, index) => `521${String(index).padStart(10, '0')}`)
  const grouped = assignSessions(sessions)
  assert.deepEqual([...grouped.keys()], ['subbot-group-0'])
  assert.equal(grouped.get('subbot-group-0').length, sessions.length)
  assert.deepEqual(grouped.get('subbot-group-0'), sessions.slice().sort())
  assert.deepEqual(assignSessions(sessions.slice().reverse()), grouped)
  assert.deepEqual(
    assignSessions([...sessions, sessions[0], '../invalid']).get('subbot-group-0'),
    sessions.slice().sort()
  )
})

test('does not start duplicate workers while another live worker owns a session', () => {
  const [[ownerId, target]] = assignSessions(['5211111111111'])
  const oldAssignment = new Map([[ownerId, target]])
  assert.equal(canStartSessions(target, oldAssignment, ownerId), true)
  assert.equal(canStartSessions(target, oldAssignment, 'other-worker'), false)

  oldAssignment.delete(ownerId)
  assert.equal(canStartSessions(target, oldAssignment, 'other-worker'), true)
})

test('removes sessions from a running worker without treating additions as removals', () => {
  assert.deepEqual(
    removedSessions(['one', 'two', 'three'], ['one', 'three']),
    ['two']
  )
  assert.equal(removedSessions(['one'], ['one', 'two']), null)
  assert.equal(removedSessions(['one'], ['one']), null)
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
