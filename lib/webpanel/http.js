/* Pain Panel — núcleo HTTP compartido (respuestas, seguridad, errores) */
import { redactIps } from './privacy.js'
import { MailError } from './mailer.js'
import { MainBotError } from './main-bot.js'
import { PairingError } from './pairing.js'
import { esAdminPermisos, parsearPermisos, permisosLegacy } from './permissions.js'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
}

class HttpError extends Error {
  constructor(status, message, code = null) {
    super(message)
    this.status = status
    this.code = code
  }
}

function json(res, status, payload, extraHeaders = {}) {
  if (res.hideUserIps) payload = redactIps(payload)
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...extraHeaders,
  })
  res.end(body)
}

function cabecerasSeguridad(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; " +
    "img-src 'self' data:; style-src 'self' 'unsafe-inline'; " +
    "script-src 'self' https://challenges.cloudflare.com; " +
    "connect-src 'self' https://challenges.cloudflare.com; " +      "frame-src 'self' https://challenges.cloudflare.com"
  )
}

async function leerJson(req, maxBytes = 64 * 1024) {
  let total = 0
  const partes = []
  for await (const parte of req) {
    total += parte.length
    if (total > maxBytes) throw new HttpError(413, 'Cuerpo de la petición demasiado grande.')
    partes.push(parte)
  }
  if (!partes.length) return {}
  try {
    const datos = JSON.parse(Buffer.concat(partes).toString('utf8'))
    return datos && typeof datos === 'object' && !Array.isArray(datos) ? datos : {}
  } catch {
    throw new HttpError(400, 'JSON inválido.')
  }
}

function permisosDeUsuario(usuario) {
  if (!usuario) return []
  if (Number(usuario.is_principal) === 1) return ['*']
  if (usuario.role_permissions !== null && usuario.role_permissions !== undefined) {
    return parsearPermisos(usuario.role_permissions)
  }
  return permisosLegacy(usuario.role)
}

function usuarioPublico(usuario) {
  if (!usuario) return null
  const permissions = permisosDeUsuario(usuario)
  const isPrincipal = Number(usuario.is_principal) === 1
  return {
    id: usuario.id,
    username: usuario.username,
    email: usuario.email || null,
    role: usuario.role,
    roleId: usuario.role_id || null,
    roleName: usuario.role_name || (usuario.role === 'admin' ? 'Administrador' : 'Usuario'),
    isPrincipal,
    isAdmin: isPrincipal || esAdminPermisos(permissions),
    permissions,
    emailVerified: Boolean(usuario.email_verified_at),
    emailVerifiedAt: usuario.email_verified_at || null,
    maxSubs: usuario.max_subbots === null || usuario.max_subbots === undefined ? null : Number(usuario.max_subbots),
    profileImage: usuario.profile_image_file ? '/api/account/avatar' : null,
    status: usuario.status,
    created_at: usuario.created_at,
    last_login_at: usuario.last_login_at || null,
  }
}

function mapaError(error) {
  if (['runtime_busy', 'runtime_timeout', 'runtime_unavailable'].includes(error?.code)) {
    return { status: 503, code: error.code, message: error.message }
  }
  if (error?.code === 'SQLITE_CONSTRAINT') {
    return { status: 409, code: 'account_conflict', message: 'El usuario o correo ya está registrado.' }
  }
  if (error instanceof HttpError) return { status: error.status, code: error.code, message: error.message }
  if (error instanceof MainBotError) {
    const statuses = {
      invalid_phone: 400,
      main_unavailable: 409,
      main_already_linked: 409,
      main_not_linked: 409,
      main_socket_closed: 409,
      unsupported: 501,
      request_failed: 502,
    }
    return { status: statuses[error.code] || 400, code: error.code, message: error.message }
  }
  if (error instanceof MailError) {
    return { status: error.status || 400, code: error.code || 'mail_error', message: error.message }
  }
  if (error instanceof PairingError) {
    const statuses = {
      invalid_phone: 400,
      phone_owned: 409,
      already_linked: 409,
      cooldown: 429,
      rate_limit: 429,
      rate_limit_day: 429,
      rate_limit_ip: 429,
      ip_limit: 429,
      user_limit: 403,
      no_slots: 409,
      busy: 409,
      main_not_linked: 409,
      not_found: 404,
      forbidden: 403,
    }
    return { status: statuses[error.code] || 400, code: error.code, message: error.message }
  }
  return { status: 500, code: 'internal', message: 'Error interno del panel.' }
}

function segmentos(pathname) {
  return pathname.split('/').filter(Boolean).map((parte) => {
    try { return decodeURIComponent(parte) } catch { return parte }
  })
}

/** Anti-privado: vive en la base compartida del bot. */
function antipvDe(phone) {
  try {
    return global.db?.data?.antipv?.[String(phone)] === true
  } catch {
    return false
  }
}

async function establecerAntipvPanel(phone, activo) {
  try {
    if (!global.db?.data) return false
    if (!global.db.data.antipv || typeof global.db.data.antipv !== 'object') {
      global.db.data.antipv = {}
    }
    global.db.data.antipv[String(phone)] = activo === true
    await global.db.write?.()
    return true
  } catch (error) {
    console.error('[webpanel] No se pudo guardar el ajuste anti-privado:', error?.message || error)
    return false
  }
}


export const SIN_RUTA = Symbol('sin-ruta')

export {
  MIME,
  HttpError,
  json,
  cabecerasSeguridad,
  leerJson,
  permisosDeUsuario,
  usuarioPublico,
  mapaError,
  segmentos,
  antipvDe,
  establecerAntipvPanel,
}
