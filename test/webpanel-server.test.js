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

test('webpanel server: registro, login, permisos admin y CSRF', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pain-webpanel-server-'))
  const root = path.join(dir, 'Serbot')
  fs.mkdirSync(root, { recursive: true })
  delete global.conn
  delete global.conns

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
    sessionTtlMs: 60 * 60 * 1000,
    pairTtlMs: 60_000,
    codeTtlMs: 30_000,
  })
  assert.ok(handle)
  t.after(async () => {
    await handle.close().catch(() => {})
    fs.rmSync(dir, { recursive: true, force: true })
  })

  const puerto = handle.server.address().port
  const base = `http://127.0.0.1:${puerto}`
  const pedir = crearCliente(base)

  const salud = await pedir('/healthz')
  assert.equal(salud.status, 200)
  assert.equal(salud.datos.service, 'pain-webpanel')

  const config = await pedir('/api/config')
  assert.equal(config.status, 200)
  assert.equal(config.datos.brandName, 'Pain Bot')
  assert.equal(config.datos.allowRegistration, true)

  const index = await pedir('/')
  assert.equal(index.status, 200)
  assert.match(index.res.headers.get('content-type') || '', /text\/html/)
  assert.match(index.texto, /Pain Panel|Pain Bot/)
  assert.match(index.res.headers.get('content-security-policy') || '', /default-src 'self'/)

  // Los assets se revalidan siempre: tras un git pull el navegador recibe la
  // versión nueva sin recargar a la fuerza.
  const asset = await pedir('/assets/app.js')
  assert.equal(asset.status, 200)
  assert.match(asset.res.headers.get('cache-control') || '', /no-cache/)
  const etag = asset.res.headers.get('etag')
  assert.ok(etag)
  const revalidado = await fetch(`${base}/assets/app.js`, { headers: { 'if-none-match': etag } })
  assert.equal(revalidado.status, 304)

  const registro = await pedir('/api/auth/register', {
    method: 'POST',
    body: {
      username: 'webuser',
      email: 'webuser@example.com',
      password: 'userpass123',
    },
  })
  assert.equal(registro.status, 201)
  assert.equal(registro.datos.user.username, 'webuser')
  assert.equal(registro.datos.user.role, 'user')
  assert.ok(registro.cookie.startsWith('pain_panel='))
  const cookieUsuario = registro.cookie
  const csrfUsuario = registro.datos.csrf

  // El correo es obligatorio al registrarse.
  const sinCorreo = await pedir('/api/auth/register', {
    method: 'POST',
    body: { username: 'sincorreo', password: 'userpass123' },
  })
  assert.equal(sinCorreo.status, 400)
  assert.equal(sinCorreo.datos.code, 'missing_email')

  // La cuenta puede añadir o cambiar su correo después.
  const cambioCorreo = await pedir('/api/account/email', {
    method: 'PATCH',
    cookie: cookieUsuario,
    csrf: csrfUsuario,
    body: { email: 'webuser.nuevo@example.com' },
  })
  assert.equal(cambioCorreo.status, 200)
  assert.equal(cambioCorreo.datos.user.email, 'webuser.nuevo@example.com')

  const duplicado = await pedir('/api/auth/register', {
    method: 'POST',
    body: { username: 'webuser', email: 'webuser2@example.com', password: 'userpass123' },
  })
  assert.equal(duplicado.status, 409)

  const me = await pedir('/api/auth/me', { cookie: cookieUsuario })
  assert.equal(me.status, 200)
  assert.equal(me.datos.user.username, 'webuser')
  assert.ok(me.datos.csrf)
  assert.ok(me.datos.user.last_login_at === null)

  const bots = await pedir('/api/bots', { cookie: cookieUsuario })
  assert.equal(bots.status, 200)
  assert.deepEqual(bots.datos.bots, [])

  // La vinculación desde el panel ya NO exige el bot principal: los sub-bots
  // son independientes. Aquí solo se comprueba que la API responde.

  const adminLogin = await pedir('/api/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: 'admin12345' },
  })
  assert.equal(adminLogin.status, 200)
  assert.equal(adminLogin.datos.user.role, 'admin')
  const cookieAdmin = adminLogin.cookie
  const csrfAdmin = adminLogin.datos.csrf
  assert.ok(adminLogin.datos.user.last_login_at > 0)

  const overviewUsuario = await pedir('/api/admin/overview', { cookie: cookieUsuario })
  assert.equal(overviewUsuario.status, 403)

  const overviewAdmin = await pedir('/api/admin/overview', { cookie: cookieAdmin })
  assert.equal(overviewAdmin.status, 200)
  assert.equal(overviewAdmin.datos.counts.users, 2)
  assert.equal(overviewAdmin.datos.counts.admins, 1)

  const usuarios = await pedir('/api/admin/users', { cookie: cookieAdmin })
  assert.equal(usuarios.status, 200)
  const filaWebuser = usuarios.datos.users.find((usuario) => usuario.username === 'webuser')
  assert.ok(filaWebuser)

  const sinCsrf = await pedir(`/api/admin/users/${filaWebuser.id}`, {
    method: 'PATCH',
    cookie: cookieAdmin,
    body: { role: 'admin' },
  })
  assert.equal(sinCsrf.status, 403)
  assert.equal(sinCsrf.datos.code, 'csrf')

  const conCsrf = await pedir(`/api/admin/users/${filaWebuser.id}`, {
    method: 'PATCH',
    cookie: cookieAdmin,
    csrf: csrfAdmin,
    body: { role: 'admin' },
  })
  assert.equal(conCsrf.status, 200)
  assert.equal(conCsrf.datos.user.role, 'admin')

  const volverUsuario = await pedir(`/api/admin/users/${filaWebuser.id}`, {
    method: 'PATCH',
    cookie: cookieAdmin,
    csrf: csrfAdmin,
    body: { role: 'user' },
  })
  assert.equal(volverUsuario.status, 200)
  assert.equal(volverUsuario.datos.user.role, 'user')

  const passwordIncorrecta = await pedir('/api/auth/password', {
    method: 'POST',
    cookie: cookieUsuario,
    csrf: csrfUsuario,
    body: { current: 'no-es-la-clave', password: 'nuevapass123' },
  })
  assert.equal(passwordIncorrecta.status, 401)
  assert.equal(passwordIncorrecta.datos.code, 'invalid_current_password')

  const cambioPassword = await pedir('/api/auth/password', {
    method: 'POST',
    cookie: cookieUsuario,
    csrf: csrfUsuario,
    body: { current: 'userpass123', password: 'nuevapass123' },
  })
  assert.equal(cambioPassword.status, 200)
  assert.ok(cambioPassword.datos.csrf)
  assert.ok(cambioPassword.cookie.startsWith('pain_panel='))
  assert.notEqual(cambioPassword.cookie, cookieUsuario)

  const cookieVieja = await pedir('/api/auth/me', { cookie: cookieUsuario })
  assert.equal(cookieVieja.status, 401)
  const cookieNueva = await pedir('/api/auth/me', { cookie: cambioPassword.cookie })
  assert.equal(cookieNueva.status, 200)
  assert.equal(cookieNueva.datos.user.username, 'webuser')

  const logout = await pedir('/api/auth/logout', {
    method: 'POST',
    cookie: cambioPassword.cookie,
    csrf: cambioPassword.datos.csrf,
  })
  assert.equal(logout.status, 200)
  const despuesLogout = await pedir('/api/auth/me', { cookie: cambioPassword.cookie })
  assert.equal(despuesLogout.status, 401)
})

