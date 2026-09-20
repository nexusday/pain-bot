import http from 'http'
import os from 'os'
import { createHmac, randomBytes, timingSafeEqual } from 'crypto'
import { registrarScoreSnake } from './snake-scores.js'

const sesiones = new Map() // sessionId -> { jid, name, tokenHash, startedAt, createdAt, expiresAt, lastScoreAt }
const TICK_MS = 120
const GRACE_POINTS = 30
const SESSION_TTL_MS = 45 * 60 * 1000
const MAX_SCORE = 5000

let server = null
let listeningPort = null
let cachedLanUrl = null

function secretoSnake() {
  if (!global.__snakeSecret) {
    global.__snakeSecret = randomBytes(32).toString('hex')
  }
  return global.__snakeSecret
}

function hashToken(token) {
  return createHmac('sha256', secretoSnake()).update(String(token)).digest('hex')
}

function safeEqualHex(a, b) {
  try {
    const ba = Buffer.from(String(a), 'hex')
    const bb = Buffer.from(String(b), 'hex')
    if (ba.length !== bb.length) return false
    return timingSafeEqual(ba, bb)
  } catch {
    return false
  }
}

function limpiarSesiones() {
  const now = Date.now()
  for (const [id, s] of sesiones) {
    if (!s || s.expiresAt < now) sesiones.delete(id)
  }
}

function puertoSnake() {
  return Number(listeningPort || process.env.PORT || process.env.SERVER_PORT || 3000) || 3000
}

/**
 * IP LAN de esta máquina (mismo WiFi que el celular).
 * No usa 127.0.0.1: en el teléfono eso sería el propio teléfono.
 */
export function detectarIpLan() {
  const ifaces = os.networkInterfaces()
  const candidatas = []
  for (const [nombre, list] of Object.entries(ifaces || {})) {
    const name = String(nombre || '').toLowerCase()
    // Evitar adaptadores virtuales (VirtualBox, VMware, Hyper-V, WSL, etc.)
    const virtual =
      /virtual|vmware|vbox|hyper-v|loopback|docker|vethernet|wsl|bluetooth|hamachi|radmin|tap|tun/i.test(name)
    for (const info of list || []) {
      if (!info || info.internal) continue
      const fam = info.family
      if (fam !== 'IPv4' && fam !== 4) continue
      const ip = String(info.address || '')
      if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) continue
      // Rangos típicos de adaptadores host-only
      if (ip.startsWith('192.168.56.') || ip.startsWith('192.168.137.') || ip.startsWith('172.17.')) continue
      let score = 0
      if (ip.startsWith('192.168.')) score = 30
      else if (ip.startsWith('10.')) score = 20
      else if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) score = 20
      else score = 5
      if (/wi-?fi|wlan|wireless|wifi|以太网|eth|en0|en1|local area/i.test(name)) score += 15
      if (virtual) score -= 40
      candidatas.push({ ip, score, name })
    }
  }
  candidatas.sort((a, b) => b.score - a.score)
  return candidatas[0]?.score > 0 ? candidatas[0].ip : (candidatas[0]?.ip || null)
}

function normalizarUrl(raw) {
  let url = String(raw || '').trim().replace(/\/+$/, '')
  if (!url) return null
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`
  try {
    new URL(url)
    return url
  } catch {
    return null
  }
}

/**
 * URL que el WebView del celular puede alcanzar.
 * Orden:
 * 1) Config / env (dominio, ngrok)
 * 2) Pterodactyl: SERVER_IP + SERVER_PORT (allocation del panel)
 * 3) IP LAN (misma WiFi)
 *
 * SQL no aplica: el celular habla HTTP con el bot; los puntos van a la DB JSON del bot.
 */
export function obtenerSnakePublicUrl() {
  const raw =
    process.env.SNAKE_PUBLIC_URL ||
    process.env.PUBLIC_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    process.env.RAILWAY_PUBLIC_DOMAIN ||
    global.snakePublicUrl ||
    ''
  const configured = normalizarUrl(raw)
  if (configured) return configured

  // Pterodactyl / paneles: IP + puerto de la allocation
  const pteroIp = String(
    process.env.SERVER_IP ||
    process.env.P_SERVER_IP ||
    process.env.EXTERNAL_IP ||
    ''
  ).trim()
  const pteroPort = Number(
    process.env.SERVER_PORT ||
    process.env.P_SERVER_PORT ||
    process.env.EXTERNAL_PORT ||
    listeningPort ||
    process.env.PORT ||
    0
  )
  // Ignorar IPs internas del contenedor / placeholder
  const ipOk =
    pteroIp &&
    pteroIp !== '0.0.0.0' &&
    pteroIp !== '127.0.0.1' &&
    pteroIp !== 'localhost' &&
    !pteroIp.startsWith('172.') // red docker interna típica en wings
  if (ipOk && pteroPort > 0) {
    return `http://${pteroIp}:${pteroPort}`
  }

  // Auto: misma red local (PC en casa)
  if (cachedLanUrl) return cachedLanUrl
  const ip = detectarIpLan()
  if (!ip) return null
  cachedLanUrl = `http://${ip}:${puertoSnake()}`
  return cachedLanUrl
}

