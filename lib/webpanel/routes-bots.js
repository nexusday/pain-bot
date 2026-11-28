/* Pain Panel — rutas de sub-bots y bot principal */
import { MIME, SIN_RUTA } from './http.js'
import { desvincularPrincipal, estadoPrincipal, programarReinicioPrincipal, relinkPrincipal, solicitarCodigoPrincipal } from './main-bot.js'
import { construirPreviewMenu } from './menu-preview.js'
import { leerAjustesPremium, premiumPublico } from './premium.js'
import { carpetaSesionValida, eliminarSesion, normalizarTelefono, reconectarSesion } from './session-ops.js'
import { configPublicaSubBot, guardarConfigSubBot, guardarImagenSubBot, leerConfigSubBot, rutaImagenSubBot, sanearCambiosConfig } from './subbot-config.js'
import fs from 'node:fs'
import path from 'node:path'
import { agregarStaff, construirEntradaStaff, listarStaff, quitarStaffPorIds } from '../staff.js'

function lidGuardado(root, phone, numero) {
  const limpio = String(numero || '').replace(/\D/g, '')
  if (!limpio) return ''
  const carpeta = path.join(root, global.bot || 'Serbot', String(phone))
  try {
    const directo = JSON.parse(fs.readFileSync(path.join(carpeta, `lid-mapping-${limpio}.json`), 'utf8'))
    if (/^\d+$/.test(String(directo))) return String(directo)
  } catch {}
  try {
    for (const nombre of fs.readdirSync(carpeta)) {
      if (!nombre.startsWith('lid-mapping-') || !nombre.endsWith('_reverse.json')) continue
      const valor = JSON.parse(fs.readFileSync(path.join(carpeta, nombre), 'utf8'))
      if (String(valor).replace(/\D/g, '') !== limpio) continue
      const lid = nombre.slice('lid-mapping-'.length, -'_reverse.json'.length)
      if (/^\d+$/.test(lid)) return lid
    }
  } catch {}
  return ''
}

function ownersPublicos(owners, root, phone) {
  return owners.map((owner) => {
    const numero = owner.numbers?.[0] || ''
    const lid = lidGuardado(root, phone, numero)
    return lid ? { ...owner, lids: [lid] } : owner
  })
}

