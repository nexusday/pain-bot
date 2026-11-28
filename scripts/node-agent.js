/**
 * Agente de nodo remoto para Pain-Bot.
 *
 * Se ejecuta en la VPS que quieras usar como servidor de bots. El panel lo
 * consulta por HTTP con un token y le pide arrancar/parar carriles.
 *
 * Uso:
 *   NODE_TOKEN=un-token-largo NODE_PORT=10010 node scripts/node-agent.js
 *
 * Requisitos en la VPS: el repositorio de Pain-Bot (este mismo código),
 * Node 20+, ffmpeg y las dependencias instaladas (`npm install`).
 */
import http from 'node:http'
import os from 'node:os'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { spawn, execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TOKEN = String(process.env.NODE_TOKEN || '')
const PORT = Number.parseInt(process.env.NODE_PORT, 10) || 10010
const HOST = process.env.NODE_HOST || '0.0.0.0'
const NODE_ID = process.env.NODE_ID || os.hostname()

if (!TOKEN || TOKEN.length < 16) {
  console.error('[node-agent] Define NODE_TOKEN con al menos 16 caracteres.')
  process.exit(1)
}

const carriles = new Map() // laneId -> { child, sessions, serverName, startedAt }
let commit = ''

function ejecutar(cmd, args, opciones = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd: ROOT, timeout: 5000, ...opciones }, (error, stdout) => {
      resolve(error ? '' : String(stdout || '').trim())
    })
  })
}

async function leerCommit() {
  commit = await ejecutar('git', ['rev-parse', '--short', 'HEAD'])
}

function memoria() {
  const total = os.totalmem()
  const libre = os.freemem()
  return {
    totalMB: Math.round(total / 1048576),
    libreMB: Math.round(libre / 1048576),
    usadaMB: Math.round((total - libre) / 1048576),
    porcentaje: total ? Math.round(((total - libre) / total) * 100) : 0,
  }
}

function disco() {
  try {
    const s = fs.statfsSync(ROOT)
    const bloque = s.bsize || 4096
    const total = (s.blocks || 0) * bloque
    const libre = (s.bavail || 0) * bloque
    return {
      totalGB: Math.round((total / 1073741824) * 10) / 10,
      libreGB: Math.round((libre / 1073741824) * 10) / 10,
      porcentaje: total ? Math.round(((total - libre) / total) * 100) : 0,
    }
  } catch {
    return null
  }
}

function estadoCarriles() {
  return [...carriles.entries()].map(([id, carril]) => ({
    id,
    pid: carril.child?.pid || null,
    serverName: carril.serverName,
    tier: carril.tier,
    sessions: carril.sessions.length,
    startedAt: carril.startedAt,
    vivo: Boolean(carril.child && carril.child.exitCode === null),
  }))
}

