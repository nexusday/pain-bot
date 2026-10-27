import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { startWebPanel } from '../lib/webpanel/server.js'

function cookie(res) { return (res.headers.get('set-cookie') || '').split(';')[0] }
function cliente(base) {
  return async (ruta, opciones = {}) => {
    const headers = { ...(opciones.cookie ? { cookie: opciones.cookie } : {}), ...(opciones.csrf ? { 'x-csrf-token': opciones.csrf } : {}) }
    if (opciones.body !== undefined) headers['content-type'] = 'application/json'
    const res = await fetch(base + ruta, { method: opciones.method || 'GET', headers, body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body) })
    const text = await res.text()
    let data = null
    try { data = JSON.parse(text) } catch {}
    return { res, data, cookie: cookie(res) }
  }
}

test('comentarios: correo verificado publica, responde y los permisos moderan', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pain-comments-'))
  const handle = await startWebPanel({ port: 0, host: '127.0.0.1', publicUrl: 'http://127.0.0.1', dataDir: dir, root: path.join(dir, 'Serbot'), publicDir: path.resolve('webpanel', 'public'), adminUser: 'admin', adminPass: 'admin12345', allowRegistration: true, requireInvite: false, trustProxy: false })
  t.after(async () => { await handle.close(); fs.rmSync(dir, { recursive: true, force: true }) })
  const pedir = cliente(`http://127.0.0.1:${handle.server.address().port}`)

  const registro = await pedir('/api/auth/register', { method: 'POST', body: { username: 'comentador', email: 'comentador@example.com', password: 'userpass123' } })
  const userCookie = registro.cookie
  const userCsrf = registro.data.csrf
  const usuario = await handle.store.buscarUsuarioPorNombre('comentador')
  await handle.store.marcarEmailVerificado(usuario.id, usuario.email)
  const avatar = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
  const foto = await pedir('/api/account/avatar', { method: 'POST', cookie: userCookie, csrf: userCsrf, body: { image: avatar } })
  assert.equal(foto.res.status, 200)
  assert.ok(foto.data.user.profileImage)
  const fotoPublica = await pedir(`/api/account/avatar/${usuario.id}`, { cookie: userCookie })
  assert.equal(fotoPublica.res.status, 200)

  const lista = await pedir('/api/comments', { cookie: userCookie })
  assert.equal(lista.res.status, 200)
  assert.equal(lista.data.blocked, false)

  const publicado = await pedir('/api/comments', { method: 'POST', cookie: userCookie, csrf: userCsrf, body: { text: 'Primer mensaje' } })
  assert.equal(publicado.res.status, 201)
  const id = publicado.data.comment.id
  const respuesta = await pedir('/api/comments', { method: 'POST', cookie: userCookie, csrf: userCsrf, body: { text: 'Una respuesta', parentId: id } })
  assert.equal(respuesta.res.status, 201)
  assert.equal(respuesta.data.comment.parentId, id)

  const adminLogin = await pedir('/api/auth/login', { method: 'POST', body: { username: 'admin', password: 'admin12345' } })
  const adminCookie = adminLogin.cookie
  const adminCsrf = adminLogin.data.csrf
  const limite = await pedir(`/api/admin/users/${usuario.id}`, { method: 'PATCH', cookie: adminCookie, csrf: adminCsrf, body: { maxSubs: 3 } })
  assert.equal(limite.res.status, 200)
  assert.equal(limite.data.user.maxSubs, 3)
  await handle.store.upsertBot({ userId: usuario.id, phone: '5215555555555', folder: '5215555555555', status: 'linked' })
  const premium = await pedir(`/api/admin/users/${usuario.id}/premium`, { method: 'POST', cookie: adminCookie, csrf: adminCsrf, body: { phone: '5215555555555', hours: 12 } })
  assert.equal(premium.res.status, 200)
  assert.equal(premium.data.premium.active, true)
  const eliminadoSinPermiso = await pedir(`/api/comments/${id}`, { method: 'DELETE', cookie: userCookie, csrf: userCsrf })
  assert.equal(eliminadoSinPermiso.res.status, 403)
  const eliminado = await pedir(`/api/comments/${id}`, { method: 'DELETE', cookie: adminCookie, csrf: adminCsrf })
  assert.equal(eliminado.res.status, 200)
  const bloqueado = await pedir(`/api/comments/users/${usuario.id}/block`, { method: 'POST', cookie: adminCookie, csrf: adminCsrf, body: {} })
  assert.equal(bloqueado.res.status, 200)
  const rechazado = await pedir('/api/comments', { method: 'POST', cookie: userCookie, csrf: userCsrf, body: { text: 'No debería entrar' } })
  assert.equal(rechazado.res.status, 403)
  assert.equal(rechazado.data.code, 'comments_blocked')
})
