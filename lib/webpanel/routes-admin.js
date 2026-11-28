/* Pain Panel — rutas admin: comunidades */
import { SIN_RUTA } from './http.js'

export function crearRutasAdminGestion(ctx) {
  const {
    HttpError, json, leerJson, puede, requerirAdmin, requerirCsrf, requerirPermiso, requerirUsuario, store, verificarOrigen,
  } = ctx

  return async function rutasAdminGestion({ req, res, url, pathname, seg, metodo, ip }) {
    // ── Administración ────────────────────────────────────────────────────
    if (seg[0] === 'api' && seg[1] === 'admin') {
      const sesion = await requerirUsuario(req)
      requerirAdmin(sesion)
      res.hideUserIps = !puede(sesion, 'admin.users.ip')
      if (!['GET', 'HEAD', 'OPTIONS'].includes(metodo)) {
        requerirCsrf(req, sesion)
        verificarOrigen(req)
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

      // ── Servidores (carriles) ────────────────────────────────────────────
      if (seg[2] === 'server-info' && metodo === 'GET') {
        const { informacionServidor } = await import('./server-info.js')
        return json(res, 200, { server: informacionServidor({ forzar: url.searchParams.has('refresh') }) })
      }

      if (seg[2] === 'servers' && metodo === 'GET') {
        requerirPermiso(sesion, 'admin.servers')
        const servidores = await store.listarServidores()
        return json(res, 200, { servers: servidores })
      }

      if (seg[2] === 'servers' && !seg[3] && metodo === 'POST') {
        requerirPermiso(sesion, 'admin.servers.edit')
        const body = await leerJson(req)
        const name = String(body.name || '').trim()
        if (name.length < 2 || name.length > 60) {
          throw new HttpError(400, 'El nombre debe tener entre 2 y 60 caracteres.', 'invalid_name')
        }
        const tier = ['free', 'premium', 'vip'].includes(body.tier) ? body.tier : 'free'
        const lanes = Math.min(Math.max(Number(body.lanes) || 3, 1), 16)
        const maxSessions = Math.min(Math.max(Number(body.maxSessions) || 30, 1), 200)
        const heapMb = Math.min(Math.max(Number(body.heapMb) || 1024, 256), 8192)
        const dbMode = body.dbMode === 'isolated' ? 'isolated' : 'shared'
        const description = String(body.description || '').trim().slice(0, 300) || null
        const servidor = await store.crearServidor({
          name, description, tier, lanes, maxSessions, heapMb, dbMode, createdBy: sesion.id,
        })
        await store.registrarAuditoria({
          userId: sesion.id,
          action: 'admin.server_create',
          ip,
          meta: { name, tier, lanes },
        })
        // Sincronizar con archivo JSON para el supervisor
        await sincronizarServidoresJson(store)
        return json(res, 201, { server: servidor })
      }

      if (seg[2] === 'servers' && seg[3] && metodo === 'PATCH') {
        requerirPermiso(sesion, 'admin.servers.edit')
        const id = Number(seg[3])
        const existente = await store.obtenerServidor(id)
        if (!existente) throw new HttpError(404, 'Servidor no encontrado.', 'not_found')
        const body = await leerJson(req)
        const cambios = {}
        if (body.name !== undefined) {
          const name = String(body.name || '').trim()
          if (name.length < 2 || name.length > 60) {
            throw new HttpError(400, 'El nombre debe tener entre 2 y 60 caracteres.', 'invalid_name')
          }
          cambios.name = name
        }
        if (body.description !== undefined) {
          cambios.description = String(body.description || '').trim().slice(0, 300) || null
        }
        if (body.tier !== undefined && ['free', 'premium', 'vip'].includes(body.tier)) cambios.tier = body.tier
        if (body.lanes !== undefined) cambios.lanes = Math.min(Math.max(Number(body.lanes) || 3, 1), 16)
        if (body.maxSessions !== undefined) cambios.maxSessions = Math.min(Math.max(Number(body.maxSessions) || 30, 1), 200)
        if (body.heapMb !== undefined) cambios.heapMb = Math.min(Math.max(Number(body.heapMb) || 512, 256), 8192)
        if (body.dbMode !== undefined) cambios.dbMode = body.dbMode === 'isolated' ? 'isolated' : 'shared'
        if (body.status !== undefined) cambios.status = body.status === 'active' ? 'active' : 'inactive'
        await store.actualizarServidor(id, cambios)
        await store.registrarAuditoria({
          userId: sesion.id,
          action: 'admin.server_update',
          ip,
          meta: { id, campos: Object.keys(cambios) },
        })
        await sincronizarServidoresJson(store)
        return json(res, 200, { ok: true, server: await store.obtenerServidor(id) })
      }

      if (seg[2] === 'servers' && seg[3] && metodo === 'DELETE') {
        requerirPermiso(sesion, 'admin.servers.edit')
        const id = Number(seg[3])
        const existente = await store.obtenerServidor(id)
        if (!existente) throw new HttpError(404, 'Servidor no encontrado.', 'not_found')
        await store.eliminarServidor(id)
        await store.registrarAuditoria({
          userId: sesion.id,
          action: 'admin.server_delete',
          ip,
          meta: { id, name: existente.name },
        })
        await sincronizarServidoresJson(store)
        return json(res, 200, { ok: true })
      }

      // Estado de los carriles (procesos) que reportan al panel.
      if (seg[2] === 'lanes' && metodo === 'GET') {
        requerirPermiso(sesion, 'admin.servers')
        const { readSubbotWorkerStatuses } = await import('../subbot-status.js')
        const carriles = readSubbotWorkerStatuses(process.cwd(), { maxAgeMs: 120_000 })
        return json(res, 200, {
          lanes: carriles.map((carril) => ({
            workerId: carril.workerId,
            pid: carril.pid,
            updatedAt: carril.updatedAt,
            sessions: carril.sessions.length,
            connected: carril.sessions.filter((s) => s.connected).length,
            memoria: carril.memoria || null,
            metricas: carril.metricas || null,
            recursos: carril.recursos || null,
          })),
        })
      }

      // Exportar la DB aislada de un servidor (base64).
      if (seg[2] === 'servers' && seg[3] && seg[4] === 'export' && metodo === 'GET') {
        requerirPermiso(sesion, 'admin.servers.edit')
        const id = Number(seg[3])
        const servidor = await store.obtenerServidor(id)
        if (!servidor) throw new HttpError(404, 'Servidor no encontrado.', 'not_found')
        if (servidor.db_mode !== 'isolated') {
          throw new HttpError(409, 'Ese servidor usa la DB compartida; exporta la DB global desde Copias.', 'shared_db')
        }
        const ruta = await rutaDbServidor(id)
        if (!ruta) throw new HttpError(404, 'El servidor todavía no tiene una DB aislada.', 'no_db')
        const fs = await import('node:fs')
        const data = fs.readFileSync(ruta)
        await store.registrarAuditoria({ userId: sesion.id, action: 'admin.server_export', ip, meta: { id, bytes: data.length } })
        return json(res, 200, {
          filename: `pain-server-${servidor.name}-${Date.now()}.sqlite`,
          bytes: data.length,
          data: data.toString('base64'),
        })
      }

      // Importar una DB aislada (base64). Reinicia los carriles del servidor.
      if (seg[2] === 'servers' && seg[3] && seg[4] === 'import' && metodo === 'POST') {
        requerirPermiso(sesion, 'admin.servers.edit')
        const id = Number(seg[3])
        const servidor = await store.obtenerServidor(id)
        if (!servidor) throw new HttpError(404, 'Servidor no encontrado.', 'not_found')
        if (servidor.db_mode !== 'isolated') {
          throw new HttpError(409, 'Ese servidor usa la DB compartida; restaura la DB global desde Copias.', 'shared_db')
        }
        const body = await leerJson(req)
        const base64 = String(body.data || '')
        if (!base64 || base64.length < 16) throw new HttpError(400, 'Archivo de DB inválido.', 'invalid_db')
        const buffer = Buffer.from(base64, 'base64')
        if (buffer.length < 1024) throw new HttpError(400, 'El archivo es demasiado pequeño para ser una DB.', 'invalid_db')
        const ruta = await rutaDbServidor(id, { crear: true })
        const fs = await import('node:fs')
        const pathMod = await import('node:path')
        fs.mkdirSync(pathMod.dirname(ruta), { recursive: true })
        const temporal = `${ruta}.import-${Date.now()}`
        fs.writeFileSync(temporal, buffer)
        try {
          // WAL y SHM viejos no deben sobrevivir a la importación.
          for (const sufijo of ['-wal', '-shm']) {
            try { fs.unlinkSync(`${ruta}${sufijo}`) } catch {}
          }
          fs.renameSync(temporal, ruta)
        } catch (error) {
          try { fs.unlinkSync(temporal) } catch {}
          throw error
        }
        try {
          if (typeof process.send === 'function') process.send({ type: 'restart-server', serverId: id })
        } catch {}
        await store.registrarAuditoria({ userId: sesion.id, action: 'admin.server_import', ip, meta: { id, bytes: buffer.length } })
        return json(res, 200, { ok: true, bytes: buffer.length })
      }

      if (seg[2] === 'servers' && seg[3] && seg[4] === 'toggle' && metodo === 'POST') {
        requerirPermiso(sesion, 'admin.servers.edit')
        const id = Number(seg[3])
        const existente = await store.obtenerServidor(id)
        if (!existente) throw new HttpError(404, 'Servidor no encontrado.', 'not_found')
        const nuevoEstado = existente.status === 'active' ? 'inactive' : 'active'
        await store.cambiarEstadoServidor(id, nuevoEstado)
        await store.registrarAuditoria({
          userId: sesion.id,
          action: 'admin.server_toggle',
          ip,
          meta: { id, name: existente.name, status: nuevoEstado },
        })
        await sincronizarServidoresJson(store)
        return json(res, 200, { ok: true, status: nuevoEstado })
      }
    }
    return SIN_RUTA
  }
}

// Devuelve la ruta de la DB aislada de un servidor (primer carril encontrado).
async function rutaDbServidor(serverId, { crear = false } = {}) {
  const fs = await import('node:fs')
  const pathMod = await import('node:path')
  const base = pathMod.join(process.cwd(), 'storage', 'databases')
  const prefijo = `worker-server-${serverId}-lane-`
  try {
    const dirs = fs.readdirSync(base).filter((d) => d.startsWith(prefijo))
    for (const dir of dirs) {
      const file = pathMod.join(base, dir, 'database.sqlite')
      if (fs.existsSync(file)) return file
    }
  } catch {}
  if (crear) return pathMod.join(base, `${prefijo}0`, 'database.sqlite')
  return null
}

// Sincroniza los servidores de la DB al archivo JSON que lee el supervisor.
// Así los cambios del panel tienen efecto al reiniciar los workers.
async function sincronizarServidoresJson(store) {
  try {
    const servidores = await store.listarServidores()
    const fs = await import('node:fs')
    const path = await import('node:path')
    const dir = path.join(process.cwd(), 'storage')
    fs.mkdirSync(dir, { recursive: true })
    // Incluye qué sub-bots pertenecen a cada servidor para que el supervisor
    // sepa qué sesiones abrir en cada carril.
    const conBots = []
    for (const servidor of servidores) {
      let bots = []
      try {
        const filas = await store.listarBotsPorServidor(servidor.id)
        bots = filas.map((fila) => fila.folder || fila.phone)
      } catch {}
      conBots.push({
        id: servidor.id,
        name: servidor.name,
        tier: servidor.tier,
        lanes: servidor.lanes,
        maxSessions: servidor.max_sessions,
        heapMb: servidor.heap_mb,
        dbMode: servidor.db_mode,
        status: servidor.status,
        bots,
      })
    }
    fs.writeFileSync(
      path.join(dir, 'servers.json'),
      JSON.stringify(conBots, null, 2),
      'utf8'
    )
    // Pedir al supervisor que recalcule el reparto sin tumbar el principal.
    try {
      if (typeof process.send === 'function') process.send({ type: 'reload-servers' })
    } catch {}
  } catch (error) {
    console.error('[servers] No se pudo sincronizar servers.json:', error?.message || error)
  }
}
