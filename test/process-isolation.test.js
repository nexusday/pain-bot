import test from 'node:test'
import assert from 'node:assert/strict'
import {
  acceptModeRequest,
  assignSessions,
  canStartSessions,
  limitModeToConfiguration,
  readModeState,
  requestSessionLease,
  resolveMode,
  writeModeState
} from '../lib/process-isolation.js'
import { mkdtempSync, readFileSync, rmSync } from 'fs'
import path from 'path'
import { EventEmitter } from 'events'

test('saved process mode takes precedence over the configured default', () => {
  assert.equal(resolveMode({ storedMode: 2, configuredIsolation: false }), 2)
  assert.equal(resolveMode({ storedMode: 0, configuredIsolation: true }), 2)
  assert.equal(resolveMode({ storedMode: null, configuredIsolation: false }), 1)
})

test('saved mode 2 is limited to mode 1 when high-isolation mode is not configured', () => {
  assert.equal(limitModeToConfiguration(2, false), 1)
  assert.equal(limitModeToConfiguration(2, true), 2)
  assert.equal(limitModeToConfiguration(1, false), 1)
})

test('mode state persists only valid modes', () => {
  const directory = mkdtempSync(path.join(process.cwd(), `.test-process-mode-${process.pid}-`))
  const filePath = path.join(directory, 'mode.json')
  try {
    writeModeState(filePath, 2)
    assert.equal(readModeState(filePath, false), 2)
    assert.equal(JSON.parse(readFileSync(filePath, 'utf8')).mode, 2)
    writeModeState(filePath, 1)
    assert.equal(readModeState(filePath, true), 1)
    assert.throws(() => writeModeState(filePath, 3), /modo debe ser 1 o 2/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('mode 1 groups sessions while mode 2 gives each session a stable worker', () => {
  const sessions = ['5212222222222', '5211111111111', '5213333333333']
  const grouped = assignSessions(1, sessions)
  assert.ok([...grouped.keys()].every((id) => /^subbot-group-[01]$/.test(id)))
  assert.equal([...grouped.values()].flat().length, sessions.length)
  assert.deepEqual([...grouped.values()].flat().sort(), sessions.slice().sort())

  const isolated = assignSessions(2, sessions)
  assert.equal(isolated.size, sessions.length)
  assert.deepEqual([...isolated.values()].flat().sort(), sessions.slice().sort())
  assert.deepEqual([...assignSessions(2, sessions).entries()], [...isolated.entries()])
})

test('mode transitions cannot start a new worker while another live worker owns its session', () => {
  const oldAssignment = new Map([['subbot-group-0', ['5211111111111', '5212222222222']]])
  const modeTwoTarget = assignSessions(2, ['5211111111111']).get('subbot-5211111111111')
  assert.equal(canStartSessions(modeTwoTarget, oldAssignment, 'subbot-5211111111111'), false)

  oldAssignment.delete('subbot-group-0')
  assert.equal(canStartSessions(modeTwoTarget, oldAssignment, 'subbot-5211111111111'), true)
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

test('IPC accepts mode changes only from the authenticated primary owner', () => {
  assert.equal(acceptModeRequest({ senderRole: 'primary', authenticatedOwner: true, mode: 1 }), true)
  assert.equal(acceptModeRequest({ senderRole: 'subbot', authenticatedOwner: true, mode: 2 }), false)
  assert.equal(acceptModeRequest({ senderRole: 'primary', authenticatedOwner: false, mode: 2 }), false)
  assert.equal(acceptModeRequest({ senderRole: 'primary', authenticatedOwner: true, mode: 3 }), false)
})
