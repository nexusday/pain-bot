import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import webPush from 'web-push'
import { startWebPanel } from '../lib/webpanel/server.js'
import { hashPassword } from '../lib/webpanel/auth.js'
import {
  createPushService,
  queuePush,
  sqlAll,
  sqlRun,
  syncPushDevice,
  validateSubscription,
} from '../lib/webpanel/push.js'
import { PanelStore } from '../lib/webpanel/store.js'

function sub(suffix = 'one') {
  return {
    endpoint: `https://fcm.googleapis.com/fcm/send/test-${suffix}`,
    keys: {
      p256dh: webPush.generateVAPIDKeys().publicKey,
      auth: crypto.randomBytes(16).toString('base64url'),
    },
  }
}
test('privacidad IP: API, auditoría, meta, vinculaciones y delegación de roles', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pain-privacy-'))
  const handle = await startWebPanel(
    {
      host: '127.0.0.1',
      port: 0,
      dataDir: dir,
      root: path.join(dir, 'Serbot'),
      publicUrl: 'http://127.0.0.1',
      adminUser: 'owner',
      adminPass: 'ownerpassword123',
    },
    { sendPush: async () => {} }
  )
  t.after(async () => {
    await handle.close()
    fs.rmSync(dir, { recursive: true, force: true })
  })
  const base = `http://127.0.0.1:${handle.server.address().port}`
  async function req(route, session, method = 'GET', body) {
    const r = await fetch(base + route, {
      method,
      headers: { 'content-type': 'application/json', ...(session || {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await r.text()
    return {
      status: r.status,
      data: JSON.parse(text),
      text,
      cookie: (r.headers.get('set-cookie') || '').split(';')[0],
    }
  }
  const ownerLogin = await req('/api/auth/login', null, 'POST', {
    username: 'owner',
    password: 'ownerpassword123',
  })
  const owner = {
    cookie: ownerLogin.cookie,
    'x-csrf-token': ownerLogin.data.csrf,
  }
  const role = await handle.store.crearRol({
    key: 'manager',
    name: 'Manager',
    scope: 'admin',
    permissions: [
      'admin.access',
      'admin.overview',
      'admin.audit',
      'admin.pairings',
      'admin.users',
      'admin.settings.roles',
      'admin.users.roles',
      'admin.users.edit',
    ],
  })
  const user = await handle.store.crearUsuario({
    username: 'manager',
    email: 'manager@example.com',
    roleId: role.id,
    passwordHash: await hashPassword('managerpassword123'),
  })
  const login = await req('/api/auth/login', null, 'POST', {
    username: 'manager',
    password: 'managerpassword123',
  })
  const manager = { cookie: login.cookie, 'x-csrf-token': login.data.csrf }
  const ip = '203.0.113.42',
    v6 = '2001:db8::42'
  await handle.store.registrarLogin(ownerLogin.data.user.id, ip)
  await handle.store.registrarAuditoria({
    userId: ownerLogin.data.user.id,
    action: 'test.ip',
    ip,
    meta: { nested: { last_ip: v6 }, error: `from ${ip}` },
  })
  const pairing = await handle.store.crearPairing({
    id: 'private-pairing',
    userId: ownerLogin.data.user.id,
    phone: '5215512345678',
    ip,
    expiresAt: Date.now() + 60000,
  })
  for (const route of [
    '/api/admin/overview',
    '/api/admin/audit',
    '/api/admin/pairings',
    '/api/admin/users',
    `/api/bots/link/${pairing.id}`,
  ]) {
    const result = await req(route, manager)
    assert.equal(result.status, 200, route)
    assert.ok(!result.text.includes(ip), route)
    assert.ok(!result.text.includes(v6), route)
  }
  assert.ok((await req('/api/admin/audit', owner)).text.includes(ip))
  assert.equal(
    (
      await req('/api/admin/roles', manager, 'POST', {
        name: 'Spy',
        scope: 'admin',
        permissions: ['admin.access', 'admin.users.ip'],
      })
    ).status,
    403
  )
  const ipRole = await handle.store.crearRol({
    key: 'ipreader',
    name: 'IP reader',
    scope: 'admin',
    permissions: ['admin.access', 'admin.users.ip'],
  })
  assert.equal(
    (
      await req(`/api/admin/users/${user.id}`, manager, 'PATCH', {
        roleId: ipRole.id,
      })
    ).status,
    403
  )
  assert.equal(
    (
      await req(`/api/admin/roles/${ipRole.id}`, manager, 'PATCH', {
        name: 'Changed',
      })
    ).status,
    403
  )
  assert.equal((await req('/api/admin/notifications', manager)).status, 403)
  const key = await req('/api/account/push?deviceId=device-1234567890', manager)
  assert.ok(key.data.publicKey)
  assert.ok(!key.text.includes('privateKey'))
  assert.equal(
    (
      await req('/api/account/push', manager, 'POST', {
        deviceId: 'device-1234567890',
        permission: 'granted',
        subscription: sub(),
      })
    ).status,
    200
  )
  assert.equal(
    (
      await req('/api/admin/notifications', owner, 'POST', {
        title: 'Aviso',
        body: 'Mensaje de prueba',
        audience: 'selected',
        userIds: [user.id],
      })
    ).status,
    202
  )
  const denied = await req('/api/account/push', manager, 'POST', {
    deviceId: 'device-1234567890',
    permission: 'denied',
  })
  assert.equal(denied.data.enabled, false)
  assert.equal(
    (await req('/api/admin/backups/export', manager, 'POST', {})).status,
    403
  )
})

test('push: consentimiento, caducidad, destinatarios y protección SSRF', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pain-push-'))
  const store = await new PanelStore(path.join(dir, 'panel.sqlite')).init()
  let service
  try {
    const a = await store.crearUsuario({
        username: 'alice',
        passwordHash: 'test',
      }),
      b = await store.crearUsuario({ username: 'bob', passwordHash: 'test' })
    await syncPushDevice(store, a.id, {
      deviceId: 'device-alice-12345',
      permission: 'granted',
      subscription: sub('alice'),
    })
    await syncPushDevice(store, b.id, {
      deviceId: 'device-bob-1234567',
      permission: 'granted',
      subscription: sub('bob'),
    })
    assert.throws(() =>
      validateSubscription({ ...sub(), endpoint: 'https://127.0.0.1/private' })
    )
    assert.throws(() =>
      validateSubscription({
        ...sub(),
        endpoint: 'https://fcm.googleapis.com.evil.example/send',
      })
    )
    assert.throws(() =>
      validateSubscription({
        ...sub(),
        endpoint: 'https://fcm.googleapis.com@127.0.0.1/private',
      })
    )
    const calls = []
    service = createPushService(
      store,
      { publicUrl: 'https://panel.example.com' },
      async (subscription, payload) => {
        calls.push({ subscription, payload: JSON.parse(payload) })
        throw Object.assign(new Error('gone'), { statusCode: 410 })
      }
    )
    const queued = await queuePush(store, a.id, {
      title: 'Novedades',
      body: 'Solo para Alice',
      audience: 'selected',
      userIds: [a.id],
    })
    await service.tick()
    assert.equal(calls.length, 1)
    assert.ok(calls[0].subscription.endpoint.endsWith('alice'))
    assert.equal(calls[0].payload.tag, `pain-${queued.id}`)
    const device = (
      await sqlAll(store, 'SELECT * FROM panel_push_devices WHERE user_id=?', [
        a.id,
      ])
    )[0]
    assert.equal(device.enabled, 0)
    assert.equal(device.subscription, null)
    await sqlRun(
      store,
      'UPDATE panel_push_devices SET prompt_after=? WHERE user_id=?',
      [Date.now() + 86400000, b.id]
    )
    const revoked = await syncPushDevice(store, b.id, {
      deviceId: 'device-bob-1234567',
      permission: 'denied',
    })
    assert.equal(revoked.enabled, false)
    assert.equal(revoked.promptAfter, 0)
    await assert.rejects(
      queuePush(store, a.id, {
        title: 'x',
        body: 'x',
        url: '//evil.example',
        audience: 'all',
      })
    )
  } finally {
    service?.close()
    await store.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
