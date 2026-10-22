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
    "img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'"
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

function usuarioPublico(usuario) {
  if (!usuario) return null
  return {
    id: usuario.id,
    username: usuario.username,
    email: usuario.email || null,
    role: usuario.role,
    status: usuario.status,
    created_at: usuario.created_at,
    last_login_at: usuario.last_login_at || null,
  }
}

function mapaError(error) {
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

async function asegurarAdmin(store, config, logger = console) {
  const admins = await store.contarAdmins()
  if (admins > 0 && !config.adminReset) return null

  const password = config.adminPass || crypto.randomBytes(12).toString('base64url')
  const passwordHash = await hashPassword(password)
  let usuario = await store.buscarUsuarioPorNombre(config.adminUser)

  if (usuario) {
    await store.actualizarUsuario(usuario.id, {
      role: 'admin',
      status: 'active',
      passwordHash,
    })
  } else {
    usuario = await store.crearUsuario({
      username: config.adminUser,
      passwordHash,
      role: 'admin',
    })
  }

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

function crearServidor({ config, store, pairing, limiter, logger = console }) {
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

  function requerirAdmin(sesion) {
    if (sesion.role !== 'admin') throw new HttpError(403, 'Necesitas permisos de administrador.', 'forbidden')
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
      // SPA: cualquier ruta desconocida devuelve index.html.
      archivo = path.join(config.publicDir, 'index.html')
      try {
        info = await fs.promises.stat(archivo)
      } catch {
        info = null
      }
    }
    let contenido
    try {
      contenido = await fs.promises.readFile(archivo)
    } catch {
      throw new HttpError(404, 'No encontrado.')
    }
    const extension = path.extname(archivo).toLowerCase()
    // Los assets se revalidan siempre (ETag/Last-Modified): así, tras un
    // `git pull` el navegador recibe la versión nueva del panel sin tener
    // que hacer una recarga forzada ni esperar a que caduque la caché.
    const etag = info
      ? `W/"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`
      : `W/"${contenido.length.toString(16)}"`
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
      return json(res, 200, {
        brandName: config.brandName,
        publicUrl: config.publicUrl,
        subdomain: config.subdomain,
        domain: config.domain,
        allowRegistration: config.allowRegistration,
        requireInvite: config.requireInvite,
        maxSubs: leerMaxSubs(),
        version: config.version,
        mainLinked: estadoPrincipal().linked,
        pairCodeTtlMs: await store.obtenerAjusteNumericoOpcional('pair_code_ttl_ms') ?? config.codeTtlMs,
      })
    }

    // ── Comunidades de WhatsApp (lectura para cualquier cuenta) ───────────
    if (pathname === '/api/communities' && metodo === 'GET') {
      const sesion = await requerirUsuario(req)
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
      const username = String(body.username || '').trim()
      const email = String(body.email || '').trim() || null
      const password = String(body.password || '')
      const invite = String(body.invite || '').trim()

      if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
        throw new HttpError(400, 'El usuario debe tener de 3 a 32 caracteres (letras, números, punto, guion).', 'invalid_username')
      }
      if (password.length < 8 || password.length > 200) {
        throw new HttpError(400, 'La contraseña debe tener al menos 8 caracteres.', 'invalid_password')
      }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
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
      if (email && await store.buscarUsuarioPorEmail(email)) {
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
      await store.registrarAuditoria({ userId: usuario.id, action: 'auth.register', ip })
      res.setHeader('Set-Cookie', cookieDeSesion(token))
      return json(res, 201, { user: usuarioPublico(usuario), csrf })
    }

    if (pathname === '/api/auth/login' && metodo === 'POST') {
      verificarOrigen(req)
      limitar(req, 'login', 12, 15 * 60 * 1000)
      const body = await leerJson(req)
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
      if (!original || original.role !== 'admin' || original.status !== 'active') {
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

    // ── Bots del usuario ──────────────────────────────────────────────────
    if (pathname === '/api/bots' && metodo === 'GET') {
      const sesion = await requerirUsuario(req)
      const filas = await store.listarBotsUsuario(sesion.id)
      const sesiones = listarSesiones(config.root)
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
      if (!esPropietario && sesion.role !== 'admin') {
        throw new HttpError(403, 'No autorizado.', 'forbidden')
      }

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
            antiPv: antipvDe(phone),
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
          await establecerAntipvPanel(phone, body.antiPv === true)
        }
        const guardado = guardarConfigSubBot(config.root, phone, cambios)
        const preview = construirPreviewMenu({ phone, config: guardado, esPropietario })
        return json(res, 200, {
          ok: true,
          config: { ...configPublicaSubBot(guardado), antiPv: antipvDe(phone) },
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
          config: { ...configPublicaSubBot(configuracion), antiPv: antipvDe(phone) },
        })
      }
    }

    if (pathname === '/api/bots/link' && metodo === 'POST') {
      const sesion = await requerirUsuario(req)
      requerirCsrf(req, sesion)
      verificarOrigen(req)
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
      const pairingEstado = await pairing.estado(seg[3], sesion.id, { admin: sesion.role === 'admin' })
      return json(res, 200, { pairing: pairingEstado })
    }

    if (seg[0] === 'api' && seg[1] === 'bots' && seg[2] === 'link' && seg[3] && seg[4] === 'cancel' && metodo === 'POST') {
      const sesion = await requerirUsuario(req)
      requerirCsrf(req, sesion)
      verificarOrigen(req)
      const pairingEstado = await pairing.cancelar(seg[3], sesion.id, { admin: sesion.role === 'admin' })
      return json(res, 200, { pairing: pairingEstado })
    }

    if (seg[0] === 'api' && seg[1] === 'bots' && seg[2] === 'link' && seg[3] && seg[4] === 'regenerate' && metodo === 'POST') {
      const sesion = await requerirUsuario(req)
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
      if (Number(fila.user_id) !== Number(sesion.id) && sesion.role !== 'admin') {
        throw new HttpError(403, 'No autorizado.', 'forbidden')
      }
      await eliminarSesion(config.root, phone)
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
      if (Number(fila.user_id) !== Number(sesion.id) && sesion.role !== 'admin') {
        throw new HttpError(403, 'No autorizado.', 'forbidden')
      }
      const resultado = await reconectarSesion(config.root, phone)
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
      if (Number(fila.user_id) !== Number(sesion.id) && sesion.role !== 'admin') {
        throw new HttpError(403, 'No autorizado.', 'forbidden')
      }
      const body = await leerJson(req)
      const label = String(body.label ?? '').trim().slice(0, 60) || null
      await store.actualizarBot(phone, { label })
      return json(res, 200, { ok: true })
    }

    // ── Bot principal (solo administradores) ─────────────────────────────
    if (seg[0] === 'api' && seg[1] === 'main') {
      const sesion = await requerirUsuario(req)
      requerirAdmin(sesion)
      if (!['GET', 'HEAD', 'OPTIONS'].includes(metodo)) {
        requerirCsrf(req, sesion)
        verificarOrigen(req)
      }

      if (seg.length === 2 && metodo === 'GET') {
        return json(res, 200, { main: estadoPrincipal() })
      }

      if (seg[2] === 'code' && metodo === 'POST') {
        limitar(req, `main-code:${sesion.id}`, 6, 15 * 60 * 1000)
        const body = await leerJson(req)
        const resultado = await solicitarCodigoPrincipal(body.phone)
        await store.registrarAuditoria({
          userId: sesion.id,
          action: 'main.code',
          ip,
          meta: { phone: resultado.phone },
        })
        return json(res, 200, resultado)
      }

      if (seg[2] === 'unlink' && metodo === 'POST') {
        const resultado = await desvincularPrincipal()
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
        const resultado = await relinkPrincipal(body.phone)
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
        programarReinicioPrincipal(1500)
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
        const id = Number(seg[3])
        const objetivo = await store.buscarUsuarioPorId(id)
        if (!objetivo) throw new HttpError(404, 'Usuario no encontrado.', 'not_found')
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
        const id = Number(seg[3])
        const objetivo = await store.buscarUsuarioPorId(id)
        if (!objetivo) throw new HttpError(404, 'Usuario no encontrado.', 'not_found')
        const body = await leerJson(req)
        const cambios = {}
        if (body.role !== undefined) {
          if (!['user', 'admin'].includes(body.role)) throw new HttpError(400, 'Rol inválido.', 'invalid_role')
          if (objetivo.role === 'admin' && body.role !== 'admin' && (await store.contarAdmins()) <= 1) {
            throw new HttpError(409, 'No puedes quitar al último administrador.', 'last_admin')
          }
          cambios.role = body.role
        }
        if (body.status !== undefined) {
          if (!['active', 'banned'].includes(body.status)) throw new HttpError(400, 'Estado inválido.', 'invalid_status')
          if (objetivo.role === 'admin' && body.status === 'banned' && (await store.contarAdmins()) <= 1) {
            throw new HttpError(409, 'No puedes bloquear al último administrador.', 'last_admin')
          }
          cambios.status = body.status
        }
        if (body.password !== undefined) {
          if (String(body.password).length < 8) throw new HttpError(400, 'La contraseña debe tener al menos 8 caracteres.', 'invalid_password')
          cambios.passwordHash = await hashPassword(String(body.password))
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
        const id = Number(seg[3])
        const objetivo = await store.buscarUsuarioPorId(id)
        if (!objetivo) throw new HttpError(404, 'Usuario no encontrado.', 'not_found')
        if (objetivo.role === 'admin' && (await store.contarAdmins()) <= 1) {
          throw new HttpError(409, 'No puedes borrar al último administrador.', 'last_admin')
        }
        await store.eliminarUsuario(id)
        await store.registrarAuditoria({ userId: sesion.id, action: 'admin.user_delete', ip, meta: { target: id, username: objetivo.username } })
        return json(res, 200, { ok: true })
      }

      if (seg[2] === 'sessions' && metodo === 'GET') {
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
              await eliminarSesion(config.root, phone)
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
        const phone = normalizarTelefono(seg[3]) || seg[3]
        if (!carpetaSesionValida(phone)) throw new HttpError(400, 'Sesión inválida.', 'invalid_session')
        const resultado = await reconectarSesion(config.root, phone)
        await store.registrarAuditoria({ userId: sesion.id, action: 'admin.session_reconnect', ip, meta: { phone, ...resultado } })
        return json(res, 200, resultado)
      }

      if (seg[2] === 'sessions' && seg[3] && metodo === 'DELETE') {
        const phone = normalizarTelefono(seg[3]) || seg[3]
        if (!carpetaSesionValida(phone)) throw new HttpError(400, 'Sesión inválida.', 'invalid_session')
        await eliminarSesion(config.root, phone)
        await store.eliminarBot(phone)
        await store.registrarAuditoria({ userId: sesion.id, action: 'admin.session_delete', ip, meta: { phone } })
        return json(res, 200, { ok: true })
      }

      if (seg[2] === 'pairings' && metodo === 'GET') {
        return json(res, 200, { pairings: await store.pairingsRecientes(100) })
      }

      if (seg[2] === 'audit' && metodo === 'GET') {
        const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 100, 1), 500)
        const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0)
        return json(res, 200, { audit: await store.listarAuditoria({ limit, offset }) })
      }

      if (seg[2] === 'update' && metodo === 'POST') {
        if (typeof global.recargarEnCaliente !== 'function') {
          throw new HttpError(
            501,
            'El proceso del bot tiene el código viejo. Reinicia el bot una vez (Pterodactyl → Reiniciar) y desde ahí "Actualizar en caliente" ya funciona sin reiniciar.',
            'unsupported'
          )
        }
        const resultado = actualizarDesdeRemoto(process.cwd())
        const plugins = (resultado.archivos || [])
          .filter((archivo) => archivo.startsWith('plugins/'))
          .map((archivo) => archivo.split('/').pop())
        const resumen = await global.recargarEnCaliente({ plugins })
        // El panel se recarga con el código nuevo después de responder.
        setTimeout(() => { global.reiniciarPanelWeb?.() }, 250)
        return json(res, 200, {
          ok: true,
          commits: resultado.commits,
          archivos: resultado.archivos,
          resumen,
          cambiosLocalesConservados: resultado.cambiosLocalesConservados,
          habiaCambiosLocales: resultado.habiaCambiosLocales,
          rama: resultado.despues?.rama || resultado.antes?.rama,
          commit: resultado.despues?.corto || resultado.antes?.corto,
          reinicioPendiente: (resultado.archivos || []).some((archivo) => archivo === 'main.js'),
        })
      }

      if (seg[2] === 'reload' && metodo === 'POST') {
        if (typeof global.recargarEnCaliente !== 'function') {
          throw new HttpError(
            501,
            'El proceso del bot tiene el código viejo. Reinicia el bot una vez (Pterodactyl → Reiniciar) para poder recargar en caliente.',
            'unsupported'
          )
        }
        const resumen = await global.recargarEnCaliente({})
        setTimeout(() => { global.reiniciarPanelWeb?.() }, 250)
        return json(res, 200, { ok: true, resumen })
      }

      if (seg[2] === 'settings' && metodo === 'GET') {
        return json(res, 200, {
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
        await store.registrarAuditoria({ userId: sesion.id, action: 'admin.settings', ip, meta: body })
        return json(res, 200, {
          ok: true,
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
        })
      }

      if (seg[2] === 'communities' && metodo === 'GET') {
        const comunidades = await store.listarComunidades()
        return json(res, 200, { communities: comunidades })
      }

      if (seg[2] === 'communities' && metodo === 'POST') {
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

  return http.createServer((req, res) => {
    manejar(req, res).catch((error) => {
      const info = mapaError(error)
      if (info.status >= 500) logger.error?.('[webpanel]', error)
      if (res.headersSent) {
        try { res.end() } catch {}
        return
      }
      json(res, info.status, { error: info.message, code: info.code })
    })
  })
}

export async function startWebPanel(overrides = {}) {
  const config = cargarConfigPanel(overrides)
  if (!config.enabled) {
    console.log('[webpanel] Deshabilitado por configuración.')
    return null
  }

  const store = new PanelStore(config.dbFile)
  await store.init()
  await asegurarAdmin(store, config)

  const limiter = new RateLimiter()
  const pairing = new PairingManager({ store, config })
  const server = crearServidor({ config, store, pairing, limiter })

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
