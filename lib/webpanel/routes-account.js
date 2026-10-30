/* Pain Panel — rutas de acceso y cuenta (público + autenticado) */
import { SIN_RUTA } from './http.js'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { hashPassword, verifyPassword } from './auth.js'
import { estadoPrincipal } from './main-bot.js'
import { esAdminPermisos } from './permissions.js'
import { estadoPremium, leerAjustesPremium } from './premium.js'
import { estadisticasGlobales } from './runtime-stats.js'
import { deviceId, pushDeviceState, pushSettings, sqlRun, syncPushDevice } from './push.js'
import { leerMaxSubs } from './session-ops.js'

// Cache de estadísticas públicas (persistente entre peticiones, a nivel módulo).
let statsCache
let statsExpires = 0
let statsPending

const PROFILE_IMAGE_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
])
const PROFILE_IMAGE_MAX = 10 * 1024 * 1024

function leerImagenPerfil(dataUrl) {
  const match = String(dataUrl || '').match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([a-z0-9+/=\s]+)$/i)
  if (!match) throw new Error('La imagen debe ser JPG, PNG, WebP o GIF.')
  const mime = match[1].toLowerCase()
  const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64')
  if (!buffer.length || buffer.length > PROFILE_IMAGE_MAX) throw new Error('La foto no puede superar 10 MB.')
  const firma = mime === 'image/jpeg'
    ? buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8
    : mime === 'image/png'
      ? buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : mime === 'image/gif'
        ? ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'))
        : buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  if (!firma) throw new Error('El contenido no coincide con el formato de la imagen.')
  return { mime, extension: PROFILE_IMAGE_TYPES.get(mime), buffer }
}

