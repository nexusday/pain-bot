import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import test from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { startWebPanel } from '../lib/webpanel/server.js'
import { hashPassword } from '../lib/webpanel/auth.js'

test('webpanel seguridad: archivos privados, métricas, origen, autorización y sobrecarga', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pain-panel-security-'))
  const handle = await startWebPanel({
    host: '127.0.0.1', port: 0, dataDir: dir, root: path.join(dir, 'Serbot'),
    publicUrl: 'https://panel.example.com', adminUser: 'admin', adminPass: 'admin12345',
  })
  const held = []
  t.after(async () => {
    held.forEach((request) => request.destroy())
    await handle.close()
    fs.rmSync(dir, { recursive: true, force: true })
  })
  const base = `http://127.0.0.1:${handle.server.address().port}`
  const request = async (route, session, method = 'GET', body, extraHeaders = {}) => {
    const res = await fetch(base + route, {
      method, headers: { 'content-type': 'application/json', ...session, ...extraHeaders },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await res.text()
    let data
    try { data = JSON.parse(text) } catch {}
    return { res, data, text }
  }
  const home = await request('/')
  assert.equal(home.res.headers.get('strict-transport-security'), 'max-age=15552000')
  assert.equal(home.res.headers.get('x-frame-options'), 'DENY')
  for (const route of ['/.env', '/.git/HEAD', '/storage/webpanel.sqlite', '/sessions/creds.json', '/assets/..%2f..%2f.env']) {
    const result = await request(route)
    assert.equal(result.res.status, 404, route)
    assert.ok(!result.text.includes('SQLite format 3'))
    assert.ok(!result.text.includes('PAIN_WEB_ADMIN_PASS='))
  }
  const stats = await request('/api/stats')
  for (const key of ['rssMB', 'heapMB', 'admins', 'uptime']) assert.ok(!(key in stats.data))
  assert.deepEqual((await request('/api/stats')).data, stats.data)
  for (const route of ['/api/admin/settings', '/api/admin/users?q=%27%20OR%201=1--', '/api/admin/roles']) {
    assert.equal((await request(route)).res.status, 401)
  }
  assert.equal((await request('/api/auth/me', { cookie: 'pain_panel=forged' })).res.status, 401)
  assert.equal((await request('/api/auth/register', null, 'POST', {}, { origin: 'https://evil.example' })).res.status, 403)
  assert.equal(await handle.store.buscarUsuarioPorNombre("' OR 1=1 --"), null)
  const duplicate = { username: 'concurrent-user', email: 'concurrent@example.com', password: 'testpassword123' }
  const simultaneous = await Promise.all([
    request('/api/auth/register', null, 'POST', duplicate),
    request('/api/auth/register', null, 'POST', duplicate),
  ])
  assert.deepEqual(simultaneous.map((result) => result.res.status).sort(), [201, 409])

  const pass = await hashPassword('testpassword123')
  const viewerRole = await handle.store.crearRol({ key: 'viewer', name: 'Viewer', scope: 'admin', permissions: ['admin.access', 'admin.sessions', 'admin.users.edit', 'admin.users.roles', 'admin.users.delete'] })
  const privilegedRole = await handle.store.crearRol({ key: 'privileged', name: 'Privileged', scope: 'admin', permissions: ['admin.access', 'admin.settings.turnstile'] })
  const viewer = await handle.store.crearUsuario({ username: 'viewer', email: 'viewer@example.com', passwordHash: pass, roleId: viewerRole.id })
  const privileged = await handle.store.crearUsuario({ username: 'privileged', email: 'privileged@example.com', passwordHash: pass, roleId: privilegedRole.id })
  const login = await request('/api/auth/login', null, 'POST', { username: viewer.username, password: 'testpassword123' })
  assert.equal(login.res.status, 200)
  const session = { cookie: login.res.headers.get('set-cookie').split(';')[0], 'x-csrf-token': login.data.csrf }
  const phone = '5215512345678'
  await handle.store.upsertBot({ phone, folder: phone, userId: privileged.id, status: 'linked' })
  assert.equal((await request(`/api/bots/${phone}/config`, session, 'PATCH', { name: 'changed' })).res.status, 403)
  assert.equal((await request(`/api/admin/users/${privileged.id}`, session, 'PATCH', { password: 'attackerpassword' })).res.status, 403)
  assert.equal((await request(`/api/admin/users/${privileged.id}`, session, 'DELETE')).res.status, 403)
  assert.equal((await request(`/api/admin/users/${viewer.id}`, session, 'PATCH', { roleId: privilegedRole.id })).res.status, 403)

  // Ocho cuerpos incompletos solo en el servidor temporal: la novena petición
  // se rechaza de forma controlada sin saturar CPU ni usar cuentas reales.
  for (let i = 0; i < 8; i++) {
    const req = http.request(base + '/api/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json', 'content-length': '100' },
    })
    req.on('error', () => {})
    req.flushHeaders()
    held.push(req)
  }
  await delay(100)
  const busy = await request('/api/auth/login', null, 'POST', {})
  assert.equal(busy.res.status, 503)
  assert.equal(busy.data.code, 'server_busy')
  assert.equal(busy.res.headers.get('retry-after'), '3')
  assert.equal((await request('/healthz')).res.status, 200)
  held.forEach((req) => req.destroy())
})
