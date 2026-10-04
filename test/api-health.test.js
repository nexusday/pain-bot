import test from 'node:test'
import assert from 'node:assert/strict'
import { crearVerificadorApi } from '../lib/api-health.js'

test('caches API health checks for the configured interval', async () => {
  let requests = 0
  let now = 1_000
  const disponible = crearVerificadorApi({
    fetchImpl: async () => {
      requests++
      return { status: 200, body: { destroy() {} } }
    },
    cacheMs: 30_000,
    now: () => now
  })

  assert.equal(await disponible('https://api.example/'), true)
  assert.equal(await disponible('https://api.example'), true)
  assert.equal(requests, 1)

  now += 30_001
  assert.equal(await disponible('https://api.example'), true)
  assert.equal(requests, 2)
})

test('treats failed requests and server errors as unavailable', async () => {
  const fetchImpl = async (url) => {
    if (url.includes('offline')) throw new Error('network down')
    return { status: 503, body: { destroy() {} } }
  }
  const disponible = crearVerificadorApi({ fetchImpl })

  assert.equal(await disponible('https://offline.example'), false)
  assert.equal(await disponible('https://error.example'), false)
})
