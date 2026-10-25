import assert from 'node:assert/strict'
import crypto from 'node:crypto'
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

async function panelDePrueba(t, opciones = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pain-webpanel-verif-'))
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

test('webpanel: con verificación obligatoria el registro no entra hasta confirmar el correo', async (t) => {
  const { handle, pedir } = await panelDePrueba(t)

  // Se activa la verificación obligatoria directamente en el almacén: el
  // panel exige SMTP configurado para activarla desde la interfaz.
  await handle.store.establecerMeta('require_email_verification', '1')

  const registro = await pedir('/api/auth/register', {
    method: 'POST',
    body: { username: 'pendiente', email: 'pendiente@example.com', password: 'usuario12345' },
  })
  assert.equal(registro.status, 201)
  assert.equal(registro.datos.pendingVerification, true)
  assert.equal(registro.datos.csrf, null)
  assert.equal(registro.cookie, '')

  // Sin código no hay sesión.
  const login = await pedir('/api/auth/login', {
    method: 'POST',
    body: { username: 'pendiente', password: 'usuario12345' },
  })
  assert.equal(login.status, 403)
  assert.equal(login.datos.code, 'email_not_verified')

  // El administrador principal nunca queda fuera, aunque no tenga correo
  // verificado: es quien puede arreglar el SMTP o desactivar la exigencia.
  const loginAdmin = await pedir('/api/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: 'admin12345' },
  })
  assert.equal(loginAdmin.status, 200)
  assert.ok(loginAdmin.cookie.startsWith('pain_panel='))

  // Un código inventado no sirve.
  const incorrecto = await pedir('/api/auth/verify', {
    method: 'POST',
    body: { email: 'pendiente@example.com', code: '000000' },
  })
  assert.equal(incorrecto.status, 400)
  assert.equal(incorrecto.datos.code, 'invalid_code')

  // Un código real (mismo hash que generaría el servidor) sí verifica la
  // cuenta y abre la sesión desde la propia pantalla de acceso.
  const usuario = await handle.store.buscarUsuarioPorEmail('pendiente@example.com')
  const codigo = '432198'
  await handle.store.crearTokenCorreo({
    userId: usuario.id,
    email: usuario.email,
    purpose: 'verify',
    codeHash: crypto.createHmac('sha256', handle.config.sessionSecret).update(codigo).digest('hex'),
    expiresAt: Date.now() + 10 * 60 * 1000,
  })
  const verificado = await pedir('/api/auth/verify', {
    method: 'POST',
    body: { email: 'pendiente@example.com', code: codigo },
  })
  assert.equal(verificado.status, 200)
  assert.equal(verificado.datos.emailVerified, true)
  assert.ok(verificado.cookie.startsWith('pain_panel='))

  // El reenvío responde en genérico y no revela si la cuenta existe.
  const reenvio = await pedir('/api/auth/verify/send', {
    method: 'POST',
    body: { email: 'pendiente@example.com' },
  })
  assert.equal(reenvio.status, 200)
  assert.equal(reenvio.datos.ok, true)
  assert.equal(reenvio.datos.mailConfigured, false)

  // Con la opción apagada, el login normal vuelve a funcionar sin verificar.
  await handle.store.establecerMeta('require_email_verification', '0')
  const loginLibre = await pedir('/api/auth/login', {
    method: 'POST',
    body: { username: 'pendiente', password: 'usuario12345' },
  })
  assert.equal(loginLibre.status, 200)
  assert.ok(loginLibre.cookie.startsWith('pain_panel='))
})

test('webpanel: los límites de los códigos por correo se configuran en la sección de correo', async (t) => {
  const { pedir } = await panelDePrueba(t)

  const login = await pedir('/api/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: 'admin12345' },
  })
  const cookieAdmin = login.cookie
  const csrfAdmin = login.datos.csrf

  const inicial = await pedir('/api/admin/mail', { cookie: cookieAdmin })
  assert.equal(inicial.status, 200)
  assert.equal(inicial.datos.emailCodeMaxPerHour, 10)
  assert.equal(inicial.datos.emailCodeCooldownSeconds, 60)
  assert.equal(inicial.datos.emailCodeTtlSeconds, 900)
  assert.equal(inicial.datos.emailCodeMaxAttempts, 5)

  const guardado = await pedir('/api/admin/mail', {
    method: 'PATCH',
    cookie: cookieAdmin,
    csrf: csrfAdmin,
    body: {
      emailCodeMaxPerHour: 4,
      emailCodeCooldownSeconds: 30,
      emailCodeTtlSeconds: 600,
      emailCodeMaxAttempts: 3,
    },
  })
  assert.equal(guardado.status, 200)
  assert.equal(guardado.datos.emailCodeMaxPerHour, 4)
  assert.equal(guardado.datos.emailCodeCooldownSeconds, 30)
  assert.equal(guardado.datos.emailCodeTtlSeconds, 600)
  assert.equal(guardado.datos.emailCodeMaxAttempts, 3)

  // Los valores se aplican al instante (mismos datos en Ajustes → Intentos).
  const ajustes = await pedir('/api/admin/settings', { cookie: cookieAdmin })
  assert.equal(ajustes.status, 200)
  assert.equal(ajustes.datos.emailCodeMaxPerHour, 4)
  assert.equal(ajustes.datos.emailCodeCooldownSeconds, 30)
})
