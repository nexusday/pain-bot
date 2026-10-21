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

test('webpanel main: solo el admin gestiona el bot principal', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pain-webpanel-main-'))
  const root = path.join(dir, 'Serbot')
  fs.mkdirSync(root, { recursive: true })
  delete global.conn

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

  const config = await pedir('/api/config')
  assert.equal(config.status, 200)
  assert.equal(config.datos.mainLinked, false)

  const registro = await pedir('/api/auth/register', {
    method: 'POST',
    body: { username: 'usuario', password: 'usuario12345' },
  })
  assert.equal(registro.status, 201)
  const cookieUsuario = registro.cookie
  const csrfUsuario = registro.datos.csrf

  const mainUsuario = await pedir('/api/main', { cookie: cookieUsuario })
  assert.equal(mainUsuario.status, 403)
  assert.equal(mainUsuario.datos.code, 'forbidden')

  const loginAdmin = await pedir('/api/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: 'admin12345' },
  })
  assert.equal(loginAdmin.status, 200)
  const cookieAdmin = loginAdmin.cookie
  const csrfAdmin = loginAdmin.datos.csrf

  const mainAdmin = await pedir('/api/main', { cookie: cookieAdmin })
  assert.equal(mainAdmin.status, 200)
  assert.equal(mainAdmin.datos.main.available, false)
  assert.equal(mainAdmin.datos.main.linked, false)
  assert.equal(mainAdmin.datos.main.canRequestCode, false)

  const sinCsrf = await pedir('/api/main/code', {
    method: 'POST',
    cookie: cookieAdmin,
    body: { phone: '5215512345678' },
  })
  assert.equal(sinCsrf.status, 403)
  assert.equal(sinCsrf.datos.code, 'csrf')

  const sinProceso = await pedir('/api/main/code', {
    method: 'POST',
    cookie: cookieAdmin,
    csrf: csrfAdmin,
    body: { phone: '5215512345678' },
  })
  assert.equal(sinProceso.status, 409)
  assert.equal(sinProceso.datos.code, 'main_unavailable')

  const sinVinculo = await pedir('/api/main/unlink', {
    method: 'POST',
    cookie: cookieAdmin,
    csrf: csrfAdmin,
  })
  assert.equal(sinVinculo.status, 409)
  assert.equal(sinVinculo.datos.code, 'main_unavailable')

  const usuarioNoPuede = await pedir('/api/main/code', {
    method: 'POST',
    cookie: cookieUsuario,
    csrf: csrfUsuario,
    body: { phone: '5215512345678' },
  })
  assert.equal(usuarioNoPuede.status, 403)
})
