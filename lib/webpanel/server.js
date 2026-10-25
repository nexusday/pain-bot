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
import { createPushService } from './push.js'
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
import { PairingManager } from './pairing.js'
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

import { SIN_RUTA, HttpError, json, cabecerasSeguridad, leerJson, mapaError, segmentos, MIME, permisosDeUsuario, usuarioPublico, antipvDe, establecerAntipvPanel } from './http.js'
import { crearRutasCuenta } from './routes-account.js'
import { crearRutasBots } from './routes-bots.js'
import { crearRutasAdminConfig } from './routes-admin-config.js'
import { crearRutasAdminGestion } from './routes-admin.js'
import { crearRutasPremium } from './routes-premium.js'

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

function crearServidor({ config, store, pairing, limiter, push, runtime = {}, logger = console }) {
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
    if (permissions.includes('admin.users.ip')) requerirPermiso(sesion,'admin.users.ip')
    if (esPrincipal(sesion) || puede(sesion, 'admin.settings.roles')) return
    if (permissions.some((key) => !puede(sesion, key))) {
      throw new HttpError(403, 'No puedes administrar ni asignar un rol con permisos que no tienes.', 'forbidden')
    }
  }

  // Al crear o editar un rol rige la regla estricta: nadie puede conceder
  // permisos que él mismo no tiene (solo el principal no se limita).
  function requerirConcesionPermisos(sesion, permissions) {
    if (esPrincipal(sesion)) return
    if (permissions.some((key) => !puede(sesion, key))) {
      throw new HttpError(403, 'No puedes conceder a un rol permisos que no tienes.', 'forbidden')
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
    // 0 (o menos) significa «sin límite» en el panel: no se cuenta el intento.
    if (!Number.isFinite(Number(limite)) || Number(limite) <= 0) return
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
  // Límites de los códigos de correo (verificación y recuperación). Viven en
  // este objeto mutable porque `crearServidor` es SÍNCRONA: no se puede usar
  // `await` aquí arriba. Se rellenan al arrancar y cuando el administrador los
  // cambia en Ajustes → Correo (`aplicarLimitesCorreo`), sin reiniciar.
  const limitesCorreo = {
    ttlMs: 15 * 60 * 1000,
    maxIntentos: 5,
    cooldownMs: 60 * 1000,
    maxPorHora: 10,
    maxPorHoraGlobal: 40,
  }

  async function cargarLimitesCorreo() {
    limitesCorreo.ttlMs = Math.max(60000, (await store.obtenerAjusteNumericoOpcional('email_code_ttl_ms')) ?? 15 * 60 * 1000)
    limitesCorreo.maxIntentos = Math.max(1, (await store.obtenerAjusteNumericoOpcional('email_code_max_attempts')) ?? 5)
    limitesCorreo.cooldownMs = Math.max(1000, (await store.obtenerAjusteNumericoOpcional('email_code_cooldown_ms')) ?? 60 * 1000)
    limitesCorreo.maxPorHora = Math.max(1, (await store.obtenerAjusteNumericoOpcional('email_code_max_per_hour')) ?? 10)
    limitesCorreo.maxPorHoraGlobal = Math.max(1, (await store.obtenerAjusteNumericoOpcional('email_code_max_per_hour_global')) ?? 40)
    return limitesCorreo
  }

  /** Aplica en caliente los límites recién guardados desde el panel. */
  function aplicarLimitesCorreo(cambios = {}) {
    if (Number.isFinite(cambios.ttlMs) && cambios.ttlMs > 0) limitesCorreo.ttlMs = Math.max(60000, Math.round(cambios.ttlMs))
    if (Number.isFinite(cambios.maxIntentos) && cambios.maxIntentos > 0) limitesCorreo.maxIntentos = Math.max(1, Math.round(cambios.maxIntentos))
    if (Number.isFinite(cambios.cooldownMs) && cambios.cooldownMs >= 0) limitesCorreo.cooldownMs = Math.max(1000, Math.round(cambios.cooldownMs))
    if (Number.isFinite(cambios.maxPorHora) && cambios.maxPorHora > 0) limitesCorreo.maxPorHora = Math.max(1, Math.round(cambios.maxPorHora))
    if (Number.isFinite(cambios.maxPorHoraGlobal) && cambios.maxPorHoraGlobal > 0) limitesCorreo.maxPorHoraGlobal = Math.max(1, Math.round(cambios.maxPorHoraGlobal))
    return limitesCorreo
  }

  let limitesCorreoCargados = false
  async function asegurarLimitesCorreo() {
    if (limitesCorreoCargados) return limitesCorreo
    limitesCorreoCargados = true
    await cargarLimitesCorreo().catch(() => limitesCorreo)
    return limitesCorreo
  }

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
      expiresAt: Date.now() + limitesCorreo.ttlMs,
      ip,
    })
    return codigo
  }

  async function enviarCodigoCorreo(usuario, purpose, { ip } = {}) {
    if (!usuario?.email) return { sent: false, reason: 'missing_email' }
    if (!(await mailConfigurado())) return { sent: false, reason: 'mail_not_configured' }
    // Espera mínima entre códigos del mismo usuario (evita spam de correos)
    // y tope por hora, ambos configurables en Ajustes → Correo.
    const reciente = await store.contarTokensCorreo({
      userId: usuario.id,
      purpose,
      since: Date.now() - limitesCorreo.cooldownMs,
    })
    if (reciente > 0) return { sent: false, reason: 'email_code_cooldown' }
    const enLaHora = await store.contarTokensCorreo({
      userId: usuario.id,
      purpose,
      since: Date.now() - 60 * 60 * 1000,
    })
    if (enLaHora >= limitesCorreo.maxPorHora) return { sent: false, reason: 'email_code_limit' }
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
          minutes: Math.max(1, Math.round(limitesCorreo.ttlMs / 60000)),
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
    if (Number(token.attempts) >= limitesCorreo.maxIntentos) {
      await store.marcarTokenCorreoUsado(token.id)
      throw new HttpError(429, 'Demasiados intentos con ese código. Pide uno nuevo.', 'too_many_attempts')
    }
    if (!compararHash(token.code_hash, hashCodigo(codigo))) {
      await store.incrementarIntentosTokenCorreo(token.id)
      throw new HttpError(401, 'El código no es correcto.', 'invalid_code')
    }
    // Comparar el código y marcarlo después del hash de contraseña permitía
    // reutilizarlo en dos peticiones simultáneas. Solo una puede consumirlo.
    if (!(await store.consumirTokenCorreo(token.id, limitesCorreo.maxIntentos))) {
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

  // Contexto compartido por los módulos de rutas.
  const ctx = { HttpError, aplicarLimitesCorreo, clavesTurnstile, config, cookieDeSesion, crearSesion, enviarCodigoCorreo, esPrincipal, limitesCorreo, getAntiPv, json, leerJson, limitar, logger, mailConfigurado, main, obtenerSesion, pairing, permisosDeUsuario, permisosSesion, puede, push, requerirAdmin, requerirConcesionPermisos, requerirControlPermisos, requerirCsrf, requerirPermiso, requerirPrincipal, requerirUsuario, requiereCorreoVerificado, respuestaCorreo, sesionesDelPanel, sessions, setAntiPv, store, usuarioPublico, validarCodigoCorreo, verificarOrigen, verificarTurnstile }
  const rutasCuenta = crearRutasCuenta(ctx)
  const rutasBots = crearRutasBots(ctx)
  const rutasPremium = crearRutasPremium(ctx)
  const rutasAdminConfig = crearRutasAdminConfig(ctx)
  const rutasAdminGestion = crearRutasAdminGestion(ctx)

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

    await asegurarLimitesCorreo()

    const args = { req, res, url, pathname, seg, metodo, ip }
    if ((await rutasCuenta(args)) !== SIN_RUTA) return
    if ((await rutasBots(args)) !== SIN_RUTA) return
    if ((await rutasPremium(args)) !== SIN_RUTA) return
    if ((await rutasAdminConfig(args)) !== SIN_RUTA) return
    if ((await rutasAdminGestion(args)) !== SIN_RUTA) return

    throw new HttpError(404, 'No encontrado.', 'not_found')
  }

  let active = 0
  let authActive = 0
  let uploadActive = 0
  let backupActive = 0
  const server = http.createServer((req, res) => {
    let requestPath = (req.url || '').split('?')[0]
    try { requestPath = decodeURIComponent(requestPath) } catch {}
    const authRequest = /^\/api\/auth\/(?:register|login|forgot|reset|password)$/.test(requestPath)
    const uploadRequest = /^\/api\/bots\/\d+\/config\/image$/.test(requestPath) && req.method === 'POST'
    const backupRequest = /^\/api\/admin\/backups\/(?:export|import)$/.test(requestPath)
    if (active >= 128 || (authRequest && authActive >= 8) || (uploadRequest && uploadActive >= 2) || (backupRequest && backupActive >= 1)) {
      cabecerasSeguridad(res)
      if (config.cookieSecure) res.setHeader('Strict-Transport-Security', 'max-age=15552000')
      return json(res, 503, { code: 'server_busy', error: 'Hay muchas solicitudes en este momento. Intenta de nuevo en unos segundos.' }, { 'Retry-After': '3', Connection: 'close' })
    }
    active++
    if (authRequest) authActive++
    if (uploadRequest) uploadActive++
    if (backupRequest) backupActive++
    let released = false
    const release = () => {
      if (released) return
      released = true
      active--
      if (authRequest) authActive--
      if (uploadRequest) uploadActive--
      if (backupRequest) backupActive--
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
  const push = createPushService(store,config,runtime.sendPush)
  await push.recover()
  const server = crearServidor({ config, store, pairing, limiter, push, runtime })

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
    push.close()
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
      push.close()
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