export function dominiosTrustedSnake() {
  const url = obtenerSnakePublicUrl()
  if (!url) return []
  try {
    const u = new URL(url)
    const base = `${u.protocol}//${u.host}` // host incluye puerto si aplica
    const out = new Set([
      // Formato que usa WhatsApp / forks Baileys (URL completa, no solo hostname)
      base,
      `${base}/`,
      url,
      url.endsWith('/') ? url : `${url}/`
    ])
    if (u.hostname) out.add(u.hostname)
    if (u.host) out.add(u.host)
    if (u.port) out.add(`${u.hostname}:${u.port}`)
    return [...out].filter(Boolean)
  } catch {
    return []
  }
}

export function snakeApiLista() {
  return Boolean(obtenerSnakePublicUrl() && server && listeningPort)
}

/**
 * Crea sesión firmada para un jugador. El HTML solo conoce token + sessionId + apiBase.
 */
export function crearSesionSnake({ jid, name = 'Jugador' } = {}) {
  limpiarSesiones()
  const sessionId = randomBytes(12).toString('hex')
  const token = randomBytes(24).toString('hex')
  const now = Date.now()
  sesiones.set(sessionId, {
    jid: String(jid),
    name: String(name || 'Jugador').slice(0, 40),
    tokenHash: hashToken(token),
    createdAt: now,
    startedAt: now,
    expiresAt: now + SESSION_TTL_MS,
    lastScoreAt: 0,
    submits: 0
  })
  return {
    sessionId,
    token,
    apiBase: obtenerSnakePublicUrl(),
    expiresAt: now + SESSION_TTL_MS
  }
}

function authSesion(req, body) {
  const auth = String(req.headers.authorization || '')
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  const token = bearer || body?.token || ''
  const sessionId = body?.sessionId || req.headers['x-snake-session'] || ''
  if (!sessionId || !token) return { ok: false, error: 'auth' }

  const ses = sesiones.get(sessionId)
  if (!ses) return { ok: false, error: 'sesion' }
  if (ses.expiresAt < Date.now()) {
    sesiones.delete(sessionId)
    return { ok: false, error: 'expirada' }
  }
  if (!safeEqualHex(ses.tokenHash, hashToken(token))) {
    return { ok: false, error: 'token' }
  }
  return { ok: true, ses, sessionId }
}

function maxScorePorTiempo(startedAt) {
  const elapsed = Math.max(0, Date.now() - startedAt)
  const theoretical = Math.floor(elapsed / TICK_MS) * 10
  return Math.min(MAX_SCORE, theoretical + GRACE_POINTS)
}

function leerBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size > 64 * 1024) {
        reject(new Error('body_grande'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (!raw) return resolve({})
      try {
        resolve(JSON.parse(raw))
      } catch {
        reject(new Error('json'))
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res, code, data) {
  const body = JSON.stringify(data)
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Snake-Session',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  })
  res.end(body)
}

async function manejarRequest(req, res) {
  const url = new URL(req.url || '/', 'http://localhost')
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Snake-Session',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Max-Age': '86400'
    })
    return res.end()
  }

  if (req.method === 'GET' && (url.pathname === '/api/snake/health' || url.pathname === '/snake/health')) {
    return sendJson(res, 200, { ok: true, service: 'snake' })
  }

  // GET score (beacon / img) — mismo auth por query, por si fetch POST falla en el WebView
  if (req.method === 'GET' && (url.pathname === '/api/snake/score' || url.pathname === '/snake/score')) {
    try {
      const body = {
        sessionId: url.searchParams.get('sessionId') || '',
        token: url.searchParams.get('token') || '',
        score: url.searchParams.get('score')
      }
      const auth = authSesion(req, body)
      if (!auth.ok) return sendJson(res, 401, { ok: false, error: auth.error })

      const score = Math.floor(Number(body.score))
      if (!Number.isFinite(score) || score < 0 || score % 10 !== 0) {
        return sendJson(res, 400, { ok: false, error: 'score' })
      }
      if (score > MAX_SCORE) {
        return sendJson(res, 400, { ok: false, error: 'alto', max: MAX_SCORE })
      }
      const maxOk = maxScorePorTiempo(auth.ses.startedAt)
      if (score > maxOk) {
        return sendJson(res, 400, { ok: false, error: 'imposible', max: maxOk })
      }
      if (auth.ses.lastScoreAt && Date.now() - auth.ses.lastScoreAt < 3000) {
        return sendJson(res, 429, { ok: false, error: 'cooldown' })
      }

      const r = await registrarScoreSnake(auth.ses.jid, score, auth.ses.name)
      if (!r.ok) {
        return sendJson(res, 400, { ok: false, error: r.error, wait: r.wait, max: r.max, step: r.step })
      }
      auth.ses.lastScoreAt = Date.now()
      auth.ses.submits += 1
      auth.ses.startedAt = Date.now()
      return sendJson(res, 200, {
        ok: true,
        score: r.score,
        best: r.best,
        total: r.total,
        games: r.games,
        newRecord: r.newRecord
      })
    } catch {
      return sendJson(res, 400, { ok: false, error: 'bad_request' })
    }
  }

  // GET start (por si POST está bloqueado)
  if (req.method === 'GET' && (url.pathname === '/api/snake/start' || url.pathname === '/snake/start')) {
    try {
      const body = {
        sessionId: url.searchParams.get('sessionId') || '',
        token: url.searchParams.get('token') || ''
      }
      const auth = authSesion(req, body)
      if (!auth.ok) return sendJson(res, 401, { ok: false, error: auth.error })
      auth.ses.startedAt = Date.now()
      auth.ses.expiresAt = Date.now() + SESSION_TTL_MS
      return sendJson(res, 200, { ok: true, startedAt: auth.ses.startedAt })
    } catch {
      return sendJson(res, 400, { ok: false, error: 'bad_request' })
    }
  }

  if (req.method === 'POST' && (url.pathname === '/api/snake/start' || url.pathname === '/snake/start')) {
    try {
      const body = await leerBody(req)
      const auth = authSesion(req, body)
      if (!auth.ok) return sendJson(res, 401, { ok: false, error: auth.error })
      auth.ses.startedAt = Date.now()
      auth.ses.expiresAt = Date.now() + SESSION_TTL_MS
      return sendJson(res, 200, { ok: true, startedAt: auth.ses.startedAt })
    } catch {
      return sendJson(res, 400, { ok: false, error: 'bad_request' })
    }
  }

  if (req.method === 'POST' && (url.pathname === '/api/snake/score' || url.pathname === '/snake/score')) {
    try {
      const body = await leerBody(req)
      const auth = authSesion(req, body)
      if (!auth.ok) return sendJson(res, 401, { ok: false, error: auth.error })

      const score = Math.floor(Number(body.score))
      if (!Number.isFinite(score) || score < 0 || score % 10 !== 0) {
        return sendJson(res, 400, { ok: false, error: 'score' })
      }
      if (score > MAX_SCORE) {
        return sendJson(res, 400, { ok: false, error: 'alto', max: MAX_SCORE })
      }

      const maxOk = maxScorePorTiempo(auth.ses.startedAt)
      if (score > maxOk) {
        return sendJson(res, 400, {
          ok: false,
          error: 'imposible',
          max: maxOk,
          detail: 'score_mayor_al_tiempo_de_partida'
        })
      }

    
      if (auth.ses.lastScoreAt && Date.now() - auth.ses.lastScoreAt < 3000) {
        return sendJson(res, 429, { ok: false, error: 'cooldown' })
      }

      const r = await registrarScoreSnake(auth.ses.jid, score, auth.ses.name)
      if (!r.ok) {
        return sendJson(res, 400, { ok: false, error: r.error, wait: r.wait, max: r.max, step: r.step })
      }

      auth.ses.lastScoreAt = Date.now()
      auth.ses.submits += 1
      
      auth.ses.startedAt = Date.now()

      return sendJson(res, 200, {
        ok: true,
        score: r.score,
        best: r.best,
        total: r.total,
        games: r.games,
        newRecord: r.newRecord
      })
    } catch {
      return sendJson(res, 400, { ok: false, error: 'bad_request' })
    }
  }

  return sendJson(res, 404, { ok: false, error: 'not_found' })
}

export function iniciarSnakeApi(port = Number(process.env.PORT || process.env.SERVER_PORT || 3000)) {
  if (server) return { server, port: listeningPort }

  server = http.createServer((req, res) => {
    manejarRequest(req, res).catch(() => {
      try { sendJson(res, 500, { ok: false, error: 'server' }) } catch {}
    })
  })

  server.listen(port, '0.0.0.0', () => {
    listeningPort = port
    cachedLanUrl = null // recalcular con el puerto real
    const pub = obtenerSnakePublicUrl()
    const lan = detectarIpLan()
    console.log(
      `[snake-api] Escuchando :${port}` +
        (pub ? ` · URL ${pub}` : '') +
        (lan && (!pub || !pub.includes(lan)) ? ` · LAN http://${lan}:${port}` : '') +
        (!pub ? ' · (celular y PC en la misma WiFi, o define snakePublicUrl)' : '')
    )
  })

  server.on('error', (err) => {
    console.error('[snake-api] Error:', err?.message || err)
  })

  return { server, port }
}

export {
  crearSesionSnake as createSnakeSession,
  obtenerSnakePublicUrl as getSnakePublicUrl,
  dominiosTrustedSnake as getSnakeTrustedHosts,
  snakeApiLista as isSnakeApiReady,
  iniciarSnakeApi as startSnakeApi,
  detectarIpLan as detectLanIp
}