export function crearRutasCuenta(ctx) {
  const {
    HttpError, clavesTurnstile, config, cookieDeSesion, crearSesion, enviarCodigoCorreo, json, leerJson, limitar, mailConfigurado, main, obtenerSesion, pairing, permisosDeUsuario, push, requerirCsrf, requerirPermiso, requerirUsuario, requiereCorreoVerificado, respuestaCorreo, sesionesDelPanel, sessions, store, usuarioPublico, validarCodigoCorreo, verificarOrigen, verificarTurnstile,
  } = ctx

  return async function rutasCuenta({ req, res, url, pathname, seg, metodo, ip }) {
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
        // Zonas de anuncio configuradas (solo la parte que se incrusta en la
        // web pública): así el dashboard y "Mis bots" pueden ponerlas.
        adsBanners: (await leerAjustesPremium(store)).banners,
        adsPlacements: (await leerAjustesPremium(store)).placements,
        premiumPromo: (await leerAjustesPremium(store)).promo,
        pairCodeTtlMs: await store.obtenerAjusteNumericoOpcional('pair_code_ttl_ms') ?? config.codeTtlMs,
      })
    }

    // ── Estadísticas públicas en tiempo real (sin auth) ─────────────────────
    if (pathname === '/api/stats' && metodo === 'GET') {
      if (!statsCache || Date.now() >= statsExpires) {
        statsPending ||= (async () => {
          const sesiones = sesionesDelPanel()
          const [bots, users, comunidades, ajustesPremium] = await Promise.all([
            store.contarBots(), store.contarUsuarios(), store.listarComunidades({ onlyActive: true }),
            leerAjustesPremium(store),
          ])
          // Sub-bots premium: el estado vive en el config.json de cada sesión,
          // así que se lee una vez por sondeo (cacheado 5 s).
          let premiumActive = 0
          let premiumSaved = 0
          for (const sesion of sesiones) {
            let estado
            try {
              estado = estadoPremium(config.root, sesion.phone, ajustesPremium)
            } catch { continue }
            const ediciones = estado.ediciones || {}
            const tieneEdiciones = Boolean(
              ediciones.moneda || ediciones.menu?.creado || ediciones.menu?.hosting ||
              ediciones.menu?.donar || ediciones.menu?.texto || ediciones.canal?.jid ||
              ediciones.canal?.nombre
            )
            if (estado.activo) premiumActive++
            // Guardados: conservan su personalización aunque el plan caducó y
            // vuelven solos cuando el dueño suma tiempo otra vez.
            else if (tieneEdiciones) premiumSaved++
          }
          statsCache = {
            users, bots, sessions: sesiones.length,
            sessionsConnected: sesiones.filter((s) => s.connected).length,
            sessionsLinked: sesiones.filter((s) => s.status === 'linked').length,
            sessionsPairing: sesiones.filter((s) => s.status === 'pairing').length,
            // Sesiones guardadas: carpetas que conservan credenciales y pueden
            // reconectarse sin volver a vincular el número.
            sessionsSaved: sesiones.filter((s) => s.hasCreds).length,
            premiumActive, premiumSaved,
            ...estadisticasGlobales(),
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
      if (email.length > 254) {
        throw new HttpError(400, 'El correo es demasiado largo.', 'invalid_email')
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
      const correo = await enviarCodigoCorreo(usuario, 'verify', { ip })
      await store.registrarAuditoria({
        userId: usuario.id,
        action: 'auth.register',
        ip,
        meta: { emailSent: correo.sent },
      })
      const verificado = Boolean(usuario.email_verified_at)
      // Con la verificación obligatoria activa la cuenta NO entra al panel
      // todavía: primero confirma el código que acaba de recibir
      // (`POST /api/auth/verify`). Así el registro no sirve para saltarse el
      // correo, y sin la opción activa el acceso sigue funcionando como antes.
      if (!verificado && (await requiereCorreoVerificado())) {
        return json(res, 201, {
          user: usuarioPublico(usuario),
          csrf: null,
          pendingVerification: true,
          emailVerified: false,
          ...(await respuestaCorreo(usuario, correo)),
        })
      }
      const { token, csrf } = await crearSesion(req, usuario)
      res.setHeader('Set-Cookie', cookieDeSesion(req, token))
      return json(res, 201, {
        user: usuarioPublico(usuario),
        csrf,
        emailVerified: verificado,
        ...(await respuestaCorreo(usuario, correo)),
      })
    }

    // ── Verificación del correo tras el registro (sin sesión) ──────────────
    // El código llega por correo; al confirmarlo se abre la sesión, así el
    // usuario no tiene que volver a escribir su contraseña.
    if (pathname === '/api/auth/verify' && metodo === 'POST') {
      verificarOrigen(req)
      limitar(req, 'auth-verify', 20, 15 * 60 * 1000)
      const body = await leerJson(req)
      const email = String(body.email || '').trim().toLowerCase()
      const codigo = String(body.code || '').replace(/\D/g, '')
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new HttpError(400, 'Escribe el correo con el que te registraste.', 'invalid_email')
      }
      if (!/^\d{6}$/.test(codigo)) {
        throw new HttpError(400, 'El código debe tener 6 dígitos.', 'invalid_code')
      }
      limitar(req, `auth-verify:${email.slice(0, 120)}`, 15, 15 * 60 * 1000)
      const usuario = await store.buscarUsuarioPorEmail(email)
      if (!usuario || usuario.status !== 'active') {
        throw new HttpError(400, 'El código no es válido o caducó. Pide uno nuevo.', 'invalid_code')
      }
      if (!usuario.email_verified_at) {
        const tokenCorreo = await validarCodigoCorreo(usuario, 'verify', codigo)
        if (!(await store.verificarEmailActual(usuario.id, tokenCorreo.email))) {
          throw new HttpError(409, 'El correo de la cuenta cambió. Pide un código nuevo.', 'email_changed')
        }
        await store.registrarAuditoria({ userId: usuario.id, action: 'auth.email_verified', ip })
      }
      const { token, csrf } = await crearSesion(req, usuario)
      await store.registrarLogin(usuario.id, ip)
      await store.registrarAuditoria({ userId: usuario.id, action: 'auth.login', ip })
      res.setHeader('Set-Cookie', cookieDeSesion(req, token))
      const actualizado = await store.buscarUsuarioPorId(usuario.id)
      return json(res, 200, { ok: true, user: usuarioPublico(actualizado || usuario), csrf, emailVerified: true })
    }

    // Reenviar el código de verificación a una cuenta que aún no lo confirmó.
    if (pathname === '/api/auth/verify/send' && metodo === 'POST') {
      verificarOrigen(req)
      limitar(req, 'auth-verify-send', 12, 15 * 60 * 1000)
      const body = await leerJson(req)
      const email = String(body.email || '').trim().toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new HttpError(400, 'Escribe el correo con el que te registraste.', 'invalid_email')
      }
      limitar(req, `auth-verify-send:${email.slice(0, 120)}`, 3, 15 * 60 * 1000)
      let resultado = { sent: false, reason: 'not_found' }
      const usuario = await store.buscarUsuarioPorEmail(email)
      if (usuario && usuario.status === 'active' && !usuario.email_verified_at) {
        resultado = await enviarCodigoCorreo(usuario, 'verify', { ip })
      }
      return json(res, 200, {
        ok: true,
        // Respuesta siempre genérica: no revela si el correo existe.
        mailConfigured: await mailConfigurado(),
        emailSent: resultado.sent === true,
        emailReason: resultado.sent === true ? null : resultado.reason,
      })
    }

    // ── Login verificado ──────────────────────────────────────────────────────────
    // (el login solo acepta cuentas con correo verificado cuando el panel lo exige)
    if (pathname === '/api/auth/login' && metodo === 'POST') {
      verificarOrigen(req)
      const globalLimit = await store.obtenerAjusteNumericoOpcional('max_login_attempts_global') ?? config.maxLoginAttemptsGlobal
      const perUserLimit = await store.obtenerAjusteNumericoOpcional('max_login_attempts_per_user') ?? config.maxLoginAttemptsPerUser
      const loginGlobalCooldownMs = await store.obtenerAjusteNumericoOpcional('login_cooldown_ms') ?? config.loginCooldownMs
      limitar(req, 'login', globalLimit, loginGlobalCooldownMs)
      const body = await leerJson(req)
      await verificarTurnstile(req, body)
      const identificador = String(body.username || '').trim()
      const password = String(body.password || '')
      if (!identificador || !password) {
        throw new HttpError(400, 'Usuario y contraseña son obligatorios.', 'missing_credentials')
      }
      const usuarioCooldownMs = await store.obtenerAjusteNumericoOpcional('login_cooldown_ms') ?? config.loginCooldownMs
      limitar(req, `login-usuario:${identificador.toLowerCase().slice(0, 120)}`, perUserLimit, usuarioCooldownMs)

      const usuario = (await store.buscarUsuarioPorNombre(identificador)) ||
        (await store.buscarUsuarioPorEmail(identificador))
      if (!usuario || !(await verifyPassword(password, usuario.password_hash))) {
        throw new HttpError(401, 'Usuario o contraseña incorrectos.', 'invalid_credentials')
      }
      if (usuario.status !== 'active') {
        throw new HttpError(403, 'Esta cuenta está bloqueada.', 'banned')
      }
      // La verificación obligatoria se activa en Ajustes → Correo. Si está
      // apagada, un correo sin verificar no debe bloquear el acceso. El
      // administrador principal queda exento: su acceso sale del entorno
      // (PAIN_WEB_ADMIN_PASS) y no puede quedar fuera si el correo falla,
      // porque es quien puede arreglar el SMTP o desactivar la exigencia.
      if (
        !usuario.email_verified_at &&
        Number(usuario.is_principal) !== 1 &&
        (await requiereCorreoVerificado())
      ) {
        throw new HttpError(
          403,
          'Tu correo aún no está verificado. Revisa el código que te enviamos o pide uno nuevo desde el acceso.',
          'email_not_verified'
        )
      }

      const { token, csrf } = await crearSesion(req, usuario)
      await store.registrarLogin(usuario.id, ip)
      await store.registrarAuditoria({ userId: usuario.id, action: 'auth.login', ip })
      res.setHeader('Set-Cookie', cookieDeSesion(req, token))
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
      limitar(req, `forgot-email:${email.toLowerCase().slice(0, 120)}`, 3, 15 * 60 * 1000)
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
        await sqlRun(store,'DELETE FROM panel_push_devices WHERE user_id=? AND session_hash=?',[sesion.id,sesion.token_hash])
        await store.eliminarSesionWeb(sesion.token_hash)
        await store.registrarAuditoria({ userId: sesion.id, action: 'auth.logout', ip })
      }
      res.setHeader('Set-Cookie', cookieDeSesion(req, '', 0))
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
        throw new HttpError(400, 'No estás entrando como ninguna cuenta.', 'not_impersonating')
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
      res.setHeader('Set-Cookie', cookieDeSesion(req, token))
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
      res.setHeader('Set-Cookie', cookieDeSesion(req, token))
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
      if (email.length > 254) {
        throw new HttpError(400, 'El correo es demasiado largo.', 'invalid_email')
      }
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

    if ((pathname === '/api/account/avatar' || /^\/api\/account\/avatar\/\d+$/.test(pathname)) && ['GET', 'POST', 'DELETE'].includes(metodo)) {
      const sesion = await requerirUsuario(req)
      const avatarId = pathname === '/api/account/avatar' ? sesion.id : Number(pathname.split('/').pop())
      const perfil = await store.buscarUsuarioPorId(avatarId)
      const profileDir = path.join(config.dataDir, 'profile-images')
      if (metodo === 'GET') {
        if (!perfil?.profile_image_file || !perfil.profile_image_mime) throw new HttpError(404, 'No hay foto de perfil.', 'not_found')
        const archivo = path.resolve(profileDir, path.basename(perfil.profile_image_file))
        try {
          const contenido = await fs.promises.readFile(archivo)
          res.writeHead(200, { 'Content-Type': perfil.profile_image_mime, 'Content-Length': contenido.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
          return res.end(contenido)
        } catch { throw new HttpError(404, 'No hay foto de perfil.', 'not_found') }
      }
      if (avatarId !== Number(sesion.id)) throw new HttpError(405, 'No puedes modificar la foto de otra cuenta.', 'method_not_allowed')
      requerirCsrf(req, sesion)
      verificarOrigen(req)
      if (!sesion.email_verified_at) throw new HttpError(403, 'Verifica tu correo antes de cambiar tu foto.', 'email_unverified')
      const anterior = perfil?.profile_image_file
      if (metodo === 'DELETE') {
        await store.actualizarFotoPerfil(sesion.id, null, null)
        if (anterior) await fs.promises.unlink(path.join(profileDir, path.basename(anterior))).catch(() => {})
        return json(res, 200, { ok: true, user: usuarioPublico(await store.buscarUsuarioPorId(sesion.id)) })
      }
      let imagen
      try { imagen = leerImagenPerfil((await leerJson(req, 14 * 1024 * 1024)).image) } catch (error) {
        throw new HttpError(400, error.message || 'Foto no válida.', 'invalid_profile_image')
      }
      fs.mkdirSync(profileDir, { recursive: true })
      const archivo = `${sesion.id}-${crypto.randomBytes(10).toString('hex')}.${imagen.extension}`
      await fs.promises.writeFile(path.join(profileDir, archivo), imagen.buffer, { flag: 'wx', mode: 0o600 })
      await store.actualizarFotoPerfil(sesion.id, archivo, imagen.mime)
      if (anterior) await fs.promises.unlink(path.join(profileDir, path.basename(anterior))).catch(() => {})
      await store.registrarAuditoria({ userId: sesion.id, action: 'account.profile_image_update', ip })
      return json(res, 200, { ok: true, user: usuarioPublico(await store.buscarUsuarioPorId(sesion.id)) })
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

    if (pathname === '/api/account/push' && metodo === 'GET') {
      const sesion = await requerirUsuario(req)
      const id = url.searchParams.get('deviceId')
      try {
        return json(res, 200, { ...(await pushDeviceState(store,sesion.id,id)),
          settings: await pushSettings(store), publicKey: (await push.keys()).publicKey })
      } catch (error) { throw new HttpError(400,error.message,'invalid_push') }
    }
    if (pathname === '/api/account/push' && metodo === 'POST') {
      const sesion = await requerirUsuario(req)
      requerirCsrf(req,sesion)
      verificarOrigen(req)
      limitar(req,`push-sync:${sesion.id}`,120,60*1000)
      const body = await leerJson(req)
      try {
        const result=await syncPushDevice(store,sesion.id,body)
        await sqlRun(store,'UPDATE panel_push_devices SET session_hash=? WHERE user_id=? AND device_id=?',[sesion.token_hash,sesion.id,deviceId(body.deviceId)])
        return json(res,200,result)
      }
      catch (error) { throw new HttpError(400,error.message,'invalid_push') }
    }
    if (pathname === '/api/account/push/dismiss' && metodo === 'POST') {
      const sesion = await requerirUsuario(req)
      requerirCsrf(req,sesion)
      verificarOrigen(req)
      limitar(req,`push-dismiss:${sesion.id}`,30,60*1000)
      const body = await leerJson(req)
      let id
      try { id=deviceId(body.deviceId) } catch (error) { throw new HttpError(400,error.message,'invalid_push') }
      if(!(await pushDeviceState(store,sesion.id,id)).checkedAt){
        try{await syncPushDevice(store,sesion.id,{deviceId:id,permission:'default'})}catch(error){throw new HttpError(400,error.message,'invalid_push')}
      }
      const settings = await pushSettings(store)
      await sqlRun(store,'UPDATE panel_push_devices SET prompt_after=? WHERE user_id=? AND device_id=?',[Date.now()+settings.promptMinutes*60000,sesion.id,id])
      return json(res,200,{ok:true})
    }
    if (pathname === '/api/account/push' && metodo === 'DELETE') {
      const sesion = await requerirUsuario(req)
      requerirCsrf(req,sesion)
      verificarOrigen(req)
      const body = await leerJson(req)
      let id
      try { id=deviceId(body.deviceId) } catch (error) { throw new HttpError(400,error.message,'invalid_push') }
      await sqlRun(store,'DELETE FROM panel_push_devices WHERE user_id=? AND device_id=?',[sesion.id,id])
      return json(res,200,{ok:true})
    }

    return SIN_RUTA
  }
}
