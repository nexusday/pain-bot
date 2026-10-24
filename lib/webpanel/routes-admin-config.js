/* Pain Panel — rutas admin: copias, notificaciones, usuarios, roles, ajustes y correo */
import { SIN_RUTA } from './http.js'
import { hashPassword, verifyPassword } from './auth.js'
import { collectBackup, openBackup, sealBackup, stageBackup } from './backups.js'
import { MAIL_VARIABLES } from './mail-templates.js'
import { cargarPlantillas, configCorreoPublica, correoConfigurado, enviarCorreoPrueba, guardarConfigCorreo, guardarPlantillas, leerConfigCorreo } from './mailer.js'
import { PERMISSIONS, PRINCIPAL_ONLY, esAdminPermisos, normalizarPermisos } from './permissions.js'
import { listPushUsers, pushHistory, pushSettings, queuePush } from './push.js'
import { carpetaSesionValida, contarSesiones, eliminarSesion, estatusWorkers, guardarMaxSubs, leerMaxSubs, listarSesiones, normalizarTelefono, reconectarSesion } from './session-ops.js'
import { actualizarDesdeRemoto, estadoRepo } from './updates.js'

export function crearRutasAdminConfig(ctx) {
  const {
    HttpError, clavesTurnstile, config, cookieDeSesion, crearSesion, esPrincipal, json, leerJson, limitar, mailConfigurado, main, permisosDeUsuario, puede, push, requerirAdmin, requerirConcesionPermisos, requerirControlPermisos, requerirCsrf, requerirPermiso, requerirPrincipal, requerirUsuario, requiereCorreoVerificado, sessions, store, usuarioPublico, verificarOrigen,
  } = ctx

  return async function rutasAdminConfig({ req, res, url, pathname, seg, metodo, ip }) {
    // ── Administración ────────────────────────────────────────────────────
    if (seg[0] === 'api' && seg[1] === 'admin') {
      const sesion = await requerirUsuario(req)
      requerirAdmin(sesion)
      res.hideUserIps = !puede(sesion, 'admin.users.ip')
      if (!['GET', 'HEAD', 'OPTIONS'].includes(metodo)) {
        requerirCsrf(req, sesion)
        verificarOrigen(req)
      }

      // ── Copias de seguridad (solo principal; protegidas por CSRF/origen) ──
      if(seg[2]==='backups' && ['export','import'].includes(seg[3]) && metodo==='POST'){
        requerirPrincipal(sesion)
        limitar(req,`backup:${sesion.id}`,3,60*1000)
        const body=await leerJson(req,seg[3]==='import'?48*1024*1024:64*1024)
        const owner=await store.buscarUsuarioPorId(sesion.id)
        if(!await verifyPassword(String(body.currentPassword||''),owner.password_hash))throw new HttpError(403,'Confirma tu contraseña actual del panel.','invalid_current_password')
        try{
          if(seg[3]==='export'){
            const data=await collectBackup(store,config,body.scope)
            const archive=await sealBackup(data,body.password)
            await store.registrarAuditoria({userId:sesion.id,action:'admin.backup_export',ip,meta:{scope:body.scope}})
            return json(res,200,archive,{'Content-Disposition':`attachment; filename="pain-backup-${new Date().toISOString().slice(0,10)}.painbackup"`})
          }
          if(body.confirm!==true)throw new Error('Confirma que la restauración reemplazará los datos actuales.')
          const data=await openBackup(body.archive,body.password)
          const staged=await stageBackup(config,data)
          await store.registrarAuditoria({userId:sesion.id,action:'admin.backup_stage',ip,meta:{id:staged.id}})
          return json(res,200,{ok:true,...staged})
        }catch(error){throw new HttpError(400,error.message,'invalid_backup')}
      }
      // ── Notificaciones push ───────────────────────────────────────────────
      if (seg[2] === 'notifications' && metodo === 'GET') {
        requerirPermiso(sesion,'admin.notifications')
        return json(res,200,{users:await listPushUsers(store,String(url.searchParams.get('q')||'').slice(0,100),Math.max(0,Number(url.searchParams.get('offset'))||0)),
          settings:await pushSettings(store),history:await pushHistory(store),canSettings:puede(sesion,'admin.notifications.settings')})
      }
      if (seg[2] === 'notifications' && metodo === 'POST') {
        requerirPermiso(sesion,'admin.notifications')
        limitar(req,`push-send:${sesion.id}`,5,60*1000)
        const body=await leerJson(req)
        let job
        try { job=await queuePush(store,sesion.id,body) } catch (error) { throw new HttpError(400,error.message,'invalid_push') }
        await store.registrarAuditoria({userId:sesion.id,action:'admin.push_send',ip,meta:{jobId:job.id,users:job.users,devices:job.devices}})
        return json(res,202,{ok:true,...job})
      }
      if (seg[2] === 'notifications' && metodo === 'PATCH') {
        requerirPermiso(sesion,'admin.notifications.settings')
        const body=await leerJson(req)
        const minutes=Number(body.promptMinutes)
        if (!Number.isInteger(minutes)||minutes<5||minutes>43200) throw new HttpError(400,'El intervalo debe ser de 5 minutos a 30 días.','invalid_interval')
        await store.establecerMeta('push_prompt_minutes',minutes)
        await store.establecerMeta('push_prompt_enabled',body.enabled===false?'0':'1')
        return json(res,200,{ok:true,settings:await pushSettings(store)})
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
          users: usuarios.map((user)=>({...usuarioPublico(user),...(puede(sesion,'admin.users.ip')?{lastIp:user.last_ip||null}:{})})),
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
        // Solo se aceptan campos reconocidos: un body con claves ajenas se
        // rechaza en lugar de auditar y responder 200 sin hacer nada.
        const CAMPOS_AJUSTES = [
          'turnstileSiteKey', 'turnstileSecretKey',
          'maxSubs', 'maxSubsPerUser', 'maxBotsPerIp',
          'maxPairAttemptsPerHour', 'maxPairAttemptsPerDay', 'maxPairAttemptsPerIpPerHour',
          'pairCooldownSeconds', 'pairCodeSeconds', 'requireEmailVerification',
        ]
        if (!CAMPOS_AJUSTES.some((campo) => body[campo] !== undefined)) {
          throw new HttpError(400, 'No hay cambios para guardar.', 'empty_update')
        }
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
        requerirConcesionPermisos(sesion, permissions)
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
        if(rol.permissions.includes('admin.users.ip')) requerirPermiso(sesion,'admin.users.ip')
        if (rol.key === 'principal') {
          throw new HttpError(409, 'El rol del administrador principal no se puede modificar.', 'principal_role')
        }
        const body = await leerJson(req)
        if(Array.isArray(body.permissions)&&body.permissions.includes('admin.users.ip')) requerirPermiso(sesion,'admin.users.ip')
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
        if (cambios.permissions) {
          requerirConcesionPermisos(sesion, cambios.permissions)
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
        if(rol.permissions.includes('admin.users.ip')) requerirPermiso(sesion,'admin.users.ip')
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


    }
    return SIN_RUTA
  }
}
