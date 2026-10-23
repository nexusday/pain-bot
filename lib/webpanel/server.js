import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
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
} from './auth.js'
import { cargarConfigPanel } from './panel-config.js'
import { construirPreviewMenu } from './menu-preview.js'
import { actualizarDesdeRemoto, estadoRepo } from './updates.js'
import {
  PERMISSIONS,
  PRINCIPAL_ONLY,
  esAdminPermisos,
  normalizarPermisos,
  parsearPermisos,
  permisosLegacy,
  tienePermiso,
} from './permissions.js'
import {
  MailError,
  cargarPlantillas,
  configCorreoPublica,
  correoConfigurado,
  enviarCorreoPrueba,
  enviarPlantilla,
  guardarConfigCorreo,
  guardarPlantillas,
  leerConfigCorreo,
  variablesCorreo,
} from './mailer.js'
import { MAIL_VARIABLES } from './mail-templates.js'
import {
  configPublicaSubBot,
  guardarConfigSubBot,
  guardarImagenSubBot,
  leerConfigSubBot,
  rutaImagenSubBot,
  sanearCambiosConfig,
} from './subbot-config.js'
import {
  desvincularPrincipal,
  estadoPrincipal,
  MainBotError,
  programarReinicioPrincipal,
  relinkPrincipal,
  solicitarCodigoPrincipal,
} from './main-bot.js'
import { PairingError, PairingManager } from './pairing.js'
import {
  carpetaSesionValida,
  contarSesiones,
  eliminarSesion,
  estatusWorkers,
  guardarMaxSubs,
  leerMaxSubs,
  listarSesiones,
  normalizarTelefono,
  reconectarSesion,
} from './session-ops.js'
import { PanelStore } from './store.js'

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
    "connect-src 'self' https://challenges.cloudflare.com; " +
    "frame-src https://challenges.cloudflare.com"
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

async function asegurarPrincipalYCorreo(store, usuario, config, logger = console) {
  if (!usuario) return
  // La cuenta configurada en PAIN_WEB_ADMIN_USER es la autoridad del entorno.
  // La migración puede haber elegido antes al admin más antiguo por defecto.
  const rolPrincipal = await store.obtenerRolPorKey('principal')
  if (Number(usuario.is_principal) !== 1 || Number(usuario.role_id) !== Number(rolPrincipal?.id)) {
    await store.establecerPrincipal(usuario.id)
  }

  const email = String(config.adminEmail || '').trim().toLowerCase()
  if (!email) return
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    logger.warn?.('[webpanel] PAIN_WEB_ADMIN_EMAIL no es un correo válido; se ignora.')
    return
  }
  const ocupado = await store.buscarUsuarioPorEmail(email)
  if (ocupado && Number(ocupado.id) !== Number(usuario.id)) {
    logger.warn?.('[webpanel] PAIN_WEB_ADMIN_EMAIL ya pertenece a otra cuenta; no se aplicó.')
    return
  }
  if (String(usuario.email || '').toLowerCase() !== email || !usuario.email_verified_at) {
    await store.marcarEmailVerificado(usuario.id, email)
  }
}

async function asegurarAdmin(store, config, logger = console) {
  const admins = await store.contarAdmins()
  const passEnv = String(config.adminPass || '')
  let usuario = await store.buscarUsuarioPorNombre(config.adminUser)

  // Las credenciales del entorno se aplican al crear el primer admin, al pedir
  // un reset explícito o cuando el usuario configurado todavía no existe (por
  // ejemplo si se cambia PAIN_WEB_ADMIN_USER). Si ya hay un admin distinto, no
  // se toca para no pisar una contraseña cambiada desde el panel.
  const usuarioNuevo = !usuario && admins > 0 && Boolean(passEnv)
  const aplicar = config.adminReset || admins === 0 || usuarioNuevo

  if (!aplicar) {
    if (usuario) {
      await asegurarPrincipalYCorreo(store, usuario, config, logger)
    }
    if (passEnv && usuario) {
      const coincide = await verifyPassword(passEnv, usuario.password_hash)
      if (!coincide) {
        logger.warn?.(
          `[webpanel] PAIN_WEB_ADMIN_PASS no coincide con la contraseña guardada de "${config.adminUser}". ` +
          'Se mantiene la del panel. Para aplicar la del entorno, arranca una vez con ' +
          'PAIN_WEB_ADMIN_RESET=1 y después vuelve a ponerlo en 0.'
        )
      }
    }
    return null
  }

  const password = passEnv || crypto.randomBytes(12).toString('base64url')
  const passwordHash = await hashPassword(password)
  const rolAdmin = await store.obtenerRolPorKey('admin')

  if (usuario) {
    await store.actualizarUsuario(usuario.id, {
      role: 'admin',
      roleId: rolAdmin?.id,
      status: 'active',
      passwordHash,
    })
  } else {
    usuario = await store.crearUsuario({
      username: config.adminUser,
      passwordHash,
      role: 'admin',
      roleId: rolAdmin?.id,
    })
  }
  usuario = await store.buscarUsuarioPorId(usuario.id)
  await asegurarPrincipalYCorreo(store, usuario, config, logger)

  if (!config.adminPass && (config.adminReset || admins === 0)) {
    const archivo = path.join(config.dataDir, 'webpanel-admin.txt')
    let guardado = false
    try {
      fs.mkdirSync(config.dataDir, { recursive: true })
      fs.writeFileSync(
        archivo,
        `Panel web de ${config.brandName}\nUsuario: ${config.adminUser}\nContraseña: ${password}\n` +
        `Cambia la contraseña al entrar o define PAIN_WEB_ADMIN_PASS.\n`,
        { mode: 0o600 }
      )
      guardado = true
    } catch {}
    logger.warn?.(
      guardado
        ? `[webpanel] Admin ${config.adminUser} creado. Contraseña guardada en ${archivo}`
        : `[webpanel] Admin ${config.adminUser} creado, pero no se pudo guardar la contraseña. ` +
          'Define PAIN_WEB_ADMIN_PASS y PAIN_WEB_ADMIN_RESET=1 para restablecerla.'
    )
  }
  return { usuario, password }
}

