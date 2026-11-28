/**
 * Agente de nodo remoto para Pain-Bot (modelo Wings de Pterodactyl).
 *
 * El agente se ejecuta en la VPS y ABRE la conexión hacia el panel. El panel
 * no necesita la IP del nodo ni abrir puertos: solo genera un UUID/token y
 * espera la conexión.
 *
 * Uso en la VPS (con el repo ya clonado y `npm install`):
 *   PANEL_URL=https://tu-panel.com NODE_UUID=... NODE_TOKEN=... node scripts/node-agent.js
 *
 * Requisitos: Node 20+, ffmpeg instalado en el sistema.
 */
import os from 'node:os'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { spawn, execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { WebSocket } from 'ws'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PANEL_URL = String(process.env.PANEL_URL || '').replace(/\/+$/, '')
const UUID = String(process.env.NODE_UUID || '')
const TOKEN = String(process.env.NODE_TOKEN || '')
const NODE_NAME = process.env.NODE_NAME || os.hostname()

if (!PANEL_URL || !UUID || !TOKEN) {
  console.error('[node-agent] Faltan PANEL_URL, NODE_UUID o NODE_TOKEN.')
  process.exit(1)
}

const WS_URL = `${PANEL_URL.replace(/^http/i, 'ws')}/api/node/ws?uuid=${encodeURIComponent(UUID)}&token=${encodeURIComponent(TOKEN)}`
const carriles = new Map()
let commit = ''
let socket = null
let reconectando = null

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

function enviar(mensaje) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false
  try {
    socket.send(JSON.stringify(mensaje))
    return true
  } catch {
    return false
  }
}

function recursos() {
  return {
    type: 'stats',
    name: NODE_NAME,
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
  }
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
    PAIN_WORKER_ID: `node-${UUID}-lane-${laneId}`,
    PAIN_SINGLE_PROCESS: '0',
    PAIN_SESSIONS_JSON: JSON.stringify(sessions),
    PAIN_SERVER_NAME: serverName || NODE_NAME,
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

async function manejarComando(mensaje) {
  const { type, requestId } = mensaje
  const resultado = { ok: false, error: 'unknown' }
  try {
    if (type === 'sync-session') {
      await escribirSesion(mensaje.folder, mensaje.files)
      resultado.ok = true
    } else if (type === 'start') {
      const lanes = Math.max(1, Math.min(Number(mensaje.lanes) || 1, 16))
      const sesiones = Array.isArray(mensaje.sessions) ? mensaje.sessions : []
      for (let i = 0; i < lanes; i++) {
        const parte = sesiones.filter((_, indice) => indice % lanes === i)
        arrancarCarril(i, {
          sessions: parte,
          serverName: mensaje.serverName,
          tier: mensaje.tier,
          heapMb: mensaje.heapMb,
          dbMode: mensaje.dbMode,
        })
      }
      resultado.ok = true
      resultado.carriles = estadoCarriles()
    } else if (type === 'stop') {
      for (const [id, carril] of carriles) {
        try { carril.child?.kill('SIGTERM') } catch {}
        carriles.delete(id)
      }
      resultado.ok = true
    }
  } catch (error) {
    resultado.ok = false
    resultado.error = error?.message || String(error)
  }
  if (requestId) enviar({ type: 'result', requestId, resultado })
  enviar(recursos())
}

function conectar() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return
  socket = new WebSocket(WS_URL, { handshakeTimeout: 15000 })
  socket.on('open', () => {
    console.log(`[node-agent] conectado al panel (${PANEL_URL}) como ${UUID}`)
    enviar({ ...recursos(), type: 'hello' })
  })
  socket.on('message', (raw) => {
    let mensaje = null
    try { mensaje = JSON.parse(String(raw)) } catch { return }
    if (!mensaje || !mensaje.type) return
    if (mensaje.type === 'welcome') {
      console.log(`[node-agent] panel confirmó el nodo ${mensaje.nodeId}`)
      return
    }
    void manejarComando(mensaje)
  })
  socket.on('close', () => {
    console.log('[node-agent] desconectado del panel; reintentando en 10 s…')
    programarReconexion()
  })
  socket.on('error', (error) => {
    console.error('[node-agent] error de WebSocket:', error?.message || error)
  })
}

function programarReconexion() {
  if (reconectando) return
  reconectando = setTimeout(() => {
    reconectando = null
    conectar()
  }, 10_000)
}

await leerCommit()
conectar()
const estadisticas = setInterval(() => {
  if (socket?.readyState === WebSocket.OPEN) enviar(recursos())
}, 15_000)
estadisticas.unref?.()

for (const senal of ['SIGINT', 'SIGTERM']) {
  process.once(senal, () => {
    for (const carril of carriles.values()) {
      try { carril.child?.kill('SIGTERM') } catch {}
    }
    try { socket?.close() } catch {}
    process.exit(0)
  })
}
