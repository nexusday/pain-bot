/* Pain Panel — nodos remotos (VPS) para servidores VIP */
import { SIN_RUTA } from './http.js'
import fs from 'node:fs'
import path from 'node:path'

async function pedirNodo(nodo, ruta, { method = 'GET', body, timeoutMs = 6000 } = {}) {
  const controlador = new AbortController()
  const temporizador = setTimeout(() => controlador.abort(), timeoutMs)
  try {
    const res = await fetch(`${nodo.url}${ruta}`, {
      method,
      headers: {
        'x-node-token': nodo.token,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controlador.signal,
    })
    const datos = await res.json().catch(() => ({}))
    return { ok: res.ok, status: res.status, datos }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      datos: { error: error?.name === 'AbortError' ? 'timeout' : (error?.message || 'sin conexión') },
    }
  } finally {
    clearTimeout(temporizador)
  }
}

function archivosSesion(root, folder) {
  const dir = path.join(root, global.bot || 'Serbot', folder)
  const archivos = {}
  for (const nombre of ['creds.json', 'config.json', 'auth-keys.json', 'auth-keys.ndjson']) {
    try {
      const ruta = path.join(dir, nombre)
      if (fs.existsSync(ruta)) archivos[nombre] = fs.readFileSync(ruta).toString('base64')
    } catch {}
  }
  return archivos
}