function crearServidor({ config, store, pairing, limiter, runtime = {}, logger = console }) {
  const main = runtime.main || { estadoPrincipal, solicitarCodigoPrincipal, desvincularPrincipal, relinkPrincipal, programarReinicioPrincipal }
  const sessions = runtime.sessions || { reconectarSesion, eliminarSesion }
  const getAntiPv = runtime.antipvDe || antipvDe
  const setAntiPv = runtime.establecerAntipvPanel || establecerAntipvPanel
  let sessionCache
  let sessionExpires = 0
  const sesionesDelPanel = () => {
    if (!sessionCache || Date.now() >= sessionExpires) {
      sessionCache = listarSesiones(config.root)
      sessionExpires = Date.now() + 2000
    }
    return sessionCache
  }
  let statsCache
  let statsExpires = 0
  let statsPending
  async function obtenerSesion(req) {
    const cookies = parseCookies(req.headers?.cookie || '')
    const token = cookies[config.cookieName]
    if (!token) return null
    const sesion = await store.obtenerSesionWeb(hashToken(token))
    if (!sesion) return null
    if (Number(sesion.expires_at) < Date.now()) {
      await store.eliminarSesionWeb(sesion.token_hash).catch(() => {})
      return null
    }
    if (sesion.status !== 'active') return null
    return sesion
  }

  async function requerirUsuario(req) {
    const sesion = await obtenerSesion(req)
    if (!sesion) throw new HttpError(401, 'Inicia sesión para continuar.', 'unauthorized')
    return sesion
  }

  function esPrincipal(sesion) {
    return Number(sesion?.is_principal) === 1
  }

  function permisosSesion(sesion) {
    if (!sesion) return []
    if (esPrincipal(sesion)) return ['*']
    if (sesion.role_permissions !== null && sesion.role_permissions !== undefined) {
      return parsearPermisos(sesion.role_permissions)
    }
    return permisosLegacy(sesion.role)
  }

  function puede(sesion, permiso) {
    return tienePermiso(permisosSesion(sesion), permiso)
  }

  function requerirAdmin(sesion) {
    if (!puede(sesion, 'admin.access')) {
      throw new HttpError(403, 'Necesitas permisos de administrador.', 'forbidden')
    }
  }

  function requerirPermiso(sesion, permiso) {
    if (!puede(sesion, permiso)) {
      throw new HttpError(403, 'No tienes permiso para esta acción.', 'forbidden')
    }
  }

  function requerirPrincipal(sesion) {
    if (!esPrincipal(sesion)) {
      throw new HttpError(403, 'Solo el administrador principal puede hacer esto.', 'forbidden')
    }
  }

  function requerirControlPermisos(sesion, permissions) {
    if (esPrincipal(sesion) || puede(sesion, 'admin.settings.roles')) return
    if (permissions.some((key) => !puede(sesion, key))) {
      throw new HttpError(403, 'No puedes administrar ni asignar un rol con permisos que no tienes.', 'forbidden')
    }
  }

  function requerirCsrf(req, sesion) {
    const metodo = String(req.method || 'GET').toUpperCase()
    if (metodo === 'GET' || metodo === 'HEAD' || metodo === 'OPTIONS') return
    const enviado = String(req.headers?.['x-csrf-token'] || '')
    if (!enviado || enviado !== sesion.csrf_token) {
      throw new HttpError(403, 'Token CSRF inválido. Recarga la página.', 'csrf')
    }
  }

  function verificarOrigen(req) {
    if (!origenValido(req, config.publicUrl)) {
      throw new HttpError(403, 'Origen no permitido.', 'origin')
    }
  }

  function limitar(req, clave, limite, ventanaMs) {
    const ip = ipDeRequest(req, config.trustProxy)
    const resultado = limiter.hit(`${clave}:${ip}`, limite, ventanaMs)
    if (!resultado.ok) {
      throw new HttpError(429, `Demasiados intentos. Reintenta en ${Math.ceil(resultado.retryAfterMs / 1000)}s.`, 'rate_limit')
    }
  }

  async function clavesTurnstile() {
    const siteKey = (await store.obtenerMeta('turnstile_site_key')) || ''
    const secretKey = (await store.obtenerMeta('turnstile_secret_key')) || ''
    return { siteKey, secretKey, activo: Boolean(siteKey && secretKey) }
  }

  // ── Correo: códigos de verificación y recuperación ──────────────────────
  const CODIGO_TTL_MS = 15 * 60 * 1000
  const CODIGO_MAX_INTENTOS = 5

  function hashCodigo(codigo) {
    return crypto.createHmac('sha256', config.sessionSecret).update(String(codigo)).digest('hex')
  }

  function compararHash(a, b) {
    try {
      const uno = Buffer.from(String(a), 'hex')
      const dos = Buffer.from(String(b), 'hex')
      return uno.length === dos.length && crypto.timingSafeEqual(uno, dos)
    } catch {
      return false
    }
  }

  async function mailConfigurado() {
    return correoConfigurado(await leerConfigCorreo(store))
  }

  async function requiereCorreoVerificado() {
    return (await store.obtenerMeta('require_email_verification')) === '1'
  }

  async function crearCodigoCorreo(usuario, purpose, { ip } = {}) {
    const codigo = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
    await store.crearTokenCorreo({
      userId: usuario.id,
      email: usuario.email,
      purpose,
      codeHash: hashCodigo(codigo),
      expiresAt: Date.now() + CODIGO_TTL_MS,
      ip,
    })
    return codigo
  }

  async function enviarCodigoCorreo(usuario, purpose, { ip } = {}) {
    if (!usuario?.email) return { sent: false, reason: 'missing_email' }
    if (!(await mailConfigurado())) return { sent: false, reason: 'mail_not_configured' }
    const codigo = await crearCodigoCorreo(usuario, purpose, { ip })
    const plantilla = purpose === 'reset' ? 'reset' : 'verify'
    try {
      await enviarPlantilla(store, plantilla, {
        to: usuario.email,
        variables: variablesCorreo({
          brand: config.brandName,
          username: usuario.username,
          email: usuario.email,
          code: codigo,
          minutes: Math.floor(CODIGO_TTL_MS / 60000),
          panelUrl: config.publicUrl,
          year: new Date().getFullYear(),
        }),
      })
      return { sent: true }
    } catch (error) {
      logger.error?.('[webpanel] No se pudo enviar el correo:', error?.message || error)
      return { sent: false, reason: error?.code || 'mail_send_failed' }
    }
  }

  async function validarCodigoCorreo(usuario, purpose, codigo) {
    const token = await store.obtenerTokenCorreo({ userId: usuario.id, email: usuario.email, purpose })
    if (!token) {
      throw new HttpError(400, 'El código no es válido o ya caducó. Pide uno nuevo.', 'invalid_code')
    }
    if (Number(token.expires_at) < Date.now()) {
      await store.marcarTokenCorreoUsado(token.id)
      throw new HttpError(400, 'El código caducó. Pide uno nuevo.', 'expired_code')
    }
    if (Number(token.attempts) >= CODIGO_MAX_INTENTOS) {
      await store.marcarTokenCorreoUsado(token.id)
      throw new HttpError(429, 'Demasiados intentos con ese código. Pide uno nuevo.', 'too_many_attempts')
    }
    if (!compararHash(token.code_hash, hashCodigo(codigo))) {
      await store.incrementarIntentosTokenCorreo(token.id)
      throw new HttpError(401, 'El código no es correcto.', 'invalid_code')
    }
    // Comparar el código y marcarlo después del hash de contraseña permitía
    // reutilizarlo en dos peticiones simultáneas. Solo una puede consumirlo.
    if (!(await store.consumirTokenCorreo(token.id, CODIGO_MAX_INTENTOS))) {
      throw new HttpError(400, 'El código ya se utilizó o caducó. Pide uno nuevo.', 'invalid_code')
    }
    return token
  }

  async function respuestaCorreo(usuario, resultado) {
    return {
      user: usuario ? usuarioPublico(usuario) : undefined,
      emailSent: resultado?.sent === true,
      emailReason: resultado?.sent === false ? resultado.reason : null,
      mailConfigured: await mailConfigurado(),
    }
  }

  // Verifica el captcha de Cloudflare Turnstile solo si el admin lo configuró.
  async function verificarTurnstile(req, body) {
    const { secretKey, activo } = await clavesTurnstile()
    if (!activo) return
    const token = String(body?.turnstileToken || '').trim()
    if (!token) {
      throw new HttpError(400, 'Completa la verificación de seguridad.', 'captcha_missing')
    }
    const controlador = new AbortController()
    const tope = setTimeout(() => controlador.abort(), 8000)
    tope.unref?.()
    try {
      const respuesta = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          secret: secretKey,
          response: token,
          remoteip: ipDeRequest(req, config.trustProxy) || '',
        }),
        signal: controlador.signal,
      })
      const datos = await respuesta.json().catch(() => ({}))
      if (!datos?.success) {
        throw new HttpError(400, 'La verificación de seguridad falló. Inténtalo de nuevo.', 'captcha_failed')
      }
    } catch (error) {
      if (error instanceof HttpError) throw error
      throw new HttpError(502, 'No se pudo verificar la seguridad. Inténtalo más tarde.', 'captcha_unavailable')
    } finally {
      clearTimeout(tope)
    }
  }

  function cookieDeSesion(token) {
    return serializeCookie(config.cookieName, token, {
      maxAge: config.sessionTtlMs,
      secure: config.cookieSecure,
      httpOnly: true,
      sameSite: 'Lax',
    })
  }

  async function crearSesion(req, usuario, { impersonatedBy = null } = {}) {
    const token = generarToken()
    const csrf = generarCsrf()
    await store.crearSesionWeb({
      tokenHash: hashToken(token),
      userId: usuario.id,
      csrfToken: csrf,
      expiresAt: Date.now() + config.sessionTtlMs,
      ip: ipDeRequest(req, config.trustProxy),
      userAgent: String(req.headers?.['user-agent'] || '').slice(0, 200),
      impersonatedBy,
    })
    return { token, csrf }
  }

  async function servirEstatico(req, res, pathname) {
    let decoded
    try { decoded = decodeURIComponent(pathname) } catch { throw new HttpError(400, 'Ruta inválida.', 'invalid_path') }
    if (decoded.includes('\\') || decoded.includes('\0') || decoded.split('/').some((part) => part.startsWith('.'))) {
      throw new HttpError(404, 'No encontrado.', 'not_found')
    }
    const relativo = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
    const destino = path.resolve(config.publicDir, relativo)
    if (!destino.startsWith(path.resolve(config.publicDir) + path.sep)) {
      throw new HttpError(403, 'Ruta no permitida.')
    }
    let archivo = destino
    let info = null
    try {
      info = await fs.promises.stat(archivo)
      if (info.isDirectory()) {
        archivo = path.join(archivo, 'index.html')
        info = await fs.promises.stat(archivo)
      }
    } catch {
      throw new HttpError(404, 'No encontrado.', 'not_found')
    }
    const real = await fs.promises.realpath(archivo)
    const root = await fs.promises.realpath(config.publicDir)
    if (!real.startsWith(root + path.sep)) throw new HttpError(404, 'No encontrado.', 'not_found')
    const extension = path.extname(archivo).toLowerCase()
    // Los assets se revalidan siempre (ETag/Last-Modified): así, tras un
    // `git pull` el navegador recibe la versión nueva del panel sin tener
    // que hacer una recarga forzada ni esperar a que caduque la caché.
    const etag = info
      ? `W/"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`
      : ''
    const modificado = info ? new Date(info.mtimeMs).toUTCString() : null
    const ifNoneMatch = String(req.headers?.['if-none-match'] || '')
    const ifModifiedSince = String(req.headers?.['if-modified-since'] || '')
    const sinCambios = ifNoneMatch
      ? ifNoneMatch.split(',').some((valor) => valor.trim() === etag)
      : Boolean(ifModifiedSince && modificado && ifModifiedSince === modificado)

    if (sinCambios) {
      res.writeHead(304, {
        ETag: etag,
        ...(modificado ? { 'Last-Modified': modificado } : {}),
        'Cache-Control': 'no-cache',
      })
      return res.end()
    }

    const contenido = await fs.promises.readFile(archivo)
    res.writeHead(200, {
      'Content-Type': MIME[extension] || 'application/octet-stream',
      'Content-Length': contenido.length,
      'Cache-Control': 'no-cache',
      ETag: etag,
      ...(modificado ? { 'Last-Modified': modificado } : {}),
    })
    res.end(contenido)
  }

  async function manejar(req, res) {
    cabecerasSeguridad(res)
    if (config.cookieSecure) res.setHeader('Strict-Transport-Security', 'max-age=15552000')
    const url = new URL(req.url || '/', `http://${req.headers?.host || 'localhost'}`)
    const pathname = url.pathname
    const metodo = String(req.method || 'GET').toUpperCase()
    const seg = segmentos(pathname)
    const ip = ipDeRequest(req, config.trustProxy)

    if (!pathname.startsWith('/api/') && pathname !== '/healthz' && pathname !== '/api') {
      return servirEstatico(req, res, pathname)
    }

    // ── Público ────────────────────────────────────────────────────────────
    if (pathname === '/healthz') {
      return json(res, 200, { ok: true, service: 'pain-webpanel', uptime: process.uptime() })
    }

    if (pathname === '/api/config' && metodo === 'GET') {
      const turnstile = await clavesTurnstile()
      return json(res, 200, {
        brandName: config.brandName,
        publicUrl: config.publicUrl,
        subdomain: config.subdomain,
        domain: config.domain,
        allowRegistration: config.allowRegistration,
        requireInvite: config.requireInvite,
        maxSubs: leerMaxSubs(),
        version: config.version,
        mailConfigured: await mailConfigurado(),
        requireEmailVerification: await requiereCorreoVerificado(),
        // La site key solo se publica cuando el captcha está realmente activo.
        turnstileSiteKey: turnstile.activo ? turnstile.siteKey : '',
        mainLinked: main.estadoPrincipal().linked,
        pairCodeTtlMs: await store.obtenerAjusteNumericoOpcional('pair_code_ttl_ms') ?? config.codeTtlMs,
      })
    }

    // ── Estadísticas públicas en tiempo real (sin auth) ─────────────────────
    if (pathname === '/api/stats' && metodo === 'GET') {
      if (!statsCache || Date.now() >= statsExpires) {
        statsPending ||= (async () => {
          const sesiones = sesionesDelPanel()
          const [bots, users, comunidades] = await Promise.all([
            store.contarBots(), store.contarUsuarios(), store.listarComunidades({ onlyActive: true }),
          ])
          statsCache = {
            users, bots, sessions: sesiones.length,
            sessionsConnected: sesiones.filter((s) => s.connected).length,
            sessionsLinked: sesiones.filter((s) => s.status === 'linked').length,
            sessionsPairing: sesiones.filter((s) => s.status === 'pairing').length,
            communities: comunidades.length, timestamp: Date.now(),
          }
          statsExpires = Date.now() + 5000
        })().finally(() => { statsPending = null })
        await statsPending
      }
      return json(res, 200, statsCache)
    }

    // ── Comunidades de WhatsApp (lectura para cualquier cuenta) ───────────
    if (pathname === '/api/communities' && metodo === 'GET') {
      const sesion = await requerirUsuario(req)
      requerirPermiso(sesion, 'communities.view')
      const comunidades = await store.listarComunidades({ onlyActive: true })
      return json(res, 200, {
        communities: comunidades.map((comunidad) => ({
          id: comunidad.id,
          name: comunidad.name,
          link: comunidad.link,
          description: comunidad.description || null,
          created_at: comunidad.created_at,
        })),
        total: comunidades.length,
        userId: sesion.id,
      })
    }

    // ── Registro / login ──────────────────────────────────────────────────
    if (pathname === '/api/auth/register' && metodo === 'POST') {
      verificarOrigen(req)
      limitar(req, 'register', 5, 60 * 60 * 1000)
      if (!config.allowRegistration) throw new HttpError(403, 'El registro está deshabilitado.', 'register_disabled')
      const body = await leerJson(req)
      await verificarTurnstile(req, body)
      const username = String(body.username || '').trim()
      const email = String(body.email || '').trim()
      const password = String(body.password || '')
      const invite = String(body.invite || '').trim()

      if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
        throw new HttpError(400, 'El usuario debe tener de 3 a 32 caracteres (letras, números, punto, guion).', 'invalid_username')
      }
      if (password.length < 8 || password.length > 200) {
        throw new HttpError(400, 'La contraseña debe tener al menos 8 caracteres.', 'invalid_password')
      }
      if (!email) {
        throw new HttpError(400, 'El correo es obligatorio.', 'missing_email')
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new HttpError(400, 'El correo no es válido.', 'invalid_email')
      }
      if (config.requireInvite) {
        const esperado = config.inviteCode
        if (!esperado || invite !== esperado) {
          throw new HttpError(403, 'Código de invitación inválido.', 'invalid_invite')
        }
      }
      if (await store.buscarUsuarioPorNombre(username)) {
        throw new HttpError(409, 'Ese usuario ya existe.', 'username_taken')
      }
      if (await store.buscarUsuarioPorEmail(email)) {
        throw new HttpError(409, 'Ese correo ya está registrado.', 'email_taken')
      }

      const usuario = await store.crearUsuario({
        username,
        email,
        passwordHash: await hashPassword(password),
        role: 'user',
        ip,
      })
      const { token, csrf } = await crearSesion(req, usuario)
      const correo = await enviarCodigoCorreo(usuario, 'verify', { ip })
      await store.registrarAuditoria({
        userId: usuario.id,
        action: 'auth.register',
        ip,
        meta: { emailSent: correo.sent },
      })
      res.setHeader('Set-Cookie', cookieDeSesion(token))
      return json(res, 201, { user: usuarioPublico(usuario), csrf, ...(await respuestaCorreo(usuario, correo)) })
    }

    if (pathname === '/api/auth/login' && metodo === 'POST') {
      verificarOrigen(req)
      limitar(req, 'login', 12, 15 * 60 * 1000)
      const body = await leerJson(req)
      await verificarTurnstile(req, body)
      const identificador = String(body.username || '').trim()
      const password = String(body.password || '')
      if (!identificador || !password) {
        throw new HttpError(400, 'Usuario y contraseña son obligatorios.', 'missing_credentials')
      }
      limitar(req, `login-usuario:${identificador.toLowerCase()}`, 6, 15 * 60 * 1000)

      const usuario = (await store.buscarUsuarioPorNombre(identificador)) ||
        (await store.buscarUsuarioPorEmail(identificador))
      if (!usuario || !(await verifyPassword(password, usuario.password_hash))) {
        throw new HttpError(401, 'Usuario o contraseña incorrectos.', 'invalid_credentials')
      }
      if (usuario.status !== 'active') {
        throw new HttpError(403, 'Esta cuenta está bloqueada.', 'banned')
      }
      const { token, csrf } = await crearSesion(req, usuario)
      await store.registrarLogin(usuario.id, ip)
      await store.registrarAuditoria({ userId: usuario.id, action: 'auth.login', ip })
      res.setHeader('Set-Cookie', cookieDeSesion(token))
      const actualizado = await store.buscarUsuarioPorId(usuario.id)
      return json(res, 200, { user: usuarioPublico(actualizado || usuario), csrf })
    }

    // Recuperar contraseña: se envía un código de 6 dígitos al correo. La
    // respuesta es siempre genérica para no revelar si la cuenta existe.
    if (pathname === '/api/auth/forgot' && metodo === 'POST') {
      verificarOrigen(req)
      limitar(req, 'forgot', 10, 15 * 60 * 1000)
      const body = await leerJson(req)
      await verificarTurnstile(req, body)
      const email = String(body.email || '').trim()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new HttpError(400, 'Escribe un correo válido.', 'invalid_email')
      }
      limitar(req, `forgot-email:${email.toLowerCase()}`, 3, 15 * 60 * 1000)
      const usuario = await store.buscarUsuarioPorEmail(email)
      if (usuario && usuario.status === 'active') {
        const recientes = await store.contarTokensCorreo({
          userId: usuario.id,
          purpose: 'reset',
          since: Date.now() - 15 * 60 * 1000,
        })
        if (recientes < 3) await enviarCodigoCorreo(usuario, 'reset', { ip })
      }
      return json(res, 200, {
        ok: true,
        mailConfigured: await mailConfigurado(),
        message: 'Si el correo está registrado, recibirás un código de 6 dígitos.',
      })
    }

    if (pathname === '/api/auth/reset' && metodo === 'POST') {
      verificarOrigen(req)
      limitar(req, 'reset-password', 12, 15 * 60 * 1000)
      const body = await leerJson(req)
      const email = String(body.email || '').trim()
      const codigo = String(body.code || '').replace(/\D/g, '')
      const password = String(body.password || '')
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new HttpError(400, 'Escribe un correo válido.', 'invalid_email')
      }
      if (!/^\d{6}$/.test(codigo)) {
        throw new HttpError(400, 'El código debe tener 6 dígitos.', 'invalid_code')
      }
      if (password.length < 8 || password.length > 200) {
        throw new HttpError(400, 'La nueva contraseña debe tener al menos 8 caracteres.', 'invalid_password')
      }
      const usuario = await store.buscarUsuarioPorEmail(email)
      if (!usuario || usuario.status !== 'active') {
        throw new HttpError(400, 'El código no es válido o caducó. Pide uno nuevo.', 'invalid_code')
      }
      const token = await validarCodigoCorreo(usuario, 'reset', codigo)
      await store.actualizarUsuario(usuario.id, { passwordHash: await hashPassword(password) })
      await store.verificarEmailActual(usuario.id, token.email)
      await store.eliminarSesionesUsuario(usuario.id)
      await store.registrarAuditoria({ userId: usuario.id, action: 'auth.password_reset', ip })
      return json(res, 200, { ok: true, message: 'Contraseña restablecida. Ya puedes iniciar sesión.' })
    }

    if (pathname === '/api/auth/logout' && metodo === 'POST') {
      const sesion = await obtenerSesion(req)
      if (sesion) {
        requerirCsrf(req, sesion)
        await store.eliminarSesionWeb(sesion.token_hash)
        await store.registrarAuditoria({ userId: sesion.id, action: 'auth.logout', ip })
      }
      res.setHeader('Set-Cookie', serializeCookie(config.cookieName, '', { maxAge: 0, secure: config.cookieSecure }))
      return json(res, 200, { ok: true })
    }

    if (pathname === '/api/auth/me' && metodo === 'GET') {
      const sesion = await obtenerSesion(req)
      if (!sesion) return json(res, 401, { error: 'No autenticado', code: 'unauthorized' })
      const bots = await store.listarBotsUsuario(sesion.id)
      return json(res, 200, {
        user: usuarioPublico(sesion),
        csrf: sesion.csrf_token,
        bots: bots.length,
        impersonatedBy: sesion.impersonated_by
          ? { id: sesion.impersonated_by, username: sesion.impersonated_by_username || 'admin' }
          : null,
        config: {
          brandName: config.brandName,
          publicUrl: config.publicUrl,
          subdomain: config.subdomain,
          domain: config.domain,
          allowRegistration: config.allowRegistration,
          requireInvite: config.requireInvite,
          maxSubs: leerMaxSubs(),
          version: config.version,
          mailConfigured: await mailConfigurado(),
          requireEmailVerification: await requiereCorreoVerificado(),
        },
      })
    }

    // Salir del modo "acting as" y volver a la cuenta de administrador.
    if (pathname === '/api/auth/stop-impersonating' && metodo === 'POST') {
      const sesion = await requerirUsuario(req)
      requerirCsrf(req, sesion)
      verificarOrigen(req)
      if (!sesion.impersonated_by) {
        throw new HttpError(400, 'No estás acting como ninguna cuenta.', 'not_impersonating')
      }
      const original = await store.buscarUsuarioPorId(sesion.impersonated_by)
      if (!original || !esAdminPermisos(permisosDeUsuario(original)) || original.status !== 'active') {
        throw new HttpError(403, 'La cuenta original ya no es administradora.', 'forbidden')
      }
      const { token, csrf } = await crearSesion(req, original)
      await store.registrarAuditoria({
        userId: original.id,
        action: 'admin.stop_impersonating',
        ip,
        meta: { as: sesion.username },
      })
      res.setHeader('Set-Cookie', cookieDeSesion(token))
      return json(res, 200, { ok: true, user: usuarioPublico(original), csrf })
    }

    if (pathname === '/api/auth/password' && metodo === 'POST') {
      const sesion = await requerirUsuario(req)
      requerirCsrf(req, sesion)
      verificarOrigen(req)
      limitar(req, `password:${sesion.id}`, 5, 60 * 60 * 1000)
      const body = await leerJson(req)
      const actual = String(body.current || '')
      const nueva = String(body.password || '')
      if (nueva.length < 8 || nueva.length > 200) {
        throw new HttpError(400, 'La nueva contraseña debe tener al menos 8 caracteres.', 'invalid_password')
      }
      const usuario = await store.buscarUsuarioPorId(sesion.id)
      if (!usuario || !(await verifyPassword(actual, usuario.password_hash))) {
        throw new HttpError(401, 'La contraseña actual no es correcta.', 'invalid_current_password')
      }
      await store.actualizarUsuario(sesion.id, { passwordHash: await hashPassword(nueva) })
      await store.eliminarSesionesUsuario(sesion.id)
      const { token, csrf } = await crearSesion(req, usuario)
      await store.registrarAuditoria({ userId: sesion.id, action: 'auth.password', ip })
      res.setHeader('Set-Cookie', cookieDeSesion(token))
      return json(res, 200, { ok: true, csrf })
    }

    // Correo de la propia cuenta: obligatorio para cuentas nuevas, pero las
    // antiguas pueden añadirlo aquí para dejar de ver el aviso del panel.
    if (pathname === '/api/account/email' && metodo === 'PATCH') {
      const sesion = await requerirUsuario(req)
      requerirCsrf(req, sesion)
      verificarOrigen(req)
      limitar(req, `email:${sesion.id}`, 10, 60 * 60 * 1000)
      const body = await leerJson(req)
      const email = String(body.email || '').trim()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new HttpError(400, 'El correo no es válido.', 'invalid_email')
      }
      const existente = await store.buscarUsuarioPorEmail(email)
      if (existente && Number(existente.id) !== Number(sesion.id)) {
        throw new HttpError(409, 'Ese correo ya está registrado.', 'email_taken')
      }
      await store.actualizarEmailUsuario(sesion.id, email)
      const actualizado = await store.buscarUsuarioPorId(sesion.id)
      const correo = await enviarCodigoCorreo(actualizado || { ...sesion, email }, 'verify', { ip })
      await store.registrarAuditoria({
        userId: sesion.id,
        action: 'account.email',
        ip,
        meta: { emailSent: correo.sent },
      })
      return json(res, 200, { ok: true, ...(await respuestaCorreo(actualizado || sesion, correo)) })
    }

    // Verificar el correo con el código de 6 dígitos.
    if (pathname === '/api/account/email/verify' && metodo === 'POST') {
      const sesion = await requerirUsuario(req)
      requerirCsrf(req, sesion)
      verificarOrigen(req)
      limitar(req, `email-verify:${sesion.id}`, 12, 15 * 60 * 1000)
      const body = await leerJson(req)
      const codigo = String(body.code || '').replace(/\D/g, '')
      if (!/^\d{6}$/.test(codigo)) {
        throw new HttpError(400, 'El código debe tener 6 dígitos.', 'invalid_code')
      }
      if (!sesion.email) throw new HttpError(400, 'Añade un correo antes de verificarlo.', 'missing_email')
      if (sesion.email_verified_at) {
        return json(res, 200, { ok: true, alreadyVerified: true, user: usuarioPublico(sesion) })
      }
      const token = await validarCodigoCorreo(sesion, 'verify', codigo)
      if (!(await store.verificarEmailActual(sesion.id, token.email))) {
        throw new HttpError(409, 'El correo de la cuenta cambió. Pide un código nuevo.', 'email_changed')
      }
      await store.registrarAuditoria({ userId: sesion.id, action: 'account.email_verified', ip })
      return json(res, 200, { ok: true, user: usuarioPublico(await store.buscarUsuarioPorId(sesion.id)) })
    }

    // Reenviar el código de verificación (con límite para no hacer spam).
    if (pathname === '/api/account/email/verify/send' && metodo === 'POST') {
      const sesion = await requerirUsuario(req)
      requerirCsrf(req, sesion)
      verificarOrigen(req)
      limitar(req, `email-verify-send:${sesion.id}`, 4, 15 * 60 * 1000)
      if (!sesion.email) throw new HttpError(400, 'Añade un correo antes de verificarlo.', 'missing_email')
      if (sesion.email_verified_at) {
        return json(res, 200, { ok: true, alreadyVerified: true, user: usuarioPublico(sesion) })
      }
      const usuario = await store.buscarUsuarioPorId(sesion.id)
      const correo = await enviarCodigoCorreo(usuario, 'verify', { ip })
      await store.registrarAuditoria({
        userId: sesion.id,
        action: 'account.email_verify_send',
        ip,
        meta: { emailSent: correo.sent },
      })
      return json(res, 200, { ok: true, ...(await respuestaCorreo(usuario, correo)) })
    }

    // ── Bots del usuario ──────────────────────────────────────────────────
    if (pathname === '/api/bots' && metodo === 'GET') {
      const sesion = await requerirUsuario(req)
      requerirPermiso(sesion, 'bots.view')
      const filas = await store.listarBotsUsuario(sesion.id)
      const sesiones = sesionesDelPanel()
      const mapa = new Map(sesiones.map((s) => [s.folder, s]))
      const bots = filas.map((fila) => {
        const viva = mapa.get(fila.folder)
        return {
          phone: fila.phone,
          label: fila.label,
          status: viva?.status || 'missing',
          connected: Boolean(viva?.connected),
          worker: viva?.worker || null,
          needsRelink: Boolean(viva?.needsRelink),
          pairing: Boolean(viva?.pairing),
          archived: Boolean(viva?.archived),
          linked_at: fila.linked_at,
          last_seen_at: fila.last_seen_at,
        }
      })
      const maxPorUsuario = await store.obtenerAjusteNumerico('max_subs_per_user', 0)
      return json(res, 200, {
        bots,
        limit: {
          max: maxPorUsuario,
          used: bots.length,
          unlimited: maxPorUsuario <= 0,
        },
      })
    }

    // ── Configuración del sub-bot (nombre, imagen, menú…) ─────────────────
    if (seg[0] === 'api' && seg[1] === 'bots' && seg[2] && /^\d+$/.test(seg[2])) {
      const sesion = await requerirUsuario(req)
      if (!['GET', 'HEAD', 'OPTIONS'].includes(metodo)) {
        requerirCsrf(req, sesion)
        verificarOrigen(req)
      }
      const phone = normalizarTelefono(seg[2]) || seg[2]
      if (!carpetaSesionValida(phone)) throw new HttpError(400, 'Sesión inválida.', 'invalid_session')
      const fila = await store.obtenerBotPorPhone(phone)
      if (!fila) throw new HttpError(404, 'Ese bot no existe.', 'not_found')
      const esPropietario = Number(fila.user_id) === Number(sesion.id)
      requerirPermiso(sesion, esPropietario
        ? (metodo === 'GET' ? 'bots.view' : 'bots.config')
        : (metodo === 'GET' ? 'admin.sessions' : 'admin.sessions.config'))

      // Imagen configurada del sub-bot (la del menú).
      if (seg.length === 4 && seg[3] === 'image' && metodo === 'GET') {
        const imagen = rutaImagenSubBot(config.root, phone)
        if (!imagen) {
          return json(res, 404, { error: 'Este bot todavía no tiene imagen.', code: 'no_image' })
        }
        let contenido
        try {
          contenido = await fs.promises.readFile(imagen)
        } catch {
          throw new HttpError(404, 'No se pudo leer la imagen.', 'not_found')
        }
        const extension = path.extname(imagen).toLowerCase()
        res.writeHead(200, {
          'Content-Type': MIME[extension] || 'image/jpeg',
          'Content-Length': contenido.length,
          'Cache-Control': 'no-cache',
        })
        return res.end(contenido)
      }

      if (seg.length === 4 && seg[3] === 'config' && metodo === 'GET') {
        const configuracion = leerConfigSubBot(config.root, phone)
        const preview = construirPreviewMenu({ phone, config: configuracion, esPropietario })
        return json(res, 200, {
          phone,
          config: {
            ...configPublicaSubBot(configuracion),
            antiPv: await getAntiPv(phone),
          },
          preview,
          image: configuracion.img ? `/api/bots/${encodeURIComponent(phone)}/image` : null,
        })
      }

      if (seg.length === 4 && seg[3] === 'config' && metodo === 'PATCH') {
        const body = await leerJson(req)
        const { cambios, errores } = sanearCambiosConfig(body)
        if (errores.length) throw new HttpError(400, errores[0], 'invalid_config')
        if (body.antiPv !== undefined) {
          await setAntiPv(phone, body.antiPv === true)
        }
        const guardado = guardarConfigSubBot(config.root, phone, cambios)
        const preview = construirPreviewMenu({ phone, config: guardado, esPropietario })
        return json(res, 200, {
          ok: true,
          config: { ...configPublicaSubBot(guardado), antiPv: await getAntiPv(phone) },
          preview,
          image: guardado.img ? `/api/bots/${encodeURIComponent(phone)}/image` : null,
        })
      }

      if (seg.length === 5 && seg[3] === 'config' && seg[4] === 'image' && metodo === 'POST') {
        const body = await leerJson(req, 6 * 1024 * 1024)
        let resultado
        try {
          resultado = guardarImagenSubBot(config.root, phone, body.dataUrl)
        } catch (error) {
          throw new HttpError(400, error?.message || 'No se pudo guardar la imagen.', error?.code || 'invalid_image')
        }
        guardarConfigSubBot(config.root, phone, { img: resultado.ruta })
        const configuracion = leerConfigSubBot(config.root, phone)
        return json(res, 200, {
          ok: true,
          bytes: resultado.bytes,
          image: `/api/bots/${encodeURIComponent(phone)}/image`,
          config: { ...configPublicaSubBot(configuracion), antiPv: await getAntiPv(phone) },
        })
      }
    }

    if (pathname === '/api/bots/link' && metodo === 'POST') {
      const sesion = await requerirUsuario(req)
      requerirPermiso(sesion, 'bots.link')
      requerirCsrf(req, sesion)
      verificarOrigen(req)
      if ((await requiereCorreoVerificado()) && !sesion.email_verified_at && !esPrincipal(sesion)) {
        throw new HttpError(
          403,
          'Verifica tu correo antes de vincular un sub-bot. Puedes hacerlo desde Mi cuenta.',
          'email_unverified'
        )
      }
      limitar(req, `link:${sesion.id}`, 10, 60 * 60 * 1000)
      const body = await leerJson(req)
      const resultado = await pairing.iniciar({
        userId: sesion.id,
        phone: body.phone,
        ip,
        userAgent: String(req.headers?.['user-agent'] || '').slice(0, 200),
        force: body.force === true,
      })
      return json(res, 200, resultado)
    }

    if (seg[0] === 'api' && seg[1] === 'bots' && seg[2] === 'link' && seg[3] && metodo === 'GET' && seg.length === 4) {
      const sesion = await requerirUsuario(req)
      requerirPermiso(sesion, 'bots.view')
      const pairingEstado = await pairing.estado(seg[3], sesion.id, { admin: puede(sesion, 'admin.pairings') })
      return json(res, 200, { pairing: pairingEstado })
    }

    if (seg[0] === 'api' && seg[1] === 'bots' && seg[2] === 'link' && seg[3] && seg[4] === 'cancel' && metodo === 'POST') {
      const sesion = await requerirUsuario(req)
      requerirCsrf(req, sesion)
      verificarOrigen(req)
      requerirPermiso(sesion, 'bots.link')
      const pairingEstado = await pairing.cancelar(seg[3], sesion.id, { admin: puede(sesion, 'admin.pairings') })
      return json(res, 200, { pairing: pairingEstado })
    }

    if (seg[0] === 'api' && seg[1] === 'bots' && seg[2] === 'link' && seg[3] && seg[4] === 'regenerate' && metodo === 'POST') {
      const sesion = await requerirUsuario(req)
      requerirPermiso(sesion, 'bots.link')
      if ((await requiereCorreoVerificado()) && !sesion.email_verified_at && !esPrincipal(sesion)) {
        throw new HttpError(403, 'Verifica tu correo antes de vincular un sub-bot.', 'email_unverified')
      }
      requerirCsrf(req, sesion)
      verificarOrigen(req)
      const resultado = await pairing.regenerar(seg[3], sesion.id, {
        ip,
        userAgent: String(req.headers?.['user-agent'] || '').slice(0, 200),
      })
      return json(res, 200, resultado)
    }

    if (seg[0] === 'api' && seg[1] === 'bots' && seg[2] && seg.length === 3 && metodo === 'DELETE') {
      const sesion = await requerirUsuario(req)
      requerirCsrf(req, sesion)
      verificarOrigen(req)
      const phone = normalizarTelefono(seg[2]) || seg[2]
      if (!carpetaSesionValida(phone)) throw new HttpError(400, 'Sesión inválida.', 'invalid_session')
      const fila = await store.obtenerBotPorPhone(phone)
      if (!fila) throw new HttpError(404, 'Ese bot no existe.', 'not_found')
      requerirPermiso(sesion, Number(fila.user_id) === Number(sesion.id) ? 'bots.delete' : 'admin.sessions.delete')
      await sessions.eliminarSesion(config.root, phone)
      await store.eliminarBot(phone)
      await store.registrarAuditoria({ userId: sesion.id, action: 'bot.deleted', ip, meta: { phone } })
      return json(res, 200, { ok: true })
    }

    if (seg[0] === 'api' && seg[1] === 'bots' && seg[2] && seg[3] === 'reconnect' && metodo === 'POST') {
      const sesion = await requerirUsuario(req)
      requerirCsrf(req, sesion)
      verificarOrigen(req)
      const phone = normalizarTelefono(seg[2]) || seg[2]
      if (!carpetaSesionValida(phone)) throw new HttpError(400, 'Sesión inválida.', 'invalid_session')
      const fila = await store.obtenerBotPorPhone(phone)
      if (!fila) throw new HttpError(404, 'Ese bot no existe.', 'not_found')
      requerirPermiso(sesion, Number(fila.user_id) === Number(sesion.id) ? 'bots.reconnect' : 'admin.sessions.reconnect')
      const resultado = await sessions.reconectarSesion(config.root, phone)
      await store.registrarAuditoria({
        userId: sesion.id,
        action: 'bot.reconnect',
        ip,
        meta: { phone, ok: resultado.ok, reason: resultado.reason },
      })
      return json(res, 200, resultado)
    }

    if (seg[0] === 'api' && seg[1] === 'bots' && seg[2] && metodo === 'PATCH') {
      const sesion = await requerirUsuario(req)
      requerirCsrf(req, sesion)
      verificarOrigen(req)
      const phone = normalizarTelefono(seg[2]) || seg[2]
      if (!carpetaSesionValida(phone)) throw new HttpError(400, 'Sesión inválida.', 'invalid_session')
      const fila = await store.obtenerBotPorPhone(phone)
      if (!fila) throw new HttpError(404, 'Ese bot no existe.', 'not_found')
      requerirPermiso(sesion, Number(fila.user_id) === Number(sesion.id) ? 'bots.config' : 'admin.sessions.config')
      const body = await leerJson(req)
      const label = String(body.label ?? '').trim().slice(0, 60) || null
      await store.actualizarBot(phone, { label })
      return json(res, 200, { ok: true })
    }

    // ── Bot principal (solo administradores) ─────────────────────────────
    if (seg[0] === 'api' && seg[1] === 'main') {
      const sesion = await requerirUsuario(req)
      requerirPermiso(sesion, 'admin.main')
      if (!['GET', 'HEAD', 'OPTIONS'].includes(metodo)) {
        requerirCsrf(req, sesion)
        verificarOrigen(req)
      }

      if (seg.length === 2 && metodo === 'GET') {
        return json(res, 200, { main: main.estadoPrincipal() })
      }

      if (seg[2] === 'code' && metodo === 'POST') {
        limitar(req, `main-code:${sesion.id}`, 6, 15 * 60 * 1000)
        const body = await leerJson(req)
        const resultado = await main.solicitarCodigoPrincipal(body.phone)
        await store.registrarAuditoria({
          userId: sesion.id,
          action: 'main.code',
          ip,
          meta: { phone: resultado.phone },
        })
        return json(res, 200, resultado)
      }

      if (seg[2] === 'unlink' && metodo === 'POST') {
        const resultado = await main.desvincularPrincipal()
        await store.registrarAuditoria({
          userId: sesion.id,
          action: 'main.unlink',
          ip,
          meta: { phone: resultado.phone || null },
        })
        return json(res, 200, resultado)
      }

      if (seg[2] === 'relink' && metodo === 'POST') {
        limitar(req, `main-code:${sesion.id}`, 6, 15 * 60 * 1000)
        const body = await leerJson(req)
        const resultado = await main.relinkPrincipal(body.phone)
        await store.registrarAuditoria({
          userId: sesion.id,
          action: 'main.relink',
          ip,
          meta: { phone: resultado.phone || null },
        })
        return json(res, 200, resultado)
      }

      if (seg[2] === 'restart' && metodo === 'POST') {
        await store.registrarAuditoria({ userId: sesion.id, action: 'main.restart', ip })
        await main.programarReinicioPrincipal(1500)
        return json(res, 200, { ok: true, restartInMs: 1500 })
      }
    }

    // ── Administración ────────────────────────────────────────────────────
    if (seg[0] === 'api' && seg[1] === 'admin') {
      const sesion = await requerirUsuario(req)
      requerirAdmin(sesion)
      if (!['GET', 'HEAD', 'OPTIONS'].includes(metodo)) {
        requerirCsrf(req, sesion)
        verificarOrigen(req)
      }

      if (seg[2] === 'overview' && metodo === 'GET') {
        requerirPermiso(sesion, 'admin.overview')
        const sesiones = listarSesiones(config.root)
        const conteo = contarSesiones(config.root)
        const bots = await store.contarBots()
        const usuarios = await store.contarUsuarios()
        const admins = await store.contarAdmins()
        const { workers } = estatusWorkers(config.root)
        const memoria = process.memoryUsage()
        return json(res, 200, {
          counts: { users: usuarios, admins, bots, sessions: conteo.total },
          sessions: conteo,
          workers: workers.map((worker) => ({
            id: worker.workerId,
            pid: worker.pid,
            connected: (worker.sessions || []).filter((s) => s.connected).length,
            total: (worker.sessions || []).length,
            updatedAt: worker.updatedAt,
          })),
          system: {
            uptime: process.uptime(),
            rssMB: +(memoria.rss / 1048576).toFixed(1),
            heapMB: +(memoria.heapUsed / 1048576).toFixed(1),
            node: process.version,
            platform: process.platform,
          },
          maxSubs: leerMaxSubs(),
          recentAudit: await store.listarAuditoria({ limit: 8 }),
          recentPairings: await store.pairingsRecientes(8),
          sessionsList: sesiones.slice(0, 50),
        })
      }

      if (seg[2] === 'users' && metodo === 'GET') {
        requerirPermiso(sesion, 'admin.users')
        const q = url.searchParams.get('q') || ''
        const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 200)
        const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0)
        const usuarios = await store.listarUsuarios({ query: q, limit, offset })
        return json(res, 200, {
          users: usuarios.map(usuarioPublico),
          total: await store.contarUsuarios(),
        })
      }

      if (seg[2] === 'impersonate' && seg[3] && metodo === 'POST') {
        requerirPermiso(sesion, 'admin.users.impersonate')
        const id = Number(seg[3])
        const objetivo = await store.buscarUsuarioPorId(id)
        if (!objetivo) throw new HttpError(404, 'Usuario no encontrado.', 'not_found')
        if (Number(objetivo.is_principal) === 1 || esAdminPermisos(permisosDeUsuario(objetivo))) {
          requerirPrincipal(sesion)
        }
        if (objetivo.status !== 'active') {
          throw new HttpError(403, 'Esa cuenta está bloqueada.', 'forbidden')
        }
        if (Number(objetivo.id) === Number(sesion.id)) {
          throw new HttpError(400, 'Ya estás dentro de esa cuenta.', 'same_user')
        }
        const { token, csrf } = await crearSesion(req, objetivo, { impersonatedBy: sesion.id })
        await store.registrarAuditoria({
          userId: sesion.id,
          action: 'admin.impersonate',
          ip,
          meta: { target: objetivo.username, targetId: objetivo.id },
        })
        res.setHeader('Set-Cookie', cookieDeSesion(token))
        return json(res, 200, {
          ok: true,
          user: usuarioPublico(objetivo),
          csrf,
          impersonatedBy: { id: sesion.id, username: sesion.username },
        })
      }

      if (seg[2] === 'users' && seg[3] && metodo === 'PATCH') {
        requerirPermiso(sesion, 'admin.users.edit')
        const id = Number(seg[3])
        const objetivo = await store.buscarUsuarioPorId(id)
        if (!objetivo) throw new HttpError(404, 'Usuario no encontrado.', 'not_found')
        const body = await leerJson(req)
        const cambios = {}
        const objetivoPrincipal = Number(objetivo.is_principal) === 1
        if (objetivoPrincipal) requerirPrincipal(sesion)
        requerirControlPermisos(sesion, permisosDeUsuario(objetivo))

        if (body.roleId !== undefined || body.role !== undefined) {
          requerirPermiso(sesion, 'admin.users.roles')
          if (objetivoPrincipal) {
            throw new HttpError(409, 'El administrador principal no puede cambiar de rol.', 'principal_role')
          }
          let rol = null
          if (body.roleId !== undefined) {
            rol = await store.obtenerRol(body.roleId)
            if (!rol) throw new HttpError(400, 'Rol inválido.', 'invalid_role')
          } else {
            if (!['user', 'admin'].includes(body.role)) throw new HttpError(400, 'Rol inválido.', 'invalid_role')
            rol = await store.obtenerRolPorKey(body.role)
          }
          if (!rol) throw new HttpError(400, 'Rol inválido.', 'invalid_role')
          requerirControlPermisos(sesion, rol.permissions)
          if (rol.key === 'principal' && !objetivoPrincipal) {
            throw new HttpError(
              409,
              'El rol principal es único y no se puede asignar desde el editor de usuarios.',
              'principal_role'
            )
          }
          if (objetivo.role === 'admin' && rol.scope !== 'admin' && (await store.contarAdmins()) <= 1) {
            throw new HttpError(409, 'No puedes quitar al último administrador.', 'last_admin')
          }
          cambios.roleId = rol.id
        }
        if (body.status !== undefined) {
          if (!['active', 'banned'].includes(body.status)) throw new HttpError(400, 'Estado inválido.', 'invalid_status')
          if (objetivoPrincipal && body.status === 'banned') {
            throw new HttpError(409, 'No puedes bloquear al administrador principal.', 'principal_banned')
          }
          if (objetivo.role === 'admin' && body.status === 'banned' && (await store.contarAdmins()) <= 1) {
            throw new HttpError(409, 'No puedes bloquear al último administrador.', 'last_admin')
          }
          cambios.status = body.status
        }
        if (body.password !== undefined) {
          if (objetivoPrincipal && !esPrincipal(sesion) && Number(objetivo.id) !== Number(sesion.id)) {
            throw new HttpError(403, 'Solo el administrador principal puede cambiar su contraseña.', 'forbidden')
          }
          if (String(body.password).length < 8 || String(body.password).length > 200) throw new HttpError(400, 'La contraseña debe tener entre 8 y 200 caracteres.', 'invalid_password')
          cambios.passwordHash = await hashPassword(String(body.password))
        }
        if (!Object.keys(cambios).length) {
          throw new HttpError(400, 'No hay cambios para guardar.', 'empty_update')
        }
        await store.actualizarUsuario(id, cambios)
        if (cambios.status === 'banned') await store.eliminarSesionesUsuario(id)
        await store.registrarAuditoria({
          userId: sesion.id,
          action: 'admin.user_update',
          ip,
          meta: { target: id, campos: Object.keys(cambios) },
        })
        return json(res, 200, { ok: true, user: usuarioPublico(await store.buscarUsuarioPorId(id)) })
      }

      if (seg[2] === 'users' && seg[3] && metodo === 'DELETE') {
        requerirPermiso(sesion, 'admin.users.delete')
        const id = Number(seg[3])
        const objetivo = await store.buscarUsuarioPorId(id)
        if (!objetivo) throw new HttpError(404, 'Usuario no encontrado.', 'not_found')
        if (Number(objetivo.is_principal) === 1) {
          throw new HttpError(409, 'No puedes eliminar al administrador principal.', 'principal_delete')
        }
        requerirControlPermisos(sesion, permisosDeUsuario(objetivo))
        if (objetivo.role === 'admin' && (await store.contarAdmins()) <= 1) {
          throw new HttpError(409, 'No puedes borrar al último administrador.', 'last_admin')
        }
        await store.eliminarUsuario(id)
        await store.registrarAuditoria({ userId: sesion.id, action: 'admin.user_delete', ip, meta: { target: id, username: objetivo.username } })
        return json(res, 200, { ok: true })
      }

      if (seg[2] === 'sessions' && metodo === 'GET') {
        requerirPermiso(sesion, 'admin.sessions')
        const filas = await store.listarBots()
        const propietarios = new Map(filas.map((fila) => [fila.phone, fila]))
        const sesiones = listarSesiones(config.root).map((sesion) => ({
          ...sesion,
          owner: propietarios.get(sesion.folder)?.username || null,
          ownerId: propietarios.get(sesion.folder)?.user_id || null,
          label: propietarios.get(sesion.folder)?.label || null,
        }))
        return json(res, 200, { sessions: sesiones })
      }

      if (seg[2] === 'sessions' && seg[3] === 'bulk' && metodo === 'POST') {
        requerirPermiso(sesion, 'admin.sessions.delete')
        const body = await leerJson(req)
        const pedidos = Array.isArray(body.phones) ? body.phones.slice(0, 500) : []
        const oleada = Math.min(Math.max(Number.parseInt(body.batchSize, 10) || 5, 1), 50)
        const eliminados = []
        const fallidos = []
        for (let i = 0; i < pedidos.length; i += oleada) {
          const lote = pedidos.slice(i, i + oleada)
          for (const bruto of lote) {
            const phone = normalizarTelefono(bruto) || String(bruto || '')
            if (!carpetaSesionValida(phone)) {
              fallidos.push({ phone: String(bruto || ''), reason: 'invalid' })
              continue
            }
            try {
              await sessions.eliminarSesion(config.root, phone)
              await store.eliminarBot(phone)
              eliminados.push(phone)
            } catch (error) {
              fallidos.push({ phone, reason: error?.message || 'error' })
            }
          }
          if (i + oleada < pedidos.length) await new Promise((resolve) => setTimeout(resolve, 120))
        }
        await store.registrarAuditoria({
          userId: sesion.id,
          action: 'admin.sessions_bulk_delete',
          ip,
          meta: { solicitadas: pedidos.length, eliminadas: eliminados.length, oleada },
        })
        return json(res, 200, {
          ok: true,
          eliminados: eliminados.length,
          fallidos: fallidos.length,
          errores: fallidos.slice(0, 20),
        })
      }

      if (seg[2] === 'sessions' && seg[3] && seg[4] === 'reconnect' && metodo === 'POST') {
        requerirPermiso(sesion, 'admin.sessions.reconnect')
        const phone = normalizarTelefono(seg[3]) || seg[3]
        if (!carpetaSesionValida(phone)) throw new HttpError(400, 'Sesión inválida.', 'invalid_session')
        const resultado = await sessions.reconectarSesion(config.root, phone)
        await store.registrarAuditoria({ userId: sesion.id, action: 'admin.session_reconnect', ip, meta: { phone, ...resultado } })
        return json(res, 200, resultado)
      }

      if (seg[2] === 'sessions' && seg[3] && metodo === 'DELETE') {
        requerirPermiso(sesion, 'admin.sessions.delete')
        const phone = normalizarTelefono(seg[3]) || seg[3]
        if (!carpetaSesionValida(phone)) throw new HttpError(400, 'Sesión inválida.', 'invalid_session')
        await sessions.eliminarSesion(config.root, phone)
        await store.eliminarBot(phone)
        await store.registrarAuditoria({ userId: sesion.id, action: 'admin.session_delete', ip, meta: { phone } })
        return json(res, 200, { ok: true })
      }

      if (seg[2] === 'pairings' && metodo === 'GET') {
        requerirPermiso(sesion, 'admin.pairings')
        return json(res, 200, { pairings: await store.pairingsRecientes(100) })
      }

      if (seg[2] === 'audit' && metodo === 'GET') {
        requerirPermiso(sesion, 'admin.audit')
        const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 100, 1), 500)
        const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0)
        return json(res, 200, { audit: await store.listarAuditoria({ limit, offset }) })
      }

      if (seg[2] === 'update' && metodo === 'POST') {
        requerirPermiso(sesion, 'admin.update')
        if (typeof global.recargarEnCaliente !== 'function') {
          throw new HttpError(
            501,
            'El proceso del bot tiene el código viejo. Reinicia el proceso una vez desde tu panel de alojamiento y, desde ahí, "Aplicar cambios" ya funcionará sin reiniciar.',
            'unsupported'
          )
        }
        const resultado = actualizarDesdeRemoto(process.cwd())
        const plugins = (resultado.archivos || [])
          .filter((archivo) => archivo.startsWith('plugins/'))
          .map((archivo) => archivo.split('/').pop())
        const resumen = await global.recargarEnCaliente({ plugins })
        // Los sub-bots viven en otros procesos: se les pide recargarse también.
        const workers = (await global.pedirRecargaWorkers?.(plugins)) || { dispatched: 0, workers: 0 }
        // El panel se recarga con el código nuevo después de responder.
        setTimeout(() => { global.reiniciarPanelWeb?.() }, 250)
        return json(res, 200, {
          ok: true,
          commits: resultado.commits,
          archivos: resultado.archivos,
          resumen,
          workers,
          cambiosLocalesConservados: resultado.cambiosLocalesConservados,
          habiaCambiosLocales: resultado.habiaCambiosLocales,
          rama: resultado.despues?.rama || resultado.antes?.rama,
          commit: resultado.despues?.corto || resultado.antes?.corto,
          reinicioPendiente: (resultado.archivos || []).some((archivo) => archivo === 'main.js'),
        })
      }

      if (seg[2] === 'reload' && metodo === 'POST') {
        requerirPermiso(sesion, 'admin.update')
        if (typeof global.recargarEnCaliente !== 'function') {
          throw new HttpError(
            501,
            'El proceso del bot tiene el código viejo. Reinicia el proceso una vez desde tu panel de alojamiento para poder recargar en caliente.',
            'unsupported'
          )
        }
        const resumen = await global.recargarEnCaliente({})
        const workers = (await global.pedirRecargaWorkers?.([])) || { dispatched: 0, workers: 0 }
        setTimeout(() => { global.reiniciarPanelWeb?.() }, 250)
        return json(res, 200, { ok: true, resumen, workers })
      }

      if (seg[2] === 'settings' && metodo === 'GET') {
        requerirPermiso(sesion, 'admin.settings')
        const turnstile = await clavesTurnstile()
        const principal = puede(sesion, 'admin.settings.turnstile')
        return json(res, 200, {
          turnstileSiteKey: principal ? turnstile.siteKey : '',
          turnstileSecretKey: principal ? turnstile.secretKey : '',
          turnstileEnabled: principal ? turnstile.activo : false,
          canTurnstile: principal,
          canMail: puede(sesion, 'admin.settings.mail'),
          canRoles: puede(sesion, 'admin.settings.roles'),
          canLimits: puede(sesion, 'admin.settings.limits'),
          requireEmailVerification: await requiereCorreoVerificado(),
          mailConfigured: await mailConfigurado(),
          maxSubs: leerMaxSubs(),
          maxSubsPerUser: await store.obtenerAjusteNumerico('max_subs_per_user', 0),
          maxBotsPerIp: await store.obtenerAjusteNumerico('max_bots_per_ip', 0),
          repo: estadoRepo(process.cwd()),
          maxPairAttemptsPerHour: await store.obtenerAjusteNumericoOpcional('pair_attempts_hour') ?? config.maxPairAttemptsPerHour,
          maxPairAttemptsPerDay: await store.obtenerAjusteNumericoOpcional('pair_attempts_day') ?? config.maxPairAttemptsPerDay,
          maxPairAttemptsPerIpPerHour: await store.obtenerAjusteNumericoOpcional('pair_attempts_ip_hour') ?? config.maxPairAttemptsPerIpPerHour,
          pairCooldownSeconds: Math.round(
            (await store.obtenerAjusteNumericoOpcional('pair_cooldown_ms') ?? config.pairCooldownMs) / 1000
          ),
          pairCodeSeconds: Math.round(
            (await store.obtenerAjusteNumericoOpcional('pair_code_ttl_ms') ?? config.codeTtlMs) / 1000
          ),
          publicUrl: config.publicUrl,
          subdomain: config.subdomain,
          domain: config.domain,
          brandName: config.brandName,
        })
      }

      if (seg[2] === 'settings' && metodo === 'PATCH') {
        const body = await leerJson(req)
        const tieneTurnstile = body.turnstileSiteKey !== undefined || body.turnstileSecretKey !== undefined
        const tieneLimites = [
          'maxSubs', 'maxSubsPerUser', 'maxBotsPerIp',
          'maxPairAttemptsPerHour', 'maxPairAttemptsPerDay', 'maxPairAttemptsPerIpPerHour',
          'pairCooldownSeconds', 'pairCodeSeconds',
        ].some((campo) => body[campo] !== undefined)
        if (tieneTurnstile) requerirPermiso(sesion, 'admin.settings.turnstile')
        if (tieneLimites) requerirPermiso(sesion, 'admin.settings.limits')
        if (body.requireEmailVerification !== undefined) {
          requerirPermiso(sesion, 'admin.settings.mail')
          if (body.requireEmailVerification === true && !(await mailConfigurado())) {
            throw new HttpError(
              409,
              'Configura y guarda el correo SMTP antes de activar la verificación obligatoria.',
              'mail_not_configured'
            )
          }
        }
        if (!Object.keys(body).length) throw new HttpError(400, 'No hay cambios para guardar.', 'empty_update')
        if (body.maxSubs !== undefined) {
          try { guardarMaxSubs(body.maxSubs) } catch (error) {
            throw new HttpError(400, error?.message || 'Valor inválido.', 'invalid_max')
          }
        }
        if (body.maxSubsPerUser !== undefined) {
          try {
            await store.establecerAjusteNumerico('max_subs_per_user', body.maxSubsPerUser)
          } catch (error) {
            throw new HttpError(400, error?.message || 'Valor inválido.', 'invalid_max_per_user')
          }
        }
        if (body.maxBotsPerIp !== undefined) {
          try {
            await store.establecerAjusteNumerico('max_bots_per_ip', body.maxBotsPerIp)
          } catch (error) {
            throw new HttpError(400, error?.message || 'Valor inválido.', 'invalid_max_per_ip')
          }
        }
        if (body.maxPairAttemptsPerHour !== undefined) {
          try {
            await store.establecerAjusteNumerico('pair_attempts_hour', body.maxPairAttemptsPerHour)
          } catch (error) {
            throw new HttpError(400, error?.message || 'Valor inválido.', 'invalid_attempts_hour')
          }
        }
        if (body.maxPairAttemptsPerDay !== undefined) {
          try {
            await store.establecerAjusteNumerico('pair_attempts_day', body.maxPairAttemptsPerDay)
          } catch (error) {
            throw new HttpError(400, error?.message || 'Valor inválido.', 'invalid_attempts_day')
          }
        }
        if (body.maxPairAttemptsPerIpPerHour !== undefined) {
          try {
            await store.establecerAjusteNumerico('pair_attempts_ip_hour', body.maxPairAttemptsPerIpPerHour)
          } catch (error) {
            throw new HttpError(400, error?.message || 'Valor inválido.', 'invalid_attempts_ip')
          }
        }
        if (body.pairCooldownSeconds !== undefined) {
          const segundos = Number(body.pairCooldownSeconds)
          if (!Number.isFinite(segundos) || segundos < 0) {
            throw new HttpError(400, 'La espera debe ser 0 o un número de segundos.', 'invalid_cooldown')
          }
          await store.establecerAjusteNumerico('pair_cooldown_ms', Math.round(segundos * 1000))
        }
        if (body.pairCodeSeconds !== undefined) {
          const segundos = Number(body.pairCodeSeconds)
          if (!Number.isFinite(segundos) || segundos < 15) {
            throw new HttpError(400, 'La duración del código debe ser de 15 segundos o más.', 'invalid_code_ttl')
          }
          await store.establecerAjusteNumerico('pair_code_ttl_ms', Math.round(segundos * 1000))
        }
        if (body.turnstileSiteKey !== undefined) {
          await store.establecerMeta('turnstile_site_key', String(body.turnstileSiteKey || '').trim())
        }
        if (body.turnstileSecretKey !== undefined) {
          const secreto = String(body.turnstileSecretKey || '').trim()
          // Si llega vacío se conserva la clave actual: guardar desde el panel
          // nunca borra la secret key ya configurada.
          if (secreto) await store.establecerMeta('turnstile_secret_key', secreto)
        }
        if (body.requireEmailVerification !== undefined) {
          await store.establecerMeta('require_email_verification', body.requireEmailVerification === true ? '1' : '0')
        }
        const metaAuditoria = { ...body }
        delete metaAuditoria.turnstileSecretKey
        await store.registrarAuditoria({ userId: sesion.id, action: 'admin.settings', ip, meta: metaAuditoria })
        const turnstileActual = await clavesTurnstile()
        const principal = puede(sesion, 'admin.settings.turnstile')
        return json(res, 200, {
          ok: true,
          turnstileSiteKey: principal ? turnstileActual.siteKey : '',
          turnstileEnabled: principal ? turnstileActual.activo : false,
          maxSubs: leerMaxSubs(),
          maxSubsPerUser: await store.obtenerAjusteNumerico('max_subs_per_user', 0),
          maxBotsPerIp: await store.obtenerAjusteNumerico('max_bots_per_ip', 0),
          maxPairAttemptsPerHour: await store.obtenerAjusteNumericoOpcional('pair_attempts_hour') ?? config.maxPairAttemptsPerHour,
          maxPairAttemptsPerDay: await store.obtenerAjusteNumericoOpcional('pair_attempts_day') ?? config.maxPairAttemptsPerDay,
          maxPairAttemptsPerIpPerHour: await store.obtenerAjusteNumericoOpcional('pair_attempts_ip_hour') ?? config.maxPairAttemptsPerIpPerHour,
          pairCooldownSeconds: Math.round(
            (await store.obtenerAjusteNumericoOpcional('pair_cooldown_ms') ?? config.pairCooldownMs) / 1000
          ),
          pairCodeSeconds: Math.round(
            (await store.obtenerAjusteNumericoOpcional('pair_code_ttl_ms') ?? config.codeTtlMs) / 1000
          ),
          requireEmailVerification: await requiereCorreoVerificado(),
        })
      }

      // ── Roles y permisos ────────────────────────────────────────────────
      if (seg[2] === 'permissions' && metodo === 'GET') {
        if (!puede(sesion, 'admin.users.roles')) requerirPermiso(sesion, 'admin.settings.roles')
        return json(res, 200, {
          permissions: PERMISSIONS,
          principalOnly: [...PRINCIPAL_ONLY],
          canManage: puede(sesion, 'admin.settings.roles'),
        })
      }

      if (seg[2] === 'roles' && metodo === 'GET') {
        if (!puede(sesion, 'admin.users.edit') && !puede(sesion, 'admin.users.roles') && !puede(sesion, 'admin.settings.roles')) {
          throw new HttpError(403, 'No tienes permiso para ver los roles.', 'forbidden')
        }
        return json(res, 200, {
          roles: await store.listarRoles(),
          permissions: PERMISSIONS,
          principalOnly: [...PRINCIPAL_ONLY],
          canManage: puede(sesion, 'admin.settings.roles'),
        })
      }

      if (seg[2] === 'roles' && metodo === 'POST') {
        requerirPermiso(sesion, 'admin.settings.roles')
        const body = await leerJson(req)
        const name = String(body.name || '').trim()
        if (name.length < 2 || name.length > 40) {
          throw new HttpError(400, 'El nombre del rol debe tener entre 2 y 40 caracteres.', 'invalid_role_name')
        }
        const scope = body.scope === 'user' ? 'user' : 'admin'
        let permissions = normalizarPermisos(body.permissions, scope)
        if (scope === 'admin' && permissions.length && !permissions.includes('admin.access')) {
          permissions.unshift('admin.access')
        }
        const roles = await store.listarRoles()
        const base = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 28) || 'rol'
        let key = base
        let n = 2
        const keys = new Set(roles.map((rol) => rol.key))
        while (keys.has(key)) key = `${base}-${n++}`
        const rol = await store.crearRol({
          key,
          name,
          description: String(body.description || '').trim().slice(0, 180) || null,
          scope,
          permissions,
        })
        await store.registrarAuditoria({
          userId: sesion.id,
          action: 'admin.role_create',
          ip,
          meta: { id: rol.id, key: rol.key, name: rol.name, scope, permissions },
        })
        return json(res, 201, { role: rol })
      }

      if (seg[2] === 'roles' && seg[3] && metodo === 'PATCH') {
        requerirPermiso(sesion, 'admin.settings.roles')
        const id = Number(seg[3])
        const rol = await store.obtenerRol(id)
        if (!rol) throw new HttpError(404, 'Rol no encontrado.', 'not_found')
        if (rol.key === 'principal') {
          throw new HttpError(409, 'El rol del administrador principal no se puede modificar.', 'principal_role')
        }
        const body = await leerJson(req)
        const cambios = {}
        if (body.name !== undefined) {
          const name = String(body.name || '').trim()
          if (name.length < 2 || name.length > 40) {
            throw new HttpError(400, 'El nombre del rol debe tener entre 2 y 40 caracteres.', 'invalid_role_name')
          }
          cambios.name = name
        }
        if (body.description !== undefined) {
          cambios.description = String(body.description || '').trim().slice(0, 180) || null
        }
        if (body.permissions !== undefined) {
          if (rol.key === 'user') {
            throw new HttpError(409, 'El rol Usuario conserva sus permisos básicos y no se puede limitar.', 'system_role')
          }
          let permissions = normalizarPermisos(body.permissions, rol.scope)
          if (rol.scope === 'admin' && permissions.length && !permissions.includes('admin.access')) {
            permissions.unshift('admin.access')
          }
          cambios.permissions = permissions
        }
        if (!Object.keys(cambios).length) {
          throw new HttpError(400, 'No hay cambios para guardar.', 'empty_update')
        }
        await store.actualizarRol(id, cambios)
        await store.registrarAuditoria({
          userId: sesion.id,
          action: 'admin.role_update',
          ip,
          meta: { id, key: rol.key, campos: Object.keys(cambios) },
        })
        return json(res, 200, { role: await store.obtenerRol(id) })
      }

      if (seg[2] === 'roles' && seg[3] && metodo === 'DELETE') {
        requerirPermiso(sesion, 'admin.settings.roles')
        const id = Number(seg[3])
        const rol = await store.obtenerRol(id)
        if (!rol) throw new HttpError(404, 'Rol no encontrado.', 'not_found')
        if (rol.system) {
          throw new HttpError(409, 'Los roles del sistema no se pueden eliminar.', 'system_role')
        }
        const usuarios = await store.contarUsuariosConRol(id)
        if (usuarios > 0) {
          throw new HttpError(409, 'Ese rol todavía tiene usuarios asignados. Cámbialos de rol primero.', 'role_in_use')
        }
        await store.eliminarRol(id)
        await store.registrarAuditoria({
          userId: sesion.id,
          action: 'admin.role_delete',
          ip,
          meta: { id, key: rol.key, name: rol.name },
        })
        return json(res, 200, { ok: true })
      }

      // ── Correo / SMTP / plantillas ──────────────────────────────────────
      if (seg[2] === 'mail' && metodo === 'GET' && seg.length === 3) {
        requerirPermiso(sesion, 'admin.settings.mail')
        return json(res, 200, {
          config: configCorreoPublica(await leerConfigCorreo(store)),
          templates: await cargarPlantillas(store),
          variables: MAIL_VARIABLES,
          requireEmailVerification: await requiereCorreoVerificado(),
          publicUrl: config.publicUrl,
          brandName: config.brandName,
        })
      }

      if (seg[2] === 'mail' && metodo === 'PATCH' && seg.length === 3) {
        requerirPermiso(sesion, 'admin.settings.mail')
        const body = await leerJson(req)
        // No permitas dejar la verificación obligatoria activa sin un SMTP
        // completo: bloquearía la vinculación de todos los usuarios.
        const actual = await leerConfigCorreo(store)
        const quiereVerificacion = body.requireEmailVerification !== undefined
          ? body.requireEmailVerification === true
          : await requiereCorreoVerificado()
        if (quiereVerificacion) {
          const candidato = {
            ...actual,
            host: body.host !== undefined ? String(body.host || '').trim() : actual.host,
            user: body.user !== undefined ? String(body.user || '').trim() : actual.user,
            from: body.from !== undefined ? String(body.from || '').trim() : actual.from,
            mailer: body.mailer !== undefined ? String(body.mailer || '').trim().toLowerCase() : actual.mailer,
            pass: body.password ? String(body.password) : actual.pass,
          }
          if (!correoConfigurado(candidato)) {
            throw new HttpError(
              409,
              'Completa el servidor, usuario, contraseña y remitente SMTP antes de activar la verificación obligatoria.',
              'mail_not_configured'
            )
          }
        }
        const configuracion = await guardarConfigCorreo(store, body)
        if (body.requireEmailVerification !== undefined) {
          await store.establecerMeta('require_email_verification', body.requireEmailVerification === true ? '1' : '0')
        }
        const auditoria = { ...body }
        delete auditoria.password
        await store.registrarAuditoria({
          userId: sesion.id,
          action: 'admin.mail_settings',
          ip,
          meta: auditoria,
        })
        return json(res, 200, {
          ok: true,
          config: configCorreoPublica(configuracion),
          requireEmailVerification: await requiereCorreoVerificado(),
        })
      }

      if (seg[2] === 'mail' && seg[3] === 'test' && metodo === 'POST') {
        requerirPermiso(sesion, 'admin.settings.mail')
        limitar(req, `mail-test:${sesion.id}`, 5, 15 * 60 * 1000)
        const body = await leerJson(req)
        const to = String(body.to || sesion.email || config.adminEmail || '').trim()
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
          throw new HttpError(400, 'Escribe un correo de destino válido.', 'invalid_recipient')
        }
        const resultado = await enviarCorreoPrueba(store, {
          to,
          brand: config.brandName,
          panelUrl: config.publicUrl,
          username: sesion.username,
        })
        await store.registrarAuditoria({
          userId: sesion.id,
          action: 'admin.mail_test',
          ip,
          meta: { to, messageId: resultado?.messageId || null },
        })
        return json(res, 200, { ok: true, to, messageId: resultado?.messageId || null })
      }

      if (seg[2] === 'mail' && seg[3] === 'templates' && metodo === 'PATCH') {
        requerirPermiso(sesion, 'admin.settings.mail')
        const body = await leerJson(req)
        const plantillas = await guardarPlantillas(store, body.templates || body)
        await store.registrarAuditoria({ userId: sesion.id, action: 'admin.mail_templates', ip })
        return json(res, 200, { ok: true, templates: plantillas, variables: MAIL_VARIABLES })
      }

      if (seg[2] === 'communities' && metodo === 'GET') {
        requerirPermiso(sesion, 'admin.communities')
        const comunidades = await store.listarComunidades()
        return json(res, 200, { communities: comunidades })
      }

      if (seg[2] === 'communities' && metodo === 'POST') {
        requerirPermiso(sesion, 'admin.communities.edit')
        const body = await leerJson(req)
        const name = String(body.name || '').trim()
        const link = String(body.link || '').trim()
        if (name.length < 2 || name.length > 80) {
          throw new HttpError(400, 'El nombre debe tener entre 2 y 80 caracteres.', 'invalid_name')
        }
        if (!/^https?:\/\/.+/i.test(link)) {
          throw new HttpError(400, 'El enlace debe empezar con http:// o https://', 'invalid_link')
        }
        const description = String(body.description || '').trim().slice(0, 300) || null
        const comunidad = await store.crearComunidad({ name, link, description, createdBy: sesion.id })
        await store.registrarAuditoria({
          userId: sesion.id,
          action: 'admin.community_create',
          ip,
          meta: { name, link },
        })
        return json(res, 201, { community: comunidad })
      }

      if (seg[2] === 'communities' && seg[3] && metodo === 'PATCH') {
        requerirPermiso(sesion, 'admin.communities.edit')
        const id = Number(seg[3])
        const existente = await store.obtenerComunidad(id)
        if (!existente) throw new HttpError(404, 'Comunidad no encontrada.', 'not_found')
        const body = await leerJson(req)
        const cambios = {}
        if (body.name !== undefined) {
          const name = String(body.name || '').trim()
          if (name.length < 2 || name.length > 80) {
            throw new HttpError(400, 'El nombre debe tener entre 2 y 80 caracteres.', 'invalid_name')
          }
          cambios.name = name
        }
        if (body.link !== undefined) {
          const link = String(body.link || '').trim()
          if (!/^https?:\/\/.+/i.test(link)) {
            throw new HttpError(400, 'El enlace debe empezar con http:// o https://', 'invalid_link')
          }
          cambios.link = link
        }
        if (body.description !== undefined) cambios.description = String(body.description || '').trim().slice(0, 300) || null
        if (body.active !== undefined) cambios.active = body.active === true || body.active === 1
        await store.actualizarComunidad(id, cambios)
        await store.registrarAuditoria({
          userId: sesion.id,
          action: 'admin.community_update',
          ip,
          meta: { id, campos: Object.keys(cambios) },
        })
        return json(res, 200, { ok: true, community: await store.obtenerComunidad(id) })
      }

      if (seg[2] === 'communities' && seg[3] && metodo === 'DELETE') {
        requerirPermiso(sesion, 'admin.communities.edit')
        const id = Number(seg[3])
        const existente = await store.obtenerComunidad(id)
        if (!existente) throw new HttpError(404, 'Comunidad no encontrada.', 'not_found')
        await store.eliminarComunidad(id)
        await store.registrarAuditoria({
          userId: sesion.id,
          action: 'admin.community_delete',
          ip,
          meta: { id, name: existente.name },
        })
        return json(res, 200, { ok: true })
      }
    }

    throw new HttpError(404, 'No encontrado.', 'not_found')
  }

  let active = 0
  let authActive = 0
  let uploadActive = 0
  const server = http.createServer((req, res) => {
    let requestPath = (req.url || '').split('?')[0]
    try { requestPath = decodeURIComponent(requestPath) } catch {}
    const authRequest = /^\/api\/auth\/(?:register|login|forgot|reset|password)$/.test(requestPath)
    const uploadRequest = /^\/api\/bots\/\d+\/config\/image$/.test(requestPath) && req.method === 'POST'
    if (active >= 128 || (authRequest && authActive >= 8) || (uploadRequest && uploadActive >= 2)) {
      cabecerasSeguridad(res)
      if (config.cookieSecure) res.setHeader('Strict-Transport-Security', 'max-age=15552000')
      return json(res, 503, { code: 'server_busy', error: 'Hay muchas solicitudes en este momento. Intenta de nuevo en unos segundos.' }, { 'Retry-After': '3', Connection: 'close' })
    }
    active++
    if (authRequest) authActive++
    if (uploadRequest) uploadActive++
    let released = false
    const release = () => {
      if (released) return
      released = true
      active--
      if (authRequest) authActive--
      if (uploadRequest) uploadActive--
    }
    res.once('finish', release)
    // No liberar el cupo de trabajo por un cliente que corta la conexión:
    // el hash/SMTP sigue ejecutándose hasta terminar la petición.
    manejar(req, res).catch((error) => {
      if (req.aborted || res.destroyed) return
      const info = mapaError(error)
      if (info.status >= 500) logger.error?.('[webpanel]', error)
      if (res.headersSent) {
        try { res.end() } catch {}
        return
      }
      json(res, info.status, { error: info.message, code: info.code })
    }).finally(release)
  })
  server.requestTimeout = 30_000
  server.headersTimeout = 10_000
  server.keepAliveTimeout = 5000
  server.maxRequestsPerSocket = 100
  return server
}

