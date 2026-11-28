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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pain-webpanel-shared-'))
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

test('webpanel: publicar, listar, editar y quitar un sub-bot compartido', async (t) => {
  const { handle, pedir } = await panelDePrueba(t)

  const registro = await pedir('/api/auth/register', {
    method: 'POST',
    body: { username: 'juan', email: 'juan@example.com', password: 'juan123456' },
  })
  assert.equal(registro.status, 201)
  const login = await pedir('/api/auth/login', {
    method: 'POST',
    body: { username: 'juan', password: 'juan123456' },
  })
  assert.equal(login.status, 200)
  const cookie = login.cookie
  const csrf = login.datos.csrf
  const usuario = await handle.store.buscarUsuarioPorNombre('juan')
  const userId = usuario?.id

  // El bot debe existir como vinculado. Se crea directamente en la DB del panel.
  const fila = await handle.store.listarBotsUsuario(userId)
  if (!fila.length) {
    await handle.store.upsertBot({
      userId,
      phone: '5215512345678',
      folder: '5215512345678',
      status: 'linked',
      linkedAt: Date.now(),
    })
  }

  const publicado = await pedir('/api/shared', {
    method: 'POST',
    cookie,
    csrf,
    body: { phone: '5215512345678', maxGroups: 3, maxPerIp: 1 },
  })
  assert.equal(publicado.status, 201)
  assert.equal(publicado.datos.bot.phone, '5215512345678')
  assert.equal(publicado.datos.bot.maxGroups, 3)
  assert.equal(publicado.datos.bot.active, true)
  const id = publicado.datos.bot.id

  const publico = await pedir('/api/shared', { cookie })
  assert.equal(publico.status, 200)
  assert.equal(publico.datos.shared.length, 1)
  assert.equal(publico.datos.shared[0].owner, 'juan')

  const mine = await pedir('/api/shared/mine', { cookie })
  assert.equal(mine.status, 200)
  assert.equal(mine.datos.bots.length, 1)
  assert.ok(Array.isArray(mine.datos.joins))

  const editado = await pedir(`/api/shared/${id}`, {
    method: 'PATCH',
    cookie,
    csrf,
    body: { maxGroups: 2 },
  })
  assert.equal(editado.status, 200)

  // Otro usuario pide el sub-bot. Sin worker disponible debe fallar de forma
  // controlada (no 500).
  const registroPedro = await pedir('/api/auth/register', {
    method: 'POST',
    body: { username: 'pedro', email: 'pedro@example.com', password: 'pedro123456' },
  })
  assert.equal(registroPedro.status, 201)
  const loginPedro = await pedir('/api/auth/login', {
    method: 'POST',
    body: { username: 'pedro', password: 'pedro123456' },
  })
  const cookiePedro = loginPedro.cookie
  const csrfPedro = loginPedro.datos.csrf

  const enlaceInvalido = await pedir(`/api/shared/${id}/join`, {
    method: 'POST',
    cookie: cookiePedro,
    csrf: csrfPedro,
    body: { groupLink: 'no-es-un-link' },
  })
  assert.equal(enlaceInvalido.status, 400)

  const sinWorker = await pedir(`/api/shared/${id}/join`, {
    method: 'POST',
    cookie: cookiePedro,
    csrf: csrfPedro,
    body: { groupLink: 'https://chat.whatsapp.com/AbCdEf123456' },
  })
  assert.ok([409, 410, 503].includes(sinWorker.status))

  const borrado = await pedir(`/api/shared/${id}`, {
    method: 'DELETE',
    cookie,
    csrf,
  })
  assert.equal(borrado.status, 200)
  const publicoFinal = await pedir('/api/shared', { cookie })
  assert.equal(publicoFinal.datos.shared.length, 0)
})
