import test from 'node:test'
import assert from 'node:assert/strict'
import { conSocketEstable } from '../lib/socket-estable.js'

test('keeps the configured short keepalive interval for sub-bot sockets', () => {
  const options = conSocketEstable({ keepAliveIntervalMs: 10_000 })
  assert.equal(options.keepAliveIntervalMs, 10_000)
})

test('keeps primary sockets on the shared default keepalive interval', () => {
  const options = conSocketEstable()
  assert.equal(options.keepAliveIntervalMs, 30_000)
})