export function crearRutasBots(ctx) {
  const {
    HttpError, config, esPrincipal, getAntiPv, json, leerJson, limitar, main, pairing, puede, requerirCsrf, requerirPermiso, requerirUsuario, requiereCorreoVerificado, sesionesDelPanel, sessions, setAntiPv, store, verificarOrigen,
  } = ctx

  return async function rutasBots({ req, res, url, pathname, seg, metodo, ip }) {
    // ── Bots del usuario ──────────────────────────────────────────────────
    if (pathname === '/api/bots' && metodo === 'GET') {
      const sesion = await requerirUsuario(req)
      requerirPermiso(sesion, 'bots.view')
      const filas = await store.listarBotsUsuario(sesion.id)
      const sesiones = sesionesDelPanel()
      const mapa = new Map(sesiones.map((s) => [s.folder, s]))
      const ajustesPremium = await leerAjustesPremium(store)
      const bots = filas.map((fila) => {
        const viva = mapa.get(fila.folder)
        const premium = premiumPublico(config.root, fila.phone, ajustesPremium)
        return {
          phone: fila.phone,
          label: fila.label,
          premium: { active: premium.active, remainingMs: premium.remainingMs },
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
      const limitePersonal = await store.obtenerMaxSubsUsuario(sesion.id)
      const maxPorUsuario = limitePersonal === null
        ? await store.obtenerAjusteNumerico('max_subs_per_user', 0)
        : Math.max(0, limitePersonal)
      return json(res, 200, {
        bots,
        limit: {
          max: maxPorUsuario,
          used: bots.length,
          unlimited: maxPorUsuario <= 0,
          remaining: maxPorUsuario > 0 ? Math.max(0, maxPorUsuario - bots.length) : null,
          source: limitePersonal === null ? 'global' : 'account',
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
      const connStaff = { user: { jid: `${phone}@s.whatsapp.net` } }

      if (seg.length === 5 && seg[3] === 'config' && seg[4] === 'owners') {
        if (metodo === 'GET') return json(res, 200, { owners: ownersPublicos(listarStaff(connStaff), config.root, phone) })
        const body = await leerJson(req)
        const numero = String(body.number || body.phone || '').replace(/\D/g, '')
        if (numero.length < 8 || numero.length > 15) {
          throw new HttpError(400, 'Indica un número válido de 8 a 15 dígitos.', 'invalid_owner_number')
        }
        if (metodo === 'POST') {
          const lidIntroducido = String(body.lid || '').replace(/\D/g, '')
          if (lidIntroducido && (lidIntroducido.length < 8 || lidIntroducido.length > 18)) {
            throw new HttpError(400, 'El LID debe contener entre 8 y 18 dígitos.', 'invalid_owner_lid')
          }
          const entrada = construirEntradaStaff({
            name: String(body.name || numero).trim().slice(0, 40),
            numbers: [numero],
            // Igual que /mod: conserva el número y sus identificadores PN/LID.
            lids: [lidIntroducido || lidGuardado(config.root, phone, numero) || numero],
            addedBy: String(sesion.id),
          })
          const resultado = agregarStaff(entrada, connStaff)
          return json(res, 200, { ok: true, owner: resultado.entrada, owners: ownersPublicos(listarStaff(connStaff), config.root, phone) })
        }
        if (metodo === 'DELETE') {
          const ids = construirEntradaStaff({ numbers: [numero], lids: [numero] }).ids
          const eliminado = quitarStaffPorIds(ids, connStaff)
          if (!eliminado) throw new HttpError(404, 'Ese owner no está agregado.', 'owner_not_found')
          return json(res, 200, { ok: true, owners: ownersPublicos(listarStaff(connStaff), config.root, phone) })
        }
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
        const premium = premiumPublico(config.root, phone, await leerAjustesPremium(store))
        const preview = construirPreviewMenu({
          phone,
          config: configuracion,
          esPropietario,
          premiumTextos: premium.active ? premium.edits.menu : null,
          premiumCanal: premium.active ? premium.edits.canal : undefined,
          premiumComandosOcultos: premium.active ? premium.edits.comandosOcultos : [],
        })
        return json(res, 200, {
          phone,
          config: {
            ...configPublicaSubBot(configuracion),
            antiPv: await getAntiPv(phone),
          },
          owners: ownersPublicos(listarStaff(connStaff), config.root, phone),
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
        const premium = premiumPublico(config.root, phone, await leerAjustesPremium(store))
        const preview = construirPreviewMenu({
          phone,
          config: guardado,
          esPropietario,
          premiumTextos: premium.active ? premium.edits.menu : null,
          premiumCanal: premium.active ? premium.edits.canal : undefined,
          premiumComandosOcultos: premium.active ? premium.edits.comandosOcultos : [],
        })
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

      // ── Cambiar el servidor (carril) de un sub-bot ──────────────────────
      if (seg.length === 4 && seg[3] === 'server' && metodo === 'POST') {
        const body = await leerJson(req)
        const serverId = body.serverId === null || body.serverId === undefined
          ? null
          : Number(body.serverId)
        if (serverId !== null && (!Number.isInteger(serverId) || serverId <= 0)) {
          throw new HttpError(400, 'Servidor inválido.', 'invalid_server')
        }
        // Cambiar de servidor es una función premium. El dueño puede hacerlo
        // si su plan está activo; los administradores siempre.
        if (!puede(sesion, 'admin.servers.edit')) {
          const { estadoPremium, leerAjustesPremium } = await import('./premium.js')
          const ajustes = await leerAjustesPremium(store)
          const estado = estadoPremium(config.root, phone, ajustes)
          if (!estado.activo) {
            throw new HttpError(
              403,
              'Necesitas premium activo para cambiar de servidor. Mira un anuncio en la sección Premium.',
              'premium_required'
            )
          }
        }
        if (serverId !== null) {
          const servidor = await store.obtenerServidor(serverId)
          if (!servidor) throw new HttpError(404, 'Servidor no encontrado.', 'not_found')
          if (servidor.status !== 'active') {
            throw new HttpError(409, 'Ese servidor está desactivado.', 'server_inactive')
          }
        }
        await store.cambiarServidorBot(phone, serverId)
        // Reasignación en caliente: el panel corre dentro del carril primario,
        // que es hijo del supervisor. Le pedimos que mueva la sesión al carril
        // del servidor elegido sin reiniciar todo.
        let reasignado = false
        try {
          if (typeof sessions?.reasignarSesion === 'function') {
            const resultado = await sessions.reasignarSesion(config.root, phone, serverId)
            reasignado = Boolean(resultado?.ok)
          } else if (typeof process.send === 'function') {
            // Compatibilidad con el panel en proceso (sin worker aislado).
            process.send({ type: 'reassign-bot', phone, serverId })
            reasignado = true
          }
        } catch (error) {
          console.error('[webpanel] No se pudo reasignar el bot en caliente:', error?.message || error)
        }
        await store.registrarAuditoria({
          userId: sesion.id,
          action: 'bot.server_change',
          ip,
          meta: { phone, serverId, reasignado },
        })
        return json(res, 200, { ok: true, serverId, hot: reasignado })
      }
    }

    if (pathname === '/api/bots/link' && metodo === 'POST') {
      const sesion = await requerirUsuario(req)
      res.hideUserIps = !puede(sesion,'admin.users.ip')
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
      const serverId = body.serverId !== undefined && body.serverId !== null
        ? Number(body.serverId)
        : null
      const resultado = await pairing.iniciar({
        userId: sesion.id,
        phone: body.phone,
        ip,
        userAgent: String(req.headers?.['user-agent'] || '').slice(0, 200),
        force: body.force === true,
        unlimitedSlots: puede(sesion, 'admin.users.unlimited_slots'),
        serverId: Number.isInteger(serverId) && serverId > 0 ? serverId : null,
      })
      return json(res, 200, resultado)
    }

    if (seg[0] === 'api' && seg[1] === 'bots' && seg[2] === 'link' && seg[3] && metodo === 'GET' && seg.length === 4) {
      const sesion = await requerirUsuario(req)
      res.hideUserIps = !puede(sesion,'admin.users.ip')
      requerirPermiso(sesion, 'bots.view')
      const pairingEstado = await pairing.estado(seg[3], sesion.id, { admin: puede(sesion, 'admin.pairings') })
      return json(res, 200, { pairing: pairingEstado })
    }

    if (seg[0] === 'api' && seg[1] === 'bots' && seg[2] === 'link' && seg[3] && seg[4] === 'cancel' && metodo === 'POST') {
      const sesion = await requerirUsuario(req)
      res.hideUserIps = !puede(sesion,'admin.users.ip')
      requerirCsrf(req, sesion)
      verificarOrigen(req)
      requerirPermiso(sesion, 'bots.link')
      const pairingEstado = await pairing.cancelar(seg[3], sesion.id, { admin: puede(sesion, 'admin.pairings') })
      return json(res, 200, { pairing: pairingEstado })
    }

    if (seg[0] === 'api' && seg[1] === 'bots' && seg[2] === 'link' && seg[3] && seg[4] === 'regenerate' && metodo === 'POST') {
      const sesion = await requerirUsuario(req)
      res.hideUserIps = !puede(sesion,'admin.users.ip')
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

    return SIN_RUTA
  }
}
