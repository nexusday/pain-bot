/* Pain Panel — nodos remotos (VPS) estilo Wings */
import { SIN_RUTA } from './http.js'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { enviarComando, estadoNodo, estaEnLinea } from './node-registry.js'

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

function urlInstalador(config, nodo, archivo = 'install.sh') {
  const panel = String(config.publicUrl || '').replace(/\/+$/, '')
  const q = `uuid=${encodeURIComponent(nodo.uuid)}&token=${encodeURIComponent(nodo.token)}`
  return `${panel}/api/node/${archivo}?${q}`
}

function comandoInstalacion(config, nodo) {
  return `curl -fsSL "${urlInstalador(config, nodo)}" | bash`
}

function scriptInstalacion(config, nodo) {
  const panel = String(config.publicUrl || '').replace(/\/+$/, '')
  const uuid = String(nodo.uuid)
  const token = String(nodo.token)
  const q = `uuid=${encodeURIComponent(uuid)}&token=${encodeURIComponent(token)}`
  return `#!/usr/bin/env bash
set -euo pipefail
PANEL="${panel}"
DIR="\${PAIN_NODE_DIR:-$HOME/pain-bot}"
echo "[pain-node] Preparando nodo en $DIR"
mkdir -p "$DIR"
cd "$DIR"
echo "[pain-node] Descargando código desde el panel..."
curl -fsSL "$PANEL/api/node/bundle?${q}" -o bundle.tar.gz
tar xzf bundle.tar.gz
rm -f bundle.tar.gz
if [ ! -d node_modules ]; then
  echo "[pain-node] Instalando dependencias (solo la primera vez)..."
  npm install --omit=dev
fi
chmod +x scripts/node-agent.js 2>/dev/null || true
echo "[pain-node] Conectando al panel..."
export PANEL_URL="$PANEL"
export NODE_UUID="${uuid}"
export NODE_TOKEN="${token}"
exec node scripts/node-agent.js
`
}