test('webpanel server: cambia el usuario del entorno sin pisar la contraseña guardada', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pain-webpanel-admin-sync-'))
  const root = path.join(dir, 'Serbot')
  fs.mkdirSync(root, { recursive: true })
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))

  const base = {
    port: 0,
    host: '127.0.0.1',
    publicUrl: 'http://127.0.0.1',
    dataDir: dir,
    root,
    publicDir: path.resolve('webpanel', 'public'),
    allowRegistration: false,
    requireInvite: false,
    trustProxy: false,
  }

  async function arrancar(adminUser, adminPass) {
    const handle = await startWebPanel({ ...base, adminUser, adminPass })
    const pedir = crearCliente(`http://127.0.0.1:${handle.server.address().port}`)
    return { handle, pedir }
  }

  const primero = await arrancar('admin', 'admin12345')
  const inicial = await primero.pedir('/api/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: 'admin12345' },
  })
  assert.equal(inicial.status, 200)
  assert.equal(inicial.datos.user.isPrincipal, true)
  await primero.handle.close()

  // Al cambiar PAIN_WEB_ADMIN_USER se crea ese admin sin borrar el anterior.
  const segundo = await arrancar('nuevo', 'nuevo12345')
  const nuevo = await segundo.pedir('/api/auth/login', {
    method: 'POST',
    body: { username: 'nuevo', password: 'nuevo12345' },
  })
  assert.equal(nuevo.status, 200)
  assert.equal(nuevo.datos.user.role, 'admin')
  assert.equal(nuevo.datos.user.isPrincipal, true)
  assert.deepEqual(nuevo.datos.user.permissions, ['*'])
  const nuevosRoles = await segundo.pedir('/api/admin/roles', { cookie: nuevo.cookie })
  assert.equal(nuevosRoles.status, 200)
  assert.equal(nuevosRoles.datos.canManage, true)
  const nuevosAjustes = await segundo.pedir('/api/admin/settings', { cookie: nuevo.cookie })
  assert.equal(nuevosAjustes.datos.canTurnstile, true)
  assert.equal(nuevosAjustes.datos.canRoles, true)
  assert.equal(nuevosAjustes.datos.canMail, true)
  assert.equal(nuevosAjustes.datos.canLimits, true)
  const anteriorSigue = await segundo.pedir('/api/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: 'admin12345' },
  })
  assert.equal(anteriorSigue.status, 200)
  assert.equal(anteriorSigue.datos.user.isPrincipal, false)
  assert.ok(!anteriorSigue.datos.user.permissions.includes('*'))
  // Incluso la sesión abierta antes del cambio pierde el rol de principal.
  const sesionAnterior = await segundo.pedir('/api/auth/me', { cookie: inicial.cookie })
  assert.equal(sesionAnterior.datos.user.isPrincipal, false)
  assert.ok(!sesionAnterior.datos.user.permissions.includes('*'))
  await segundo.handle.close()

  // Sin PAIN_WEB_ADMIN_RESET, una contraseña nueva del .env no pisa la del panel.
  const tercero = await arrancar('admin', 'otra12345')
  const guardada = await tercero.pedir('/api/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: 'admin12345' },
  })
  assert.equal(guardada.status, 200)
  assert.equal(guardada.datos.user.isPrincipal, true)
  const delEntorno = await tercero.pedir('/api/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: 'otra12345' },
  })
  assert.equal(delEntorno.status, 401)
  await tercero.handle.close()
})

