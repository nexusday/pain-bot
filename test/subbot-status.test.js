import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  readSubbotWorkerStatuses,
  removeSubbotWorkerStatus,
  writeSubbotWorkerStatus,
} from '../lib/subbot-status.js'

test('publishes and reads connection state shared by isolated workers', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'painbot-status-'))
  try {
    writeSubbotWorkerStatus(root, 'subbot-group-0', [
      { folder: '573001112233', number: '573001112233', connected: true },
      { folder: '573009998877', number: '573009998877', connected: false },
      { folder: '../invalid', connected: true },
    ])

    const statuses = readSubbotWorkerStatuses(root)
    assert.equal(statuses.length, 1)
    assert.equal(statuses[0].workerId, 'subbot-group-0')
    assert.deepEqual(statuses[0].sessions.map(({ folder }) => folder), [
      '573001112233',
      '573009998877',
    ])
    assert.equal(removeSubbotWorkerStatus(root, 'subbot-group-0'), true)
    assert.deepEqual(readSubbotWorkerStatuses(root), [])
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('ignores stale worker status instead of reporting an offline worker as connected', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'painbot-status-'))
  try {
    writeSubbotWorkerStatus(root, 'subbot-one', [
      { folder: '573001112233', number: '573001112233', connected: true },
    ])

    assert.deepEqual(readSubbotWorkerStatuses(root, { now: Date.now() + 61_000 }), [])
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
