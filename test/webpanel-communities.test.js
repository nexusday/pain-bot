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

async function panelDePrueba(t, opciones = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pain-webpanel-com-'))
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
    ...opciones,
  })
  t.after(async () => {
    await handle.close().catch(() => {})
    fs.rmSync(dir, { recursive: true, force: true })
  })
  const pedir = crearCliente(`http://127.0.0.1:${handle.server.address().port}`)
  return { handle, pedir, dir, root }
}

test('webpanel: comunidades (crear, listar, editar y borrar)', async (t) => {
  const { handle, pedir } = await panelDePrueba(t)

  const registro = await pedir('/api/auth/register', {
    method: 'POST',
    body: { username: 'usuario', password: 'usuario12345' },
  })
  assert.equal(registro.status, 201)
  const cookieUsuario = registro.cookie

  const login = await pedir('/api/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: 'admin12345' },
  })
  const cookieAdmin = login.cookie
  const csrfAdmin = login.datos.csrf

  // Un usuario normal no puede crear comunidades.
  const crearUsuario = await pedir('/api/admin/communities', {
    method: 'POST',
    cookie: cookieUsuario,
    body: { name: 'No permitido', link: 'https://chat.whatsapp.com/abc' },
  })
  assert.equal(crearUsuario.status, 403)

  const enlaceInvalido = await pedir('/api/admin/communities', {
    method: 'POST',
    cookie: cookieAdmin,
    csrf: csrfAdmin,
    body: { name: 'Sin esquema', link: 'chat.whatsapp.com/abc' },
  })
  assert.equal(enlaceInvalido.status, 400)
  assert.equal(enlaceInvalido.datos.code, 'invalid_link')

  const creada = await pedir('/api/admin/communities', {
    method: 'POST',
    cookie: cookieAdmin,
    csrf: csrfAdmin,
    body: {
      name: 'Pain Community',
      link: 'https://chat.whatsapp.com/ABC123',
      description: 'Avisos y soporte',
    },
  })
  assert.equal(creada.status, 201)
  const id = creada.datos.community.id
  assert.equal(creada.datos.community.name, 'Pain Community')

  const listaAdmin = await pedir('/api/admin/communities', { cookie: cookieAdmin })
  assert.equal(listaAdmin.status, 200)
  assert.equal(listaAdmin.datos.communities.length, 1)

  const listaUsuario = await pedir('/api/communities', { cookie: cookieUsuario })
  assert.equal(listaUsuario.status, 200)
  assert.equal(listaUsuario.datos.communities.length, 1)
  assert.equal(listaUsuario.datos.communities[0].name, 'Pain Community')

  const editada = await pedir(`/api/admin/communities/${id}`, {
    method: 'PATCH',
    cookie: cookieAdmin,
    csrf: csrfAdmin,
    body: { name: 'Pain Community Oficial', active: false },
  })
  assert.equal(editada.status, 200)
  assert.equal(editada.datos.community.name, 'Pain Community Oficial')
  assert.equal(editada.datos.community.active, 0)

  // Oculta: el usuario ya no la ve.
  const listaOculta = await pedir('/api/communities', { cookie: cookieUsuario })
  assert.equal(listaOculta.datos.communities.length, 0)

  const borrada = await pedir(`/api/admin/communities/${id}`, {
    method: 'DELETE',
    cookie: cookieAdmin,
    csrf: csrfAdmin,
  })
  assert.equal(borrada.status, 200)

  const listaFinal = await pedir('/api/admin/communities', { cookie: cookieAdmin })
  assert.equal(listaFinal.datos.communities.length, 0)
  assert.ok(handle)
})

