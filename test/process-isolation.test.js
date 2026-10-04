import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assignSessions,
  canStartSessions,
  requestSessionLease,
} from '../lib/process-isolation.js'
import { EventEmitter } from 'events'

test('assigns every valid sub-bot session to the single shared worker', () => {
  const sessions = ['5212222222222', '5211111111111', '5213333333333']
  const grouped = assignSessions(sessions)
  assert.deepEqual([...grouped.keys()], ['subbot-group-0'])
  assert.equal([...grouped.values()].flat().length, sessions.length)
  assert.deepEqual([...grouped.values()].flat().sort(), sessions.slice().sort())
  assert.deepEqual(assignSessions([...sessions, sessions[0], '../invalid']).get('subbot-group-0'), sessions.slice().sort())
})

test('does not start duplicate workers while another live worker owns a session', () => {
  const oldAssignment = new Map([['subbot-group-0', ['5211111111111', '5212222222222']]])
  const target = assignSessions(['5211111111111']).get('subbot-group-0')
  assert.equal(canStartSessions(target, oldAssignment, 'subbot-group-0'), true)
  assert.equal(canStartSessions(target, oldAssignment, 'other-worker'), false)

  oldAssignment.delete('subbot-group-0')
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