export async function startWebPanel(overrides = {}, runtime = {}) {
  const config = cargarConfigPanel(overrides)
  if (!config.enabled) {
    console.log('[webpanel] Deshabilitado por configuración.')
    return null
  }

  const store = new PanelStore(config.dbFile)
  await store.init()
  await asegurarAdmin(store, config)

  const limiter = new RateLimiter()
  const pairing = runtime.pairing || new PairingManager({ store, config })
  const server = crearServidor({ config, store, pairing, limiter, runtime })

  await new Promise((resolve, reject) => {
    const alError = (error) => {
      server.off('listening', alEscuchar)
      reject(error)
    }
    const alEscuchar = () => {
      server.off('error', alError)
      resolve()
    }
    server.once('error', alError)
    server.once('listening', alEscuchar)
    server.listen(config.port, config.host)
  }).catch(async (error) => {
    await pairing.cerrar().catch(() => {})
    limiter.close()
    await store.close().catch(() => {})
    if (error?.code === 'EADDRINUSE') {
      console.error(`[webpanel] El puerto ${config.port} ya está en uso; el panel no se inició.`)
      return null
    }
    throw error
  })

  if (!server.listening) return null

  console.log(
    `[webpanel] Escuchando en ${config.host}:${config.port} — público: ${config.publicUrl}`
  )

  return {
    config,
    store,
    pairing,
    server,
    async close() {
      await pairing.cerrar().catch(() => {})
      limiter.close()
      await new Promise((resolve) => {
        let cerrado = false
        const fin = () => {
          if (cerrado) return
          cerrado = true
          resolve()
        }
        server.close(fin)
        // Las conexiones keep-alive abiertas impedirían que el puerto se
        // liberase: se cierran las ociosas al instante y las activas cuando
        // terminen (con un tope de seguridad).
        try { server.closeIdleConnections?.() } catch {}
        const tope = setTimeout(() => {
          try { server.closeAllConnections?.() } catch {}
          fin()
        }, 800)
        tope.unref?.()
      })
      await store.close().catch(() => {})
    },
  }
}
