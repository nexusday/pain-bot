import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

function entero(valor, porDefecto) {
  const n = Number.parseInt(valor, 10)
  return Number.isFinite(n) ? n : porDefecto
}

function limpiarUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '')
}

function asegurarSecreto(ruta) {
  try {
    if (fs.existsSync(ruta)) {
      const existente = fs.readFileSync(ruta, 'utf8').trim()
      if (existente.length >= 32) return existente
    }
  } catch {}
  const secreto = crypto.randomBytes(48).toString('base64url')
  try {
    fs.mkdirSync(path.dirname(ruta), { recursive: true })
    fs.writeFileSync(ruta, secreto, { mode: 0o600 })
  } catch {}
  return secreto
}

/**
 * Resuelve la configuración del panel. Nada de dominios fijos en el código:
 * todo sale de `global.webPanel` (config.js) y de variables PAIN_WEB_*.
 */
export function cargarConfigPanel(overrides = {}) {
  const base = (global.webPanel && typeof global.webPanel === 'object') ? global.webPanel : {}
  const raw = { ...base, ...overrides }

  const port = entero(process.env.PAIN_WEB_PORT ?? raw.port, 10022)
  const host = String(process.env.PAIN_WEB_HOST || raw.host || '0.0.0.0')
  const subdomain = String(process.env.PAIN_WEB_SUBDOMAIN ?? raw.subdomain ?? '').trim().replace(/^\.+|\.+$/g, '')
  const domain = String(process.env.PAIN_WEB_DOMAIN ?? raw.domain ?? '').trim().replace(/^\.+|\.+$/g, '')

  let publicUrl = limpiarUrl(process.env.PAIN_WEB_PUBLIC_URL || raw.publicUrl || '')
  if (!publicUrl) {
    if (domain) {
      const hostPublico = subdomain ? `${subdomain}.${domain}` : domain
      const incluirPuerto = raw.includePort === true || process.env.PAIN_WEB_INCLUDE_PORT === '1'
      const puerto = incluirPuerto && port !== 80 && port !== 443 ? `:${port}` : ''
      publicUrl = `https://${hostPublico}${puerto}`
    } else {
      publicUrl = `http://localhost:${port}`
    }
  }

  const root = path.resolve(process.cwd(), raw.root || global.bot || 'Serbot')
  const dataDir = raw.dataDir
    ? path.resolve(process.cwd(), raw.dataDir)
    : path.resolve(process.cwd(), 'storage')
  const publicDir = raw.publicDir
    ? path.resolve(process.cwd(), raw.publicDir)
    : path.resolve(process.cwd(), 'webpanel', 'public')
  const dbFile = raw.dbFile
    ? path.resolve(process.cwd(), raw.dbFile)
    : path.resolve(dataDir, 'webpanel.sqlite')
  const secretFile = path.resolve(dataDir, 'webpanel.secret')

  const sessionSecret = String(
    process.env.PAIN_WEB_SECRET || raw.sessionSecret || ''
  ) || asegurarSecreto(secretFile)

  return {
    enabled: raw.enabled !== false && process.env.PAIN_WEB_ENABLED !== '0',
    host,
    port,
    subdomain,
    domain,
    publicUrl,
    brandName: String(process.env.PAIN_WEB_BRAND || raw.brandName || 'PAIN BOT MD'),
    adminUser: String(process.env.PAIN_WEB_ADMIN_USER || raw.adminUser || 'admin'),
    adminPass: String(process.env.PAIN_WEB_ADMIN_PASS || raw.adminPass || ''),
    adminEmail: String(process.env.PAIN_WEB_ADMIN_EMAIL || raw.adminEmail || '').trim().toLowerCase(),
    adminReset: process.env.PAIN_WEB_ADMIN_RESET === '1',
    sessionSecret,
    trustProxy: raw.trustProxy !== false && process.env.PAIN_WEB_TRUST_PROXY !== '0',
    cookieName: String(process.env.PAIN_WEB_COOKIE || raw.cookieName || 'pain_panel'),
    cookieSecure: publicUrl.startsWith('https://'),
    sessionTtlMs: entero(process.env.PAIN_WEB_SESSION_TTL, raw.sessionTtlMs ?? 7 * 24 * 60 * 60 * 1000),
    pairTtlMs: entero(process.env.PAIN_WEB_PAIR_TTL, raw.pairTtlMs ?? 180_000),
    codeTtlMs: entero(process.env.PAIN_WEB_CODE_TTL, raw.codeTtlMs ?? 90_000),
    maxPairAttemptsPerHour: entero(process.env.PAIN_WEB_MAX_LINKS_HOUR, raw.maxPairAttemptsPerHour ?? 8),
    maxPairAttemptsPerDay: entero(process.env.PAIN_WEB_MAX_LINKS_DAY, raw.maxPairAttemptsPerDay ?? 30),
    // Intentos de login y espera tras superarlos. Se pueden cambiar desde
    // Ajustes → Intentos (0 intentos = sin límite).
    maxLoginAttemptsGlobal: entero(process.env.PAIN_WEB_MAX_LOGIN_ATTEMPTS_GLOBAL, raw.maxLoginAttemptsGlobal ?? 200),
    maxLoginAttemptsPerUser: entero(process.env.PAIN_WEB_MAX_LOGIN_ATTEMPTS_PER_USER, raw.maxLoginAttemptsPerUser ?? 10),
    loginCooldownMs: entero(process.env.PAIN_WEB_LOGIN_COOLDOWN_MS, raw.loginCooldownMs ?? 5 * 60 * 1000),
    maxPairAttemptsPerIpPerHour: entero(process.env.PAIN_WEB_MAX_LINKS_IP_HOUR, raw.maxPairAttemptsPerIpPerHour ?? 20),
    pairCooldownMs: entero(process.env.PAIN_WEB_PAIR_COOLDOWN_MS, raw.pairCooldownMs ?? 30_000),
    allowRegistration: raw.allowRegistration !== false && process.env.PAIN_WEB_ALLOW_REGISTER !== '0',
    requireInvite: raw.requireInvite === true || process.env.PAIN_WEB_REQUIRE_INVITE === '1',
    inviteCode: String(process.env.PAIN_WEB_INVITE || raw.inviteCode || ''),
    root,
    dataDir,
    publicDir,
    dbFile,
    runtimeLockDir: path.resolve(raw.runtimeLockDir || path.join(process.cwd(),'storage')),
    globalDbFile: path.resolve(raw.globalDbFile || path.join(process.cwd(),'storage','databases','database.sqlite')),
    secretFile,
    version: '1.9.1',
  }
}

/** Orígenes/hosts aceptados para peticiones mutantes. */
export function hostsPermitidos(config, req) {
  const hosts = new Set()
  try { hosts.add(new URL(config.publicUrl).host.toLowerCase()) } catch {}
  const actual = String(req?.headers?.host || '').toLowerCase()
  if (actual) hosts.add(actual)
  return hosts
}
