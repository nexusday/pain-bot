import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import { createRpcClient, serveRpc, RPC_REQUEST, RPC_RESPONSE } from '../lib/webpanel/ipc.js'

function channels() {
  const a = new EventEmitter()
  const b = new EventEmitter()
  a.connected = b.connected = true
  a.send = (message, cb) => { queueMicrotask(() => b.emit('message', message)); cb?.(); return true }
  b.send = (message, cb) => { queueMicrotask(() => a.emit('message', message)); cb?.(); return true }
  return [a, b]
}

test('webpanel IPC: lista de operaciones permitidas, límites y desconexión', async () => {
  const [client, server] = channels()
  let finish
  const stop = serveRpc(server, { ping: () => 'pong', wait: () => new Promise((resolve) => { finish = resolve }) }, { limit: 1 })
  const rpc = createRpcClient(client, { limit: 2 })
  try {
    assert.equal(await rpc.call('ping'), 'pong')
    await assert.rejects(rpc.call('constructor'), { code: 'runtime_invalid' })
    await assert.rejects(rpc.call('eval', 'process.exit()'), { code: 'runtime_invalid' })
    const waiting = rpc.call('wait')
    await assert.rejects(rpc.call('ping'), { code: 'runtime_busy' })
    finish('done')
    assert.equal(await waiting, 'done')
    const disconnected = rpc.call('wait')
    client.connected = false
    client.emit('disconnect')
    await assert.rejects(disconnected, { code: 'runtime_unavailable' })
    finish?.('done')
  } finally { rpc.close(); stop() }
})

test('webpanel IPC: rechaza mensajes demasiado grandes sin ejecutar operaciones', async () => {
  const [client, server] = channels()
  let called = false
  const stop = serveRpc(server, { save: () => { called = true } })
  try {
    const response = new Promise((resolve) => client.once('message', resolve))
    client.send({ type: RPC_REQUEST, id: 'test', method: 'save', args: ['x'.repeat(33_000)] })
    const result = await response
    assert.equal(result.type, RPC_RESPONSE)
    assert.equal(result.error.code, 'runtime_invalid')
    assert.equal(called, false)
  } finally { stop() }
})
