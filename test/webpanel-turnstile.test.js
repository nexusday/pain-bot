import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { startWebPanel } from '../lib/webpanel/server.js'

function cookieDe(res) {
  const raw = res.headers.get('set-cookie') || ''
  return raw.split(';')[0]
}

function crearCliente(base) {
  return async function pedir(ruta, opciones = {}) {
    const headers = {}
    if (opciones.cookie) headers.cookie = opciones.cookie
    if (opciones.csrf) headers['x-csrf-token'] = opciones.csrf
    if (opciones.body !== undefined) headers['content-type'] = 'application/json'
    if (opciones.origin) headers.origin = opciones.origin
    const res = await fetch(base + ruta, {
      method: opciones.method || 'GET',
      headers,
      body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
      redirect: 'manual',
    })
    const texto = await res.text()
    let datos = null
    try { datos = JSON.parse(texto) } catch {}
    return { res, status: res.status, datos, texto, cookie: cookieDe(res) }
  }
}

test('webpanel: Turnstile se configura sin perder la secret key', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pain-webpanel-turnstile-'))
  const root = path.join(dir, 'Serbot')
  fs.mkdirSync(root, { recursive: true })
  const handle = await startWebPanel({
    port: 0,
    host: '127.0.0.1',
    publicUrl: 'http://127.0.0.1',
    dataDir: dir,
    root,
    publicDir: path.resolve('webpanel', 'public'),
    adminUser: 'admin',
    adminPass: 'admin12345',
    allowRegistration: true,
    requireInvite: false,
    trustProxy: false,
  })
  assert.ok(handle)
  t.after(async () => {
    await handle.close().catch(() => {})
    fs.rmSync(dir, { recursive: true, force: true })
  })
  const pedir = crearCliente(`http://127.0.0.1:${handle.server.address().port}`)

  // Sin configurar, el captcha está inactivo y el login no lo exige.
  const configInicial = await pedir('/api/config')
  assert.equal(configInicial.status, 200)
  assert.equal(configInicial.datos.turnstileSiteKey, '')

  const login = await pedir('/api/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: 'admin12345' },
  })
  assert.equal(login.status, 200)
  const cookie = login.cookie
  const csrf = login.datos.csrf

  const ajustes = await pedir('/api/admin/settings', { cookie })
  assert.equal(ajustes.status, 200)
  assert.equal(ajustes.datos.turnstileEnabled, false)

  // Al guardar las dos claves, Turnstile queda activo.
  const guardado = await pedir('/api/admin/settings', {
    method: 'PATCH',
    cookie,
    csrf,
    body: { turnstileSiteKey: 'site-de-prueba', turnstileSecretKey: 'secreto-de-prueba' },
  })
  assert.equal(guardado.status, 200)
  assert.equal(guardado.datos.turnstileEnabled, true)
  assert.equal(guardado.datos.turnstileSiteKey, 'site-de-prueba')

  // Guardar de nuevo dejando la secret key vacía NO la borra.
  const reGuardado = await pedir('/api/admin/settings', {
    method: 'PATCH',
    cookie,
    csrf,
    body: { turnstileSiteKey: 'site-de-prueba', turnstileSecretKey: '' },
  })
  assert.equal(reGuardado.status, 200)
  assert.equal(reGuardado.datos.turnstileEnabled, true)

  const ajustesFinales = await pedir('/api/admin/settings', { cookie })
  assert.equal(ajustesFinales.datos.turnstileSecretKey, 'secreto-de-prueba')

  // El endpoint público anuncia la site key solo con el captcha activo.
  const configActiva = await pedir('/api/config')
  assert.equal(configActiva.datos.turnstileSiteKey, 'site-de-prueba')

  // Y el login exige el token del captcha.
  const sinToken = await pedir('/api/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: 'admin12345' },
  })
  assert.equal(sinToken.status, 400)
  assert.equal(sinToken.datos.code, 'captcha_missing')
})
