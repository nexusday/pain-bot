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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pain-webpanel-nodes-'))
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
  return { handle, pedir }
}

test('webpanel: crear, listar, editar y borrar nodos remotos', async (t) => {
  const { handle, pedir } = await panelDePrueba(t)

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

  // Un usuario normal no puede listar nodos.
  const listaUsuario = await pedir('/api/admin/nodes', { cookie: cookieUsuario })
  assert.equal(listaUsuario.status, 403)

  const invalido = await pedir('/api/admin/nodes', {
    method: 'POST',
    cookie: cookieAdmin,
    csrf: csrfAdmin,
    body: { name: 'x' },
  })
  assert.equal(invalido.status, 400)

  const creado = await pedir('/api/admin/nodes', {
    method: 'POST',
    cookie: cookieAdmin,
    csrf: csrfAdmin,
    body: { name: 'vip-1', description: 'VPS de pruebas' },
  })
  assert.equal(creado.status, 201)
  assert.equal(creado.datos.node.name, 'vip-1')
  assert.match(creado.datos.node.uuid, /^[0-9a-f-]{36}$/i)
  assert.ok(creado.datos.node.command.includes('/api/node/install.sh?'))
  assert.ok(creado.datos.node.command.includes('uuid='))
  assert.ok(creado.datos.node.command.includes('token='))
  const id = creado.datos.node.id

  const lista = await pedir('/api/admin/nodes', { cookie: cookieAdmin })
  assert.equal(lista.status, 200)
  assert.equal(lista.datos.nodes.length, 1)
  assert.equal(lista.datos.nodes[0].online, false)
  assert.ok(lista.datos.nodes[0].command.includes('/api/node/install.sh?'))

  // Instalador de una línea autenticado por uuid/token.
  const nodoDb = await handle.store.obtenerNodo(id)
  const instalar = await pedir(`/api/node/install.sh?uuid=${nodoDb.uuid}&token=${nodoDb.token}`)
  assert.equal(instalar.status, 200)
  assert.ok(instalar.texto.includes('exec node scripts/node-agent.js'))
  assert.ok(instalar.texto.includes('PANEL_URL='))
  const noAutorizado = await pedir(`/api/node/install.sh?uuid=${nodoDb.uuid}&token=incorrecto`)
  assert.equal(noAutorizado.status, 401)

  const editado = await pedir(`/api/admin/nodes/${id}`, {
    method: 'PATCH',
    cookie: cookieAdmin,
    csrf: csrfAdmin,
    body: { name: 'vip-1-editado' },
  })
  assert.equal(editado.status, 200)

  const borrado = await pedir(`/api/admin/nodes/${id}`, {
    method: 'DELETE',
    cookie: cookieAdmin,
    csrf: csrfAdmin,
  })
  assert.equal(borrado.status, 200)
  const listaFinal = await pedir('/api/admin/nodes', { cookie: cookieAdmin })
  assert.equal(listaFinal.datos.nodes.length, 0)
})
