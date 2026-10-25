/* Pain Panel — rutas de acceso y cuenta (público + autenticado) */
import { SIN_RUTA } from './http.js'
import { hashPassword, serializeCookie, verifyPassword } from './auth.js'
import { estadoPrincipal } from './main-bot.js'
import { esAdminPermisos } from './permissions.js'
import { leerAjustesPremium } from './premium.js'
import { deviceId, pushDeviceState, pushSettings, sqlRun, syncPushDevice } from './push.js'
import { leerMaxSubs } from './session-ops.js'

// Cache de estadísticas públicas (persistente entre peticiones, a nivel módulo).
let statsCache
let statsExpires = 0
let statsPending

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
            // Sesiones guardadas: carpetas que conservan credenciales y pueden
            // reconectarse sin volver a vincular el número.
            sessionsSaved: sesiones.filter((s) => s.hasCreds).length,
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
      const globalLimit = await store.obtenerAjusteNumericoOpcional('max_login_attempts_global') ?? config.maxLoginAttemptsGlobal
      const perUserLimit = await store.obtenerAjusteNumericoOpcional('max_login_attempts_per_user') ?? config.maxLoginAttemptsPerUser
      const cooldownMs = await store.obtenerAjusteNumericoOpcional('login_cooldown_ms') ?? config.loginCooldownMs
      limitar(req, 'login', globalLimit, cooldownMs)
      const body = await leerJson(req)
      await verificarTurnstile(req, body)
      const identificador = String(body.username || '').trim()
      const password = String(body.password || '')
      if (!identificador || !password) {
        throw new HttpError(400, 'Usuario y contraseña son obligatorios.', 'missing_credentials')
      }
      limitar(req, `login-usuario:${identificador.toLowerCase().slice(0, 120)}`, perUserLimit, cooldownMs)

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
