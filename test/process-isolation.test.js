import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assignSessions,
  configuredGroupCount,
  groupIdForSession,
  addedSessions,
  canStartSessions,
  requestSessionLease,
  removedSessions
} from '../lib/process-isolation.js'
import { EventEmitter } from 'events'

test('splits sub-bots into stable groups without losing or duplicating sessions', () => {
  const sessions = Array.from({ length: 80 }, (_, index) => `521${String(index).padStart(10, '0')}`)
  const grouped = assignSessions(sessions, 3)
  assert.ok(grouped.size > 1 && grouped.size <= 3)
  const all = [...grouped.values()].flat()
  assert.deepEqual(all.slice().sort(), sessions.slice().sort())
  for (const [id, list] of grouped) {
    assert.ok(list.length > 80 / 3 / 2, `${id} qued� casi vac�o`)
    for (const session of list) assert.equal(groupIdForSession(session, 3), id)
  }
  assert.deepEqual(assignSessions(sessions.slice().reverse(), 3), grouped)
  const withExtra = assignSessions([...sessions, sessions[0], '../invalid', 'nueva'], 3)
  for (const [id, list] of grouped) {
    assert.deepEqual(withExtra.get(id).filter(s => s !== 'nueva'), list)
  }
})

test('group count comes from PAIN_SUBBOT_WORKERS and is clamped', () => {
  assert.equal(configuredGroupCount({}), 3)
  assert.equal(configuredGroupCount({ PAIN_SUBBOT_WORKERS: '1' }), 1)
  assert.equal(configuredGroupCount({ PAIN_SUBBOT_WORKERS: '99' }), 8)
  assert.equal(configuredGroupCount({ PAIN_SUBBOT_WORKERS: '0' }), 1)
  assert.equal(configuredGroupCount({ PAIN_SUBBOT_WORKERS: 'x' }), 3)
  assert.deepEqual([...assignSessions(['a', 'b', 'c'], 1).keys()], ['subbot-group-0'])
})
test('does not start duplicate workers while another live worker owns a session', () => {
  const [[ownerId, target]] = assignSessions(['5211111111111'], 3)
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
  assert.deepEqual(addedSessions(['one'], ['one', 'two']), ['two'])
  assert.equal(addedSessions(['one', 'two'], ['one']), null)
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
