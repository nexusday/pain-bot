import crypto from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(crypto.scrypt)
const SCRYPT_N = 16384
const SCRYPT_R = 8
const SCRYPT_P = 1
const SCRYPT_KEYLEN = 64

/** Hash de contraseña con scrypt (salt aleatorio por usuario). */
export async function hashPassword(password) {
  const salt = crypto.randomBytes(16)
  const derived = await scrypt(String(password), salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: 64 * 1024 * 1024,
  })
  return `scrypt$${salt.toString('base64url')}$${derived.toString('base64url')}`
}

/** Verifica una contraseña contra el hash guardado (comparación constante). */
export async function verifyPassword(password, stored) {
  try {
    const [algoritmo, saltB64, hashB64] = String(stored || '').split('$')
    if (algoritmo !== 'scrypt' || !saltB64 || !hashB64) return false
    const salt = Buffer.from(saltB64, 'base64url')
    const esperado = Buffer.from(hashB64, 'base64url')
    const derived = await scrypt(String(password), salt, esperado.length, {
      N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: 64 * 1024 * 1024,
    })
    if (derived.length !== esperado.length) return false
    return crypto.timingSafeEqual(derived, esperado)
  } catch {
    return false
  }
}

export function generarToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url')
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex')
}

export function generarCsrf() {
  return crypto.randomBytes(24).toString('base64url')
}

function decodificar(valor) {
  try { return decodeURIComponent(valor) } catch { return valor }
}

/** Parsea la cabecera Cookie sin dependencias. */
export function parseCookies(header = '') {
  const cookies = {}
  for (const par of String(header).split(';')) {
    const i = par.indexOf('=')
    if (i < 0) continue
    const nombre = par.slice(0, i).trim()
    if (!nombre) continue
    cookies[nombre] = decodificar(par.slice(i + 1).trim())
  }
  return cookies
}

/** Serializa una cookie con flags seguros. */
export function serializeCookie(name, value, {
  maxAge = null,
  secure = false,
  httpOnly = true,
  sameSite = 'Lax',
  path = '/',
} = {}) {
  const partes = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`]
  if (httpOnly) partes.push('HttpOnly')
  if (secure) partes.push('Secure')
  if (sameSite) partes.push(`SameSite=${sameSite}`)
  if (Number.isFinite(maxAge)) {
    partes.push(`Max-Age=${Math.max(0, Math.floor(maxAge / 1000))}`)
    partes.push(`Expires=${new Date(Date.now() + maxAge).toUTCString()}`)
  }
  return partes.join('; ')
}

/** IP real del cliente (respeta proxies solo si se confía en ellos). */
export function ipDeRequest(req, trustProxy = true) {
  if (trustProxy) {
    const forwarded = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim()
    if (forwarded) return forwarded.replace(/^::ffff:/, '')
  }
  return String(req.socket?.remoteAddress || '').replace(/^::ffff:/, '') || 'desconocida'
}

/** Valida que una petición mutante venga del mismo sitio (anti-CSRF extra). */
export function origenValido(req, publicUrl = '') {
  const origen = req.headers?.origin || req.headers?.referer
  if (!origen) return true
  try {
    const hostOrigen = new URL(origen).host.toLowerCase()
    const hostActual = String(req.headers?.host || '').toLowerCase()
    if (hostOrigen && hostOrigen === hostActual) return true
    if (publicUrl) {
      const hostPublico = new URL(publicUrl).host.toLowerCase()
      if (hostOrigen === hostPublico) return true
    }
    return false
  } catch {
    return false
  }
}

/** Limitador de intentos en memoria (ventana deslizante simple). */
export class RateLimiter {
  constructor({ cleanupMs = 5 * 60 * 1000 } = {}) {
    this.buckets = new Map()
    this.timer = setInterval(() => this.cleanup(), cleanupMs)
    this.timer.unref?.()
  }

  hit(key, limit, windowMs) {
    const ahora = Date.now()
    let bucket = this.buckets.get(key)
    if (!bucket || ahora >= bucket.resetAt) {
      bucket = { count: 0, resetAt: ahora + windowMs }
      this.buckets.set(key, bucket)
    }
    bucket.count++
    const restantes = Math.max(0, limit - bucket.count)
    return {
      ok: bucket.count <= limit,
      restantes,
      retryAfterMs: Math.max(0, bucket.resetAt - ahora),
    }
  }

  reset(key) {
    this.buckets.delete(key)
  }

  cleanup() {
    const ahora = Date.now()
    for (const [key, bucket] of this.buckets) {
      if (ahora >= bucket.resetAt) this.buckets.delete(key)
    }
  }

  close() {
    clearInterval(this.timer)
    this.buckets.clear()
  }
}