test('webpanel server: genera y guarda la contraseña inicial del admin', async (t) => {  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pain-webpanel-admin-'))
  const root = path.join(dir, 'Serbot')
  fs.mkdirSync(root, { recursive: true })
  const anterior = process.env.PAIN_WEB_ADMIN_PASS
  delete process.env.PAIN_WEB_ADMIN_PASS

  const handle = await startWebPanel({
    port: 0,
    host: '127.0.0.1',
    publicUrl: 'http://127.0.0.1',
    dataDir: dir,
    root,
    publicDir: path.resolve('webpanel', 'public'),
    adminUser: 'admin',
    adminPass: '',
    allowRegistration: false,
    requireInvite: false,
    trustProxy: false,
  })
  assert.ok(handle)
  t.after(async () => {
    await handle.close().catch(() => {})
    if (anterior === undefined) delete process.env.PAIN_WEB_ADMIN_PASS
    else process.env.PAIN_WEB_ADMIN_PASS = anterior
    fs.rmSync(dir, { recursive: true, force: true })
  })

  const archivo = path.join(dir, 'webpanel-admin.txt')
  assert.equal(fs.existsSync(archivo), true)
  const contenido = fs.readFileSync(archivo, 'utf8')
  assert.match(contenido, /Usuario: admin/)
  const password = contenido.match(/Contraseña: (.+)/)?.[1]?.trim()
  assert.ok(password && password.length >= 12)

  const pedir = crearCliente(`http://127.0.0.1:${handle.server.address().port}`)
  const login = await pedir('/api/auth/login', {
    method: 'POST',
    body: { username: 'admin', password },
  })
  assert.equal(login.status, 200)
  assert.equal(login.datos.user.role, 'admin')
  assert.ok(login.cookie.startsWith('pain_panel='))
})
