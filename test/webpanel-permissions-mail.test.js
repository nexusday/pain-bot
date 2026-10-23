import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { hashPassword } from '../lib/webpanel/auth.js'
import { startWebPanel } from '../lib/webpanel/server.js'

test('webpanel: permisos efectivos, protección del principal y SMTP obligatorio', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pain-permissions-mail-'))
  const handle = await startWebPanel({
    enabled: true, host: '127.0.0.1', port: 0,
    publicUrl: 'http://127.0.0.1', dataDir: dir,
    root: path.join(dir, 'Serbot'),
    adminUser: 'admin', adminPass: 'admin12345',
    allowRegistration: true, requireInvite: false,
  })
  t.after(async () => {
    await handle.close()
    fs.rmSync(dir, { recursive: true, force: true })
  })
  const base = `http://127.0.0.1:${handle.server.address().port}`
  async function request(route, session, method = 'GET', body) {
    const res = await fetch(base + route, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(session ? { cookie: session.cookie, 'x-csrf-token': session.csrf } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return { status: res.status, data: await res.json(), cookie: (res.headers.get('set-cookie') || '').split(';')[0] }
  }
  async function login(username) {
    const result = await request('/api/auth/login', null, 'POST', { username, password: 'admin12345' })
    assert.equal(result.status, 200)
    return { cookie: result.cookie, csrf: result.data.csrf }
  }
  const principal = await login('admin')
  const owner = await handle.store.buscarUsuarioPorNombre('admin')
  await handle.store.crearUsuario({ username: 'secondary', email: 'secondary@example.com', role: 'admin', passwordHash: await hashPassword('admin12345') })
  const secondary = await login('secondary')
  await handle.store.establecerMeta('turnstile_site_key', 'private-site')
  await handle.store.establecerMeta('turnstile_secret_key', 'private-secret')
  const settings = await request('/api/admin/settings', secondary)
  assert.equal(settings.status, 200)
  assert.equal(settings.data.turnstileSiteKey, '')
  assert.equal(settings.data.turnstileSecretKey, '')
  assert.equal(settings.data.canTurnstile, false)
  assert.equal((await request('/api/admin/settings', secondary, 'PATCH', { turnstileSiteKey: 'changed' })).status, 403)
  assert.equal((await request(`/api/admin/impersonate/${owner.id}`, secondary, 'POST')).status, 403)
  assert.equal((await request(`/api/admin/users/${owner.id}`, secondary, 'PATCH', { password: 'changedpassword' })).status, 403)
  assert.equal((await request('/api/admin/settings', principal, 'PATCH', { requireEmailVerification: true })).status, 409)
  assert.equal((await request('/api/admin/mail', principal, 'PATCH', { requireEmailVerification: true })).status, 409)
  assert.notEqual(await handle.store.obtenerMeta('require_email_verification'), '1')
  const role = await handle.store.crearRol({ key: 'limited', name: 'Limited', scope: 'user', permissions: [] })
  await handle.store.establecerMeta('turnstile_site_key', '')
  const user = await handle.store.crearUsuario({ username: 'limiteduser', email: 'limited@example.com', role: 'user', passwordHash: await hashPassword('admin12345') })
  await handle.store.actualizarUsuario(user.id, { roleId: role.id })
  const limited = await login('limiteduser')
  assert.equal((await request('/api/bots', limited)).status, 403)
  assert.equal((await request('/api/bots/link', limited, 'POST', { phone: '12345678900' })).status, 403)
  assert.equal((await request('/api/communities', limited)).status, 403)
  const tokenHash = (code) => crypto.createHmac('sha256', handle.config.sessionSecret).update(code).digest('hex')
  await handle.store.crearTokenCorreo({
    userId: user.id, email: user.email, purpose: 'reset',
    codeHash: tokenHash('123456'), expiresAt: Date.now() + 60_000,
  })
  const resetBody = { email: user.email, code: '123456', password: 'newpassword123' }
  const resets = await Promise.all([
    request('/api/auth/reset', null, 'POST', resetBody),
    request('/api/auth/reset', null, 'POST', resetBody),
  ])
  assert.deepEqual(resets.map((result) => result.status).sort(), [200, 400])
  assert.equal((await request('/api/auth/me', limited)).status, 401)
  assert.equal((await request('/api/auth/reset', null, 'POST', {
    email: user.email, code: '123456', password: 'anotherpassword123',
  })).status, 400)
  const newLogin = await request('/api/auth/login', null, 'POST', { username: user.username, password: 'newpassword123' })
  assert.equal(newLogin.status, 200)
  assert.equal(newLogin.data.user.emailVerified, true)
  const adminRole = await handle.store.obtenerRolPorKey('admin')
  const granted = [...adminRole.permissions, 'admin.settings.turnstile', 'admin.settings.roles']
  const grant = await request(`/api/admin/roles/${adminRole.id}`, principal, 'PATCH', { permissions: granted })
  assert.equal(grant.status, 200)
  assert.ok(grant.data.role.permissions.includes('admin.settings.turnstile'))
  assert.ok(grant.data.role.permissions.includes('admin.settings.roles'))
  const delegatedSettings = await request('/api/admin/settings', secondary)
  assert.equal(delegatedSettings.data.canTurnstile, true)
  assert.equal(delegatedSettings.data.turnstileSecretKey, 'private-secret')
  assert.equal((await request('/api/admin/settings', secondary, 'PATCH', { turnstileSiteKey: '' })).status, 200)
  const roles = await request('/api/admin/roles', secondary)
  assert.equal(roles.data.canManage, true)
  assert.equal((await request('/api/admin/roles', secondary, 'POST', {
    name: 'Delegated role', scope: 'user', permissions: ['bots.view'],
  })).status, 201)
  assert.equal((await request(`/api/admin/impersonate/${owner.id}`, secondary, 'POST')).status, 403)
  await request(`/api/admin/roles/${adminRole.id}`, principal, 'PATCH', { permissions: adminRole.permissions })
  assert.equal((await request('/api/admin/settings', secondary)).data.canTurnstile, false)
  assert.equal((await request('/api/admin/roles', secondary)).data.canManage, false)
})
