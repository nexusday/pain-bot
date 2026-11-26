import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { BufferJSON } from '@whiskeysockets/baileys'
import { useMemoryAuthState, olvidarAuthStore } from '../lib/auth-store.js'

function carpetaTemporal() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pain-auth-'))
}

test('auth: guarda credenciales y claves, y las recupera tras reabrir', async () => {
  const dir = carpetaTemporal()
  try {
    const auth = await useMemoryAuthState(dir)
    auth.state.creds.registered = true
    auth.state.creds.me = { id: '123@s.whatsapp.net' }
    await auth.state.keys.set({
      session: { 'abc@s.whatsapp.net': { ratchet: 'x', buffer: Buffer.from([1, 2, 3]) } },
      'pre-key': { 7: { public: Buffer.from([9, 8]) } }
    })
    await auth.saveCreds(true)
    await auth.flush()
    await olvidarAuthStore(dir)

    const reabierto = await useMemoryAuthState(dir)
    assert.equal(reabierto.state.creds.registered, true)
    const sesion = await reabierto.state.keys.get('session', ['abc@s.whatsapp.net'])
    assert.equal(sesion['abc@s.whatsapp.net'].ratchet, 'x')
    assert.deepEqual(
      Buffer.from(sesion['abc@s.whatsapp.net'].buffer).toJSON().data,
      [1, 2, 3]
    )
    const prekey = await reabierto.state.keys.get('pre-key', [7])
    assert.deepEqual(Buffer.from(prekey[7].public).toJSON().data, [9, 8])
    await reabierto.close()
    await olvidarAuthStore(dir)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('auth: migra una clave del formato viejo (un fichero por clave)', async () => {
  const dir = carpetaTemporal()
  try {
    fs.writeFileSync(
      path.join(dir, 'session-vieja@s.whatsapp.net.json'),
      JSON.stringify({ indexInfo: { baseKey: 'valor' } }, BufferJSON.replacer),
      'utf8'
    )
    const auth = await useMemoryAuthState(dir)
    const valor = await auth.state.keys.get('session', ['vieja@s.whatsapp.net'])
    assert.equal(valor['vieja@s.whatsapp.net'].indexInfo.baseKey, 'valor')
    await auth.flush()
    await auth.close()
    await olvidarAuthStore(dir)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('auth: reproduce diarios pendientes y descarta los ya incluidos en el snapshot', async () => {
  const dir = carpetaTemporal()
  try {
    fs.writeFileSync(
      path.join(dir, 'auth-keys.json'),
      JSON.stringify({ v: 2, keyT: 1000, keys: { preKeys: { 1: { id: 1 } } } }, BufferJSON.replacer),
      'utf8'
    )
    const entrada = (id) => JSON.stringify({ c: 'preKeys', u: [[id, { id }]] }, BufferJSON.replacer) + '\n'
    // Ya está dentro del snapshot (corte 500 <= keyT 1000): se ignora y borra.
    fs.writeFileSync(path.join(dir, 'auth-keys.journal-500.ndjson'), entrada(3), 'utf8')
    // Posterior al snapshot: se reproduce y queda pendiente de compactar.
    fs.writeFileSync(path.join(dir, 'auth-keys.journal-2000.ndjson'), entrada(2), 'utf8')

    const auth = await useMemoryAuthState(dir)
    const claves = await auth.state.keys.get('pre-key', [1, 2, 3])
    assert.deepEqual(claves[1], { id: 1 })
    assert.deepEqual(claves[2], { id: 2 })
    assert.equal(claves[3] ?? null, null)
    assert.equal(fs.existsSync(path.join(dir, 'auth-keys.journal-500.ndjson')), false)
    assert.equal(fs.existsSync(path.join(dir, 'auth-keys.journal-2000.ndjson')), true)

    await auth.flush()
    await olvidarAuthStore(dir)
    const nombres = fs.readdirSync(dir)
    assert.equal(nombres.some((n) => n.startsWith('auth-keys.journal-')), false)

    const reabierto = await useMemoryAuthState(dir)
    const despues = await reabierto.state.keys.get('pre-key', [1, 2])
    assert.deepEqual(despues[1], { id: 1 })
    assert.deepEqual(despues[2], { id: 2 })
    await reabierto.close()
    await olvidarAuthStore(dir)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('auth: borrar una clave la elimina también del snapshot', async () => {
  const dir = carpetaTemporal()
  try {
    const auth = await useMemoryAuthState(dir)
    await auth.state.keys.set({ 'pre-key': { 1: { id: 1 } } })
    await auth.state.keys.set({ 'pre-key': { 1: null } })
    await auth.flush()
    await olvidarAuthStore(dir)
    const reabierto = await useMemoryAuthState(dir)
    const valor = await reabierto.state.keys.get('pre-key', [1])
    assert.equal(valor[1] ?? null, null)
    await reabierto.close()
    await olvidarAuthStore(dir)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
