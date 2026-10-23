import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { startIsolatedWebPanel } from '../lib/webpanel/isolated.js'
import { PanelStore } from '../lib/webpanel/store.js'
import { hashPassword } from '../lib/webpanel/auth.js'

test('webpanel aislado: un cierre HTTP no termina el bot y se recupera conservando sesiones', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pain-panel-isolation-'))
  const root = path.join(dir, 'Serbot')
  fs.mkdirSync(root, { recursive: true })
  const oldDb = global.db
  const oldReset = process.env.PAIN_WEB_ADMIN_RESET
  process.env.PAIN_WEB_ADMIN_RESET = '1'
  global.db = { data: { antipv: {} }, write: async () => {} }
  let handle
  let store
  t.after(async () => {
    await handle?.close()
    await store?.close()
    global.db = oldDb
    if (oldReset === undefined) delete process.env.PAIN_WEB_ADMIN_RESET
    else process.env.PAIN_WEB_ADMIN_RESET = oldReset
    fs.rmSync(dir, { recursive: true, force: true })
  })
  handle = await startIsolatedWebPanel({
    host: '127.0.0.1', port: 0, dataDir: dir, root,
    publicUrl: 'http://127.0.0.1', adminUser: 'admin', adminPass: 'admin12345',
  })
  assert.ok(handle.isolated)
  assert.notEqual(handle.pid, process.pid)
  const botPid = process.pid
  const base = `http://127.0.0.1:${handle.config.port}`
  assert.equal((await fetch(base + '/healthz')).status, 200)
  const login = await fetch(base + '/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin12345' }),
  })
  const auth = await login.json()
  const cookie = login.headers.get('set-cookie').split(';')[0]
  assert.equal(auth.user.isPrincipal, true)
  store = await new PanelStore(path.join(dir, 'webpanel.sqlite')).init()
  await store.actualizarUsuario(auth.user.id, { passwordHash: await hashPassword('changedpassword123') })
  const phone = '5215512345678'
  fs.mkdirSync(path.join(root, phone))
  await store.upsertBot({ userId: auth.user.id, phone, folder: phone, status: 'linked' })
  const changed = await fetch(`${base}/api/bots/${phone}/config`, {
    method: 'PATCH', headers: { cookie, 'x-csrf-token': auth.csrf, 'content-type': 'application/json' },
    body: JSON.stringify({ antiPv: true }),
  })
  assert.equal(changed.status, 200)
  assert.equal(global.db.data.antipv[phone], true)
  const oldPid = handle.pid
  process.kill(oldPid, 'SIGKILL')
  let recovered = false
  for (let i = 0; i < 80; i++) {
    await delay(100)
    if (!handle.pid || handle.pid === oldPid) continue
    try {
      const me = await fetch(base + '/api/auth/me', { headers: { cookie }, signal: AbortSignal.timeout(500) })
      if (me.status === 200) { recovered = true; break }
    } catch {}
  }
  assert.ok(recovered, 'el panel debe reiniciarse solo y aceptar la cookie existente')
  assert.equal(process.pid, botPid)
  assert.notEqual(handle.pid, oldPid)
  const preservedPassword = await fetch(base + '/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'changedpassword123' }),
  })
  assert.equal(preservedPassword.status, 200, 'el reinicio HTTP no debe reaplicar PAIN_WEB_ADMIN_RESET=1')
  const recoveredPid = handle.pid
  assert.equal(await handle.restart(), true)
  assert.notEqual(handle.pid, recoveredPid)
  assert.equal((await fetch(base + '/api/auth/me', { headers: { cookie } })).status, 200)
})