export function crearRutasNodes(ctx) {
  const {
    HttpError, config, json, leerJson, puede, requerirAdmin, requerirCsrf,
    requerirPermiso, requerirUsuario, store, verificarOrigen,
  } = ctx

  return async function rutasNodes({ req, res, url, pathname, seg, metodo, ip }) {
    if (seg[0] !== 'api' || seg[1] !== 'admin' || seg[2] !== 'nodes') return SIN_RUTA

    const sesion = await requerirUsuario(req)
    requerirAdmin(sesion)
    if (!['GET', 'HEAD', 'OPTIONS'].includes(metodo)) {
      requerirCsrf(req, sesion)
      verificarOrigen(req)
    }

    // ── Listar nodos con recursos en vivo ─────────────────────────────────
    if (seg.length === 3 && metodo === 'GET') {
      requerirPermiso(sesion, 'admin.servers')
      const nodos = await store.listarNodos()
      const conSalud = await Promise.all(nodos.map(async (nodo) => {
        const salud = await pedirNodo(nodo, '/health', { timeoutMs: 4000 })
        return {
          id: nodo.id,
          name: nodo.name,
          url: nodo.url,
          enabled: Boolean(nodo.enabled),
          online: salud.ok && salud.datos?.ok === true,
          health: salud.ok ? salud.datos : null,
          error: salud.ok ? null : (salud.datos?.error || 'sin conexión'),
        }
      }))
      return json(res, 200, { nodes: conSalud })
    }

    // ── Crear nodo ────────────────────────────────────────────────────────
    if (seg.length === 3 && metodo === 'POST') {
      requerirPermiso(sesion, 'admin.servers.edit')
      const body = await leerJson(req)
      const name = String(body.name || '').trim()
      const nodeUrl = String(body.url || '').trim().replace(/\/+$/, '')
      const token = String(body.token || '').trim()
      if (name.length < 2 || name.length > 60) {
        throw new HttpError(400, 'El nombre debe tener entre 2 y 60 caracteres.', 'invalid_name')
      }
      if (!/^https?:\/\/.+/i.test(nodeUrl)) {
        throw new HttpError(400, 'La URL del nodo debe empezar por http:// o https://', 'invalid_url')
      }
      if (token.length < 16) {
        throw new HttpError(400, 'El token debe tener al menos 16 caracteres.', 'invalid_token')
      }
      const nodo = await store.crearNodo({ name, url: nodeUrl, token })
      await store.registrarAuditoria({ userId: sesion.id, action: 'admin.node_create', ip, meta: { name, url: nodeUrl } })
      return json(res, 201, { node: { id: nodo.id, name: nodo.name, url: nodo.url, enabled: true } })
    }

    // ── Editar / borrar nodo ──────────────────────────────────────────────
    if (seg.length === 4 && /^\d+$/.test(seg[3]) && (metodo === 'PATCH' || metodo === 'DELETE')) {
      requerirPermiso(sesion, 'admin.servers.edit')
      const id = Number(seg[3])
      const nodo = await store.obtenerNodo(id)
      if (!nodo) throw new HttpError(404, 'Nodo no encontrado.', 'not_found')
      if (metodo === 'DELETE') {
        await store.eliminarNodo(id)
        await store.registrarAuditoria({ userId: sesion.id, action: 'admin.node_delete', ip, meta: { id } })
        return json(res, 200, { ok: true })
      }
      const body = await leerJson(req)
      const cambios = {}
      if (body.name !== undefined) cambios.name = String(body.name || '').trim().slice(0, 60)
      if (body.url !== undefined) cambios.url = String(body.url || '').trim().replace(/\/+$/, '')
      if (body.token !== undefined && String(body.token || '').trim().length >= 16) {
        cambios.token = String(body.token).trim()
      }
      if (body.enabled !== undefined) cambios.enabled = body.enabled === true || body.enabled === 1
      await store.actualizarNodo(id, cambios)
      await store.registrarAuditoria({ userId: sesion.id, action: 'admin.node_update', ip, meta: { id } })
      return json(res, 200, { ok: true })
    }

    // ── Arrancar un servidor en el nodo ───────────────────────────────────
    if (seg.length === 5 && /^\d+$/.test(seg[3]) && seg[4] === 'start' && metodo === 'POST') {
      requerirPermiso(sesion, 'admin.servers.edit')
      const nodo = await store.obtenerNodo(Number(seg[3]))
      if (!nodo || !nodo.enabled) throw new HttpError(404, 'Nodo no disponible.', 'not_found')
      const body = await leerJson(req)
      const servidorId = Number(body.serverId)
      const servidor = await store.obtenerServidor(servidorId)
      if (!servidor) throw new HttpError(404, 'Servidor no encontrado.', 'not_found')
      if (Number(servidor.node_id) !== Number(nodo.id)) {
        throw new HttpError(409, 'Ese servidor no pertenece a este nodo.', 'wrong_node')
      }
      const filas = await store.listarBotsPorServidor(servidorId)
      const sessions = []
      for (const fila of filas) {
        const folder = fila.folder || fila.phone
        if (!/^[a-zA-Z0-9_-]+$/.test(String(folder || ''))) continue
        const archivos = archivosSesion(config.root, folder)
        if (!archivos['creds.json']) continue
        const sincronizado = await pedirNodo(nodo, '/sync-session', {
          method: 'POST',
          body: { folder, files: archivos },
          timeoutMs: 30_000,
        })
        if (!sincronizado.ok) {
          throw new HttpError(502, `No se pudo sincronizar ${folder} con el nodo: ${sincronizado.datos?.error || 'error'}`, 'node_sync_failed')
        }
        sessions.push(folder)
      }
      const arranque = await pedirNodo(nodo, '/start', {
        method: 'POST',
        body: {
          serverName: servidor.name,
          tier: servidor.tier,
          lanes: servidor.lanes,
          heapMb: servidor.heap_mb,
          dbMode: servidor.db_mode,
          sessions,
        },
        timeoutMs: 30_000,
      })
      if (!arranque.ok) {
        throw new HttpError(502, `El nodo no pudo arrancar el servidor: ${arranque.datos?.error || 'error'}`, 'node_start_failed')
      }
      await store.registrarAuditoria({
        userId: sesion.id,
        action: 'admin.node_start',
        ip,
        meta: { nodeId: nodo.id, serverId: servidorId, sessions: sessions.length },
      })
      return json(res, 200, { ok: true, sessions: sessions.length, carriles: arranque.datos?.carriles || [] })
    }

    // ── Parar todos los carriles del nodo ─────────────────────────────────
    if (seg.length === 5 && /^\d+$/.test(seg[3]) && seg[4] === 'stop' && metodo === 'POST') {
      requerirPermiso(sesion, 'admin.servers.edit')
      const nodo = await store.obtenerNodo(Number(seg[3]))
      if (!nodo) throw new HttpError(404, 'Nodo no encontrado.', 'not_found')
      const resultado = await pedirNodo(nodo, '/stop', { method: 'POST', body: {}, timeoutMs: 15_000 })
      await store.registrarAuditoria({ userId: sesion.id, action: 'admin.node_stop', ip, meta: { nodeId: nodo.id } })
      return json(res, 200, { ok: resultado.ok, error: resultado.ok ? null : (resultado.datos?.error || 'error') })
    }

    return SIN_RUTA
  }
}