export function crearRutasNodes(ctx) {
  const {
    HttpError, config, json, leerJson, requerirAdmin, requerirCsrf,
    requerirPermiso, requerirUsuario, store, verificarOrigen,
  } = ctx

  return async function rutasNodes({ req, res, url, pathname, seg, metodo, ip }) {
    // ── Instalador del nodo (sin sesión de panel: autentica por uuid/token) ──
    if (seg[0] === 'api' && seg[1] === 'node') {
      const uuid = url.searchParams.get('uuid')
      const token = url.searchParams.get('token')
      const nodo = uuid ? await store.obtenerNodoPorUuid(uuid) : null
      if (!nodo || !nodo.enabled || nodo.token !== token) {
        return json(res, 401, { error: 'unauthorized' })
      }
      if ((seg[2] === 'install.sh' || seg[2] === 'start.sh') && metodo === 'GET') {
        const descarga = seg[2] === 'start.sh'
        res.writeHead(200, {
          'content-type': 'text/x-shellscript; charset=utf-8',
          'cache-control': 'no-store',
          ...(descarga ? { 'content-disposition': 'attachment; filename="start.sh"' } : {}),
        })
        return res.end(scriptInstalacion(config, nodo))
      }
      if (seg[2] === 'bundle' && metodo === 'GET') {
        const { spawn } = await import('node:child_process')
        res.writeHead(200, {
          'content-type': 'application/gzip',
          'content-disposition': 'attachment; filename="pain-bot-node.tar.gz"',
          'cache-control': 'no-store',
        })
        const tar = spawn('tar', [
          '-czf', '-',
          '--exclude=node_modules',
          '--exclude=.git',
          '--exclude=storage',
          '--exclude=Serbot',
          '--exclude=tmp',
          '.',
        ], { cwd: process.cwd() })
        tar.stdout.pipe(res)
        tar.stderr.on('data', () => {})
        tar.on('error', () => { try { res.destroy() } catch {} })
        req.on('close', () => { try { tar.kill() } catch {} })
        return undefined
      }
      return json(res, 404, { error: 'not-found' })
    }

    if (seg[0] !== 'api' || seg[1] !== 'admin' || seg[2] !== 'nodes') return SIN_RUTA

    const sesion = await requerirUsuario(req)
    requerirAdmin(sesion)
    if (!['GET', 'HEAD', 'OPTIONS'].includes(metodo)) {
      requerirCsrf(req, sesion)
      verificarOrigen(req)
    }

    // ── Listar nodos con estado en vivo (por WebSocket) ───────────────────
    if (seg.length === 3 && metodo === 'GET') {
      requerirPermiso(sesion, 'admin.servers')
      const nodos = await store.listarNodos()
      return json(res, 200, {
        nodes: nodos.map((nodo) => {
          const estado = estadoNodo(nodo.id)
          return {
            id: nodo.id,
            name: nodo.name,
            description: nodo.description || '',
            uuid: nodo.uuid,
            enabled: Boolean(nodo.enabled),
            online: estado.online && estaEnLinea(nodo.id),
            lastSeen: estado.lastSeen,
            health: estado.hello,
            carriles: estado.carriles,
            command: comandoInstalacion(config, nodo),
            startUrl: urlInstalador(config, nodo, 'start.sh'),
          }
        }),
      })
    }

    // ── Crear nodo: el panel genera UUID y token ──────────────────────────
    if (seg.length === 3 && metodo === 'POST') {
      requerirPermiso(sesion, 'admin.servers.edit')
      const body = await leerJson(req)
      const name = String(body.name || '').trim()
      const description = String(body.description || '').trim().slice(0, 300) || null
      if (name.length < 2 || name.length > 60) {
        throw new HttpError(400, 'El nombre debe tener entre 2 y 60 caracteres.', 'invalid_name')
      }
      const uuid = crypto.randomUUID()
      const token = crypto.randomBytes(24).toString('hex')
      const nodo = await store.crearNodo({
        name,
        description,
        uuid,
        token,
        url: String(config.publicUrl || ''),
      })
      await store.registrarAuditoria({ userId: sesion.id, action: 'admin.node_create', ip, meta: { name, uuid } })
      return json(res, 201, {
        node: {
          id: nodo.id,
          name: nodo.name,
          uuid: nodo.uuid,
          enabled: true,
          command: comandoInstalacion(config, nodo),
          startUrl: urlInstalador(config, nodo, 'start.sh'),
        },
      })
    }

    // ── Editar / borrar ───────────────────────────────────────────────────
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
      if (body.description !== undefined) cambios.description = String(body.description || '').trim().slice(0, 300) || null
      if (body.enabled !== undefined) cambios.enabled = body.enabled === true || body.enabled === 1
      await store.actualizarNodo(id, cambios)
      await store.registrarAuditoria({ userId: sesion.id, action: 'admin.node_update', ip, meta: { id } })
      return json(res, 200, { ok: true })
    }

    // ── Regenerar token (si se filtra) ────────────────────────────────────
    if (seg.length === 5 && /^\d+$/.test(seg[3]) && seg[4] === 'token' && metodo === 'POST') {
      requerirPermiso(sesion, 'admin.servers.edit')
      const nodo = await store.obtenerNodo(Number(seg[3]))
      if (!nodo) throw new HttpError(404, 'Nodo no encontrado.', 'not_found')
      const token = crypto.randomBytes(24).toString('hex')
      await store.actualizarNodo(nodo.id, { token })
      await store.registrarAuditoria({ userId: sesion.id, action: 'admin.node_token', ip, meta: { id: nodo.id } })
      const actualizado = await store.obtenerNodo(nodo.id)
      return json(res, 200, { ok: true, command: comandoInstalacion(config, actualizado) })
    }

    // ── Arrancar un servidor en el nodo (por WebSocket) ───────────────────
    if (seg.length === 5 && /^\d+$/.test(seg[3]) && seg[4] === 'start' && metodo === 'POST') {
      requerirPermiso(sesion, 'admin.servers.edit')
      const nodo = await store.obtenerNodo(Number(seg[3]))
      if (!nodo || !nodo.enabled) throw new HttpError(404, 'Nodo no disponible.', 'not_found')
      if (!estaEnLinea(nodo.id)) {
        throw new HttpError(409, 'El nodo está desconectado. Revisa que el agente esté corriendo en la VPS.', 'node_offline')
      }
      const body = await leerJson(req)
      const servidor = await store.obtenerServidor(Number(body.serverId))
      if (!servidor) throw new HttpError(404, 'Servidor no encontrado.', 'not_found')
      if (Number(servidor.node_id) !== Number(nodo.id)) {
        throw new HttpError(409, 'Ese servidor no pertenece a este nodo.', 'wrong_node')
      }
      const filas = await store.listarBotsPorServidor(servidor.id)
      const sessions = []
      for (const fila of filas) {
        const folder = fila.folder || fila.phone
        if (!/^[a-zA-Z0-9_-]+$/.test(String(folder || ''))) continue
        const archivos = archivosSesion(config.root, folder)
        if (!archivos['creds.json']) continue
        const sincronizado = await enviarComando(nodo.id, 'sync-session', {
          folder,
          files: archivos,
        }, 30_000)
        if (!sincronizado.ok) {
          throw new HttpError(502, `No se pudo sincronizar ${folder} con el nodo: ${sincronizado.error || 'error'}`, 'node_sync_failed')
        }
        sessions.push(folder)
      }
      const arranque = await enviarComando(nodo.id, 'start', {
        serverName: servidor.name,
        tier: servidor.tier,
        lanes: servidor.lanes,
        heapMb: servidor.heap_mb,
        dbMode: servidor.db_mode,
        sessions,
      }, 45_000)
      if (!arranque.ok) {
        throw new HttpError(502, `El nodo no pudo arrancar el servidor: ${arranque.error || 'error'}`, 'node_start_failed')
      }
      await store.registrarAuditoria({
        userId: sesion.id,
        action: 'admin.node_start',
        ip,
        meta: { nodeId: nodo.id, serverId: servidor.id, sessions: sessions.length },
      })
      return json(res, 200, { ok: true, sessions: sessions.length, carriles: arranque.carriles || [] })
    }

    // ── Parar todos los carriles del nodo ─────────────────────────────────
    if (seg.length === 5 && /^\d+$/.test(seg[3]) && seg[4] === 'stop' && metodo === 'POST') {
      requerirPermiso(sesion, 'admin.servers.edit')
      const nodo = await store.obtenerNodo(Number(seg[3]))
      if (!nodo) throw new HttpError(404, 'Nodo no encontrado.', 'not_found')
      const resultado = await enviarComando(nodo.id, 'stop', {}, 15_000)
      await store.registrarAuditoria({ userId: sesion.id, action: 'admin.node_stop', ip, meta: { nodeId: nodo.id } })
      return json(res, 200, { ok: resultado.ok, error: resultado.ok ? null : (resultado.error || 'error') })
    }

    return SIN_RUTA
  }
}
