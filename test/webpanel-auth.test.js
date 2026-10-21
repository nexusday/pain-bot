import assert from 'node:assert/strict'
import test from 'node:test'
import {
  generarCsrf,
  generarToken,
  hashPassword,
  hashToken,
  ipDeRequest,
  origenValido,
  parseCookies,
  RateLimiter,
  serializeCookie,
  verifyPassword,
} from '../lib/webpanel/auth.js'

test('webpanel: hash de contraseña con scrypt', async () => {
  const hash = await hashPassword('una-clave-segura')
  assert.match(hash, /^scrypt\$[^$]+\$[^$]+$/)
  assert.equal(await verifyPassword('una-clave-segura', hash), true)
  assert.equal(await verifyPassword('otra-clave', hash), false)
  assert.equal(await verifyPassword('una-clave-segura', 'basura'), false)
  assert.equal(await verifyPassword('una-clave-segura', ''), false)
})

test('webpanel: tokens y CSRF son aleatorios y se pueden hashear', () => {
  const a = generarToken()
  const b = generarToken()
  assert.notEqual(a, b)
  assert.equal(hashToken(a), hashToken(a))
  assert.notEqual(hashToken(a), hashToken(b))
  assert.notEqual(generarCsrf(), generarCsrf())
})

test('webpanel: cookies HttpOnly/Secure y parseo', () => {
  const cookie = serializeCookie('pain_panel', 'abc 123', {
    maxAge: 60_000,
    secure: true,
    sameSite: 'Strict',
    path: '/',
  })
  assert.match(cookie, /^pain_panel=abc%20123/)
  assert.match(cookie, /HttpOnly/)
  assert.match(cookie, /Secure/)
  assert.match(cookie, /SameSite=Strict/)
  assert.match(cookie, /Max-Age=60/)
  assert.equal(parseCookies('a=1; pain_panel=abc%20123; vacio=').pain_panel, 'abc 123')
  assert.deepEqual(parseCookies('sin-igual'), {})
})

test('webpanel: validación de origen contra host y URL pública', () => {
  assert.equal(origenValido({ headers: {} }), true)
  assert.equal(origenValido({ headers: { origin: 'https://pain.example.com', host: 'pain.example.com' } }), true)
  assert.equal(origenValido({ headers: { origin: 'https://evil.example', host: 'pain.example.com' } }), false)
  assert.equal(origenValido(
    { headers: { origin: 'https://pain.example.com', host: '127.0.0.1:10022' } },
    'https://pain.example.com'
  ), true)
  assert.equal(origenValido({ headers: { origin: 'no-es-una-url', host: 'pain.example.com' } }), false)
})

test('webpanel: IP real respeta trustProxy', () => {
  const req = {
    headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' },
    socket: { remoteAddress: '::ffff:127.0.0.1' },
  }
  assert.equal(ipDeRequest(req, true), '203.0.113.9')
  assert.equal(ipDeRequest(req, false), '127.0.0.1')
  assert.equal(ipDeRequest({ headers: {}, socket: {} }, true), 'desconocida')
})

test('webpanel: RateLimiter corta al superar el límite y limpia', () => {
  const limiter = new RateLimiter({ cleanupMs: 60_000 })
  try {
    assert.equal(limiter.hit('login:1.2.3.4', 2, 60_000).ok, true)
    assert.equal(limiter.hit('login:1.2.3.4', 2, 60_000).ok, true)
    const tercero = limiter.hit('login:1.2.3.4', 2, 60_000)
    assert.equal(tercero.ok, false)
    assert.equal(tercero.restantes, 0)
    assert.ok(tercero.retryAfterMs > 0)
    limiter.reset('login:1.2.3.4')
    assert.equal(limiter.hit('login:1.2.3.4', 2, 60_000).ok, true)
  } finally {
    limiter.close()
  }
})