test('webpanel: máximo de sub-bots por cuenta y por IP', async (t) => {
  const { handle, pedir } = await panelDePrueba(t, { trustProxy: true })
  const ipFalsa = { headers: { 'x-forwarded-for': '10.0.0.1' } }

  // El principal simulado permite llegar a las comprobaciones de límites.
  global.conn = { authState: { creds: { registered: true } } }
  t.after(() => { delete global.conn })

  const login = await pedir('/api/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: 'admin12345' },
  })
  const cookieAdmin = login.cookie
  const csrfAdmin = login.datos.csrf

  const ajustes = await pedir('/api/admin/settings', {
    method: 'PATCH',
    cookie: cookieAdmin,
    csrf: csrfAdmin,
    body: { maxSubsPerUser: 1, maxBotsPerIp: 2 },
  })
  assert.equal(ajustes.status, 200)
  assert.equal(ajustes.datos.maxSubsPerUser, 1)
  assert.equal(ajustes.datos.maxBotsPerIp, 2)

  const usuario = await storeDe(handle).buscarUsuarioPorNombre('admin')

  // Una cuenta ya tiene un sub-bot: el segundo debe rebotar.
  await handle.store.upsertBot({
    userId: usuario.id,
    phone: '5215500000001',
    folder: '5215500000001',
    linkedIp: '10.0.0.1',
  })

  const limiteUsuario = await pedir('/api/bots/link', {
    method: 'POST',
    cookie: cookieAdmin,
    csrf: csrfAdmin,
    headers: ipFalsa.headers,
    body: { phone: '5215500000002' },
  })
  assert.equal(limiteUsuario.status, 403)
  assert.equal(limiteUsuario.datos.code, 'user_limit')

  // Con el límite por cuenta desactivado, la misma IP choca con el límite de IP.
  await pedir('/api/admin/settings', {
    method: 'PATCH',
    cookie: cookieAdmin,
    csrf: csrfAdmin,
    body: { maxSubsPerUser: 0 },
  })

  await handle.store.upsertBot({
    userId: usuario.id,
    phone: '5215500000003',
    folder: '5215500000003',
    linkedIp: '10.0.0.1',
  })

  const limiteIp = await pedir('/api/bots/link', {
    method: 'POST',
    cookie: cookieAdmin,
    csrf: csrfAdmin,
    headers: ipFalsa.headers,
    body: { phone: '5215500000004' },
  })
  assert.equal(limiteIp.status, 429)
  assert.equal(limiteIp.datos.code, 'ip_limit')

  const bots = await pedir('/api/bots', { cookie: cookieAdmin })
  assert.equal(bots.status, 200)
  assert.equal(bots.datos.limit.unlimited, true)
})

test('webpanel: borrado de sesiones por oleadas', async (t) => {
  const { handle, pedir, root } = await panelDePrueba(t)

  for (const numero of ['5215500000011', '5215500000012', '5215500000013']) {
    const carpeta = path.join(root, numero)
    fs.mkdirSync(carpeta, { recursive: true })
    fs.writeFileSync(path.join(carpeta, 'creds.json'), JSON.stringify({ registered: true }))
    await handle.store.upsertBot({
      userId: 1,
      phone: numero,
      folder: numero,
    })
  }

  const login = await pedir('/api/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: 'admin12345' },
  })
  const cookieAdmin = login.cookie
  const csrfAdmin = login.datos.csrf

  const borrado = await pedir('/api/admin/sessions/bulk', {
    method: 'POST',
    cookie: cookieAdmin,
    csrf: csrfAdmin,
    body: { phones: ['5215500000011', '5215500000012', '5215500000013'], batchSize: 2 },
  })
  assert.equal(borrado.status, 200)
  assert.equal(borrado.datos.eliminados, 3)
  assert.equal(borrado.datos.fallidos, 0)

  for (const numero of ['5215500000011', '5215500000012', '5215500000013']) {
    assert.equal(fs.existsSync(path.join(root, numero)), false)
  }
  const restantes = await handle.store.listarBots()
  assert.equal(restantes.length, 0)
})

function storeDe(handle) {
  return handle.store
}