function leerCuerpo(req, limite = 80 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let total = 0
    const trozos = []
    req.on('data', (trozo) => {
      total += trozo.length
      if (total > limite) {
        reject(new Error('Cuerpo demasiado grande.'))
        req.destroy()
        return
      }
      trozos.push(trozo)
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(trozos).toString('utf8') || '{}'))
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

function json(res, codigo, datos) {
  res.writeHead(codigo, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(datos))
}

function autorizado(req) {
  return String(req.headers['x-node-token'] || '') === TOKEN
}

async function escribirSesion(folder, files) {
  if (!/^[a-zA-Z0-9_-]+$/.test(String(folder || ''))) throw new Error('folder inválido')
  const dir = path.join(ROOT, 'Serbot', folder)
  await fsp.mkdir(dir, { recursive: true })
  for (const [nombre, base64] of Object.entries(files || {})) {
    if (!/^[a-zA-Z0-9._-]+$/.test(nombre)) continue
    await fsp.writeFile(path.join(dir, nombre), Buffer.from(String(base64 || ''), 'base64'))
  }
  return dir
}

function arrancarCarril(laneId, { sessions, serverName, tier, heapMb, dbMode }) {
  const anterior = carriles.get(laneId)
  if (anterior?.child) {
    try { anterior.child.kill('SIGTERM') } catch {}
    carriles.delete(laneId)
  }
  if (!Array.isArray(sessions) || !sessions.length) return
  const env = {
    ...process.env,
    PAIN_ROLE: 'worker',
    PAIN_WORKER_ID: `node-${NODE_ID}-lane-${laneId}`,
    PAIN_SINGLE_PROCESS: '0',
    PAIN_SESSIONS_JSON: JSON.stringify(sessions),
    PAIN_SERVER_NAME: serverName || `node-${NODE_ID}`,
    PAIN_TIER: tier || 'free',
    PAIN_DB_MODE: dbMode || 'isolated',
    PAIN_SINGLE_HEAP_MB: String(Number(heapMb) || 2048),
    UV_THREADPOOL_SIZE: process.env.UV_THREADPOOL_SIZE || '8',
  }
  const child = spawn(process.execPath, ['main.js'], {
    cwd: ROOT,
    env,
    stdio: ['ignore', 'inherit', 'inherit'],
    windowsHide: true,
  })
  carriles.set(laneId, { child, sessions, serverName, tier, startedAt: Date.now() })
  child.on('exit', (codigo) => {
    const actual = carriles.get(laneId)
    if (actual?.child === child) {
      carriles.delete(laneId)
      console.log(`[node-agent] carril ${laneId} terminó (código ${codigo}).`)
    }
  })
  console.log(`[node-agent] carril ${laneId} arrancado (PID ${child.pid}) con ${sessions.length} sesión(es).`)
}

const servidor = http.createServer(async (req, res) => {
  if (!autorizado(req)) return json(res, 401, { ok: false, error: 'unauthorized' })
  const url = new URL(req.url || '/', 'http://localhost')
  const metodo = String(req.method || 'GET').toUpperCase()
  try {
    if (url.pathname === '/health' && metodo === 'GET') {
      return json(res, 200, {
        ok: true,
        nodeId: NODE_ID,
        version: process.version,
        commit,
        plataforma: os.platform(),
        arquitectura: os.arch(),
        hostname: os.hostname(),
        uptimeSegundos: Math.round(os.uptime()),
        cpu: { nucleos: os.cpus().length, modelo: os.cpus()[0]?.model || '', uso: os.loadavg()[0] },
        memoria: memoria(),
        disco: disco(),
        carriles: estadoCarriles(),
      })
    }
    if (url.pathname === '/status' && metodo === 'GET') {
      return json(res, 200, { ok: true, carriles: estadoCarriles() })
    }
    if (url.pathname === '/sync-session' && metodo === 'POST') {
      const body = await leerCuerpo(req)
      await escribirSesion(body.folder, body.files)
      return json(res, 200, { ok: true })
    }
    if (url.pathname === '/start' && metodo === 'POST') {
      const body = await leerCuerpo(req)
      const lanes = Math.max(1, Math.min(Number(body.lanes) || 1, 16))
      const sesiones = Array.isArray(body.sessions) ? body.sessions : []
      for (let i = 0; i < lanes; i++) {
        const parte = sesiones.filter((_, indice) => indice % lanes === i)
        arrancarCarril(i, {
          sessions: parte,
          serverName: body.serverName,
          tier: body.tier,
          heapMb: body.heapMb,
          dbMode: body.dbMode,
        })
      }
      return json(res, 200, { ok: true, carriles: estadoCarriles() })
    }
    if (url.pathname === '/stop' && metodo === 'POST') {
      for (const [id, carril] of carriles) {
        try { carril.child?.kill('SIGTERM') } catch {}
        carriles.delete(id)
      }
      return json(res, 200, { ok: true })
    }
    return json(res, 404, { ok: false, error: 'not-found' })
  } catch (error) {
    return json(res, 500, { ok: false, error: error?.message || 'error' })
  }
})

await leerCommit()
servidor.listen(PORT, HOST, () => {
  console.log(`[node-agent] ${NODE_ID} escuchando en http://${HOST}:${PORT} (commit ${commit || '?'})`)
})
for (const senal of ['SIGINT', 'SIGTERM']) {
  process.once(senal, () => {
    for (const carril of carriles.values()) {
      try { carril.child?.kill('SIGTERM') } catch {}
    }
    process.exit(0)
  })
}
