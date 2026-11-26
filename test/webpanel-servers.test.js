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
    if (opciones.headers) Object.assign(headers, opciones.headers)
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

async function panelDePrueba(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pain-webpanel-srv-'))
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
  t.after(async () => {
    await handle.close().catch(() => {})
    fs.rmSync(dir, { recursive: true, force: true })
  })
  const pedir = crearCliente(`http://127.0.0.1:${handle.server.address().port}`)
  return { handle, pedir, dir, root }
}

test('webpanel: servidores (crear, listar, editar, toggle y borrar)', async (t) => {
  const { pedir } = await panelDePrueba(t)

  const registro = await pedir('/api/auth/register', {
    method: 'POST',
    body: { username: 'usuario', email: 'usuario@example.com', password: 'usuario12345' },
  })
  assert.equal(registro.status, 201)
  const cookieUsuario = registro.cookie

  const login = await pedir('/api/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: 'admin12345' },
  })
  assert.equal(login.status, 200)
  const cookieAdmin = login.cookie
  const csrfAdmin = login.datos.csrf

  // Un usuario normal no puede crear servidores.
  const crearUsuario = await pedir('/api/admin/servers', {
    method: 'POST',
    cookie: cookieUsuario,
    body: { name: 'free-1', tier: 'free' },
  })
  assert.equal(crearUsuario.status, 403)

  // Nombre inválido.
  const nombreInvalido = await pedir('/api/admin/servers', {
    method: 'POST',
    cookie: cookieAdmin,
    csrf: csrfAdmin,
    body: { name: 'x', tier: 'free' },
  })
  assert.equal(nombreInvalido.status, 400)
  assert.equal(nombreInvalido.datos.code, 'invalid_name')

  // Crear servidor free.
  const creado = await pedir('/api/admin/servers', {
    method: 'POST',
    cookie: cookieAdmin,
    csrf: csrfAdmin,
    body: { name: 'free-1', tier: 'free', lanes: 3, maxSessions: 30, heapMb: 512, dbMode: 'shared' },
  })
  assert.equal(creado.status, 201)
  assert.equal(creado.datos.server.name, 'free-1')
  assert.equal(creado.datos.server.tier, 'free')
  assert.equal(creado.datos.server.lanes, 3)
  const id = creado.datos.server.id

  // Listar.
  const lista = await pedir('/api/admin/servers', { cookie: cookieAdmin })
  assert.equal(lista.status, 200)
  assert.equal(lista.datos.servers.length, 1)

  // Editar.
  const editado = await pedir(`/api/admin/servers/${id}`, {
    method: 'PATCH',
    cookie: cookieAdmin,
    csrf: csrfAdmin,
    body: { tier: 'premium', lanes: 4, heapMb: 2048 },
  })
  assert.equal(editado.status, 200)
  assert.equal(editado.datos.server.tier, 'premium')
  assert.equal(editado.datos.server.lanes, 4)

  // Toggle (activo -> inactivo).
  const toggle = await pedir(`/api/admin/servers/${id}/toggle`, {
    method: 'POST',
    cookie: cookieAdmin,
    csrf: csrfAdmin,
  })
  assert.equal(toggle.status, 200)
  assert.equal(toggle.datos.status, 'inactive')

  // Un usuario normal ve la lista de servidores activos (vacía).
  const publicos = await pedir('/api/servers', { cookie: cookieUsuario })
  assert.equal(publicos.status, 200)
  assert.equal(publicos.datos.servers.length, 0)

  // Volver a activar y comprobar que aparece en la lista pública.
  await pedir(`/api/admin/servers/${id}/toggle`, {
    method: 'POST',
    cookie: cookieAdmin,
    csrf: csrfAdmin,
  })
  const publicosActivos = await pedir('/api/servers', { cookie: cookieUsuario })
  assert.equal(publicosActivos.datos.servers.length, 1)
  assert.equal(publicosActivos.datos.servers[0].name, 'free-1')

  // Recursos del servidor.
  const info = await pedir('/api/server-info', { cookie: cookieUsuario })
  assert.equal(info.status, 200)
  assert.ok(info.datos.server.cpu.nucleos >= 1)
  assert.ok(info.datos.server.memoria.totalMB > 0)
  assert.ok(info.datos.server.tier)

  // Borrar.
  const borrado = await pedir(`/api/admin/servers/${id}`, {
    method: 'DELETE',
    cookie: cookieAdmin,
    csrf: csrfAdmin,
  })
  assert.equal(borrado.status, 200)
  const listaFinal = await pedir('/api/admin/servers', { cookie: cookieAdmin })
  assert.equal(listaFinal.datos.servers.length, 0)
})
