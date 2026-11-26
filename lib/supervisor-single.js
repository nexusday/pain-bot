/**
 * Supervisor de proceso único o multi-carril (estilo GataBot-MD).
 *
 * `PAIN_LANES=1` (por defecto): un solo proceso `main.js` hospeda el bot
 * principal y todos los sub-bots. Comportamiento idéntico al anterior.
 *
 * `PAIN_LANES=N` (N>1): se arrancan N procesos, cada uno con un subconjunto
 * de sesiones. El carril 0 además hospeda el bot principal y el panel web;
 * los demás solo hospedan sub-bots. Todos comparten la misma base de datos
 * (SQLite en modo WAL) y el mismo directorio de estado; el panel agrega las
 * sesiones de todos los carriles.
 *
 * El supervisor solo vigila los procesos: si uno muere, lo reinicia con backoff.
 * No hay leases, ni host-admission, ni coordinación entre procesos.
 */
import { fork } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { ARCHIVO_REENLACE_PENDIENTE, sesionEnEmparejamiento } from './subbot-recovery.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MAIN = join(ROOT, 'main.js')
const REGEX_SESION = /^[a-zA-Z0-9_-]+$/
const TAIL_LINEAS = 40
const STOP_TIMEOUT_MS = 12_000
const RESTART_MAX_MS = 30_000
const STABLE_MS = 60_000
const FALLO_RAPIDO_MS = 15_000
const FALLOS_RAPIDOS_ANTES_DE_PAUSA = 3
const PAUSA_TRAS_FALLOS_RAPIDOS_MS = 60_000

function enteroEnv(nombre, porDefecto, minimo, maximo) {
  const valor = Number.parseInt(process.env[nombre], 10)
  if (!Number.isInteger(valor)) return porDefecto
  return Math.min(Math.max(valor, minimo), maximo)
}

const LANES = Math.min(
  Math.max(enteroEnv('PAIN_LANES', 3, 1, 16), 1),
  Math.max(1, os.cpus().length)
)

// Perfil de recursos por tier. El tier se configura con PAIN_TIER.
const TIER = (process.env.PAIN_TIER || 'free').toLowerCase()
const PERFILES_TIER = {
  free: {
    heapMb: 512,
    msgCache: 5000,
    msgChat: 50,
    chatsSocket: 100,
    groupMeta: 200,
    keepAliveMs: 60_000,
    dbFlushMs: 10000,
    dbCommitMs: 30000,
  },
  premium: {
    heapMb: 2048,
    msgCache: 20000,
    msgChat: 200,
    chatsSocket: 1000,
    groupMeta: 2000,
    keepAliveMs: 30_000,
    dbFlushMs: 5000,
    dbCommitMs: 15000,
  },
  vip: {
    heapMb: 4096,
    msgCache: 50000,
    msgChat: 500,
    chatsSocket: 3000,
    groupMeta: 4000,
    keepAliveMs: 20_000,
    dbFlushMs: 3000,
    dbCommitMs: 10000,
  },
}
const PERFIL = PERFILES_TIER[TIER] || PERFILES_TIER.free

const RAM_TOTAL_MB = Math.max(1024, Math.floor(os.totalmem() / 1048576))
function heapAutomaticoMb() {
  const porcentaje = enteroEnv('PAIN_SINGLE_HEAP_PERCENT', 35, 10, 50)
  return Math.min(
    Math.max(Math.floor((RAM_TOTAL_MB * porcentaje) / 100), 2560),
    5120
  )
}
const HEAP_MB = enteroEnv('PAIN_SINGLE_HEAP_MB', PERFIL.heapMb, 256, 6144)
const HEAP_EXPLICITO = Number.isInteger(Number.parseInt(process.env.PAIN_SINGLE_HEAP_MB, 10)) || TIER === 'free'
const SEMI_EXPLICITO = Number.isInteger(Number.parseInt(process.env.PAIN_SEMI_SPACE_MB, 10))
const RSS_ALERT_MB = enteroEnv(
  'PAIN_SINGLE_RSS_ALERT_MB',
  Math.min(
    Math.max(Math.round(HEAP_MB * 1.5), 2048),
    Math.round(RAM_TOTAL_MB * 0.6)
  ),
  1024,
  8192
)
const SEMI_SPACE_MB = enteroEnv('PAIN_SEMI_SPACE_MB', 32, 16, 128)

function listaSesiones() {
  const raiz = resolve(ROOT, global.bot || 'Serbot')
  if (!existsSync(raiz)) return []
  try {
    return readdirSync(raiz).filter((folder) => {
      if (!REGEX_SESION.test(folder)) return false
      try {
        const path = join(raiz, folder)
        if (!statSync(path).isDirectory()) return false
        const rutaCreds = join(path, 'creds.json')
        if (!existsSync(rutaCreds)) return false
        try {
          const creds = JSON.parse(readFileSync(rutaCreds, 'utf8'))
          if (creds?.registered !== true) return false
        } catch {
          return false
        }
        if (existsSync(join(path, ARCHIVO_REENLACE_PENDIENTE))) return false
        return !sesionEnEmparejamiento(path)
      } catch {
        return false
      }
    })
  } catch {
    return []
  }
}

function contarCarpetasConCreds() {
  const raiz = resolve(ROOT, global.bot || 'Serbot')
  if (!existsSync(raiz)) return 0
  try {
    return readdirSync(raiz).filter((folder) => {
      if (!REGEX_SESION.test(folder)) return false
      try {
        const path = join(raiz, folder)
        return statSync(path).isDirectory() && existsSync(join(path, 'creds.json'))
      } catch {
        return 0
      }
    }).length
  } catch {
    return 0
  }
}

function volcarCrash(lineas, code) {
  if (!lineas.length) return null
  try {
    const carpeta = join(ROOT, 'storage', 'logs', 'crash')
    mkdirSync(carpeta, { recursive: true })
    const destino = join(carpeta, 'primary-ultimo-error.log')
    writeFileSync(
      destino,
      `${new Date().toISOString()} — últimas líneas del proceso (código ${code ?? '?'})\n\n` +
      `${lineas.join('\n')}\n`,
      'utf8'
    )
    return destino
  } catch {
    return null
  }
}

function argumentosDeNode() {
  const base = process.execArgv.filter((arg) =>
    arg !== '--expose-gc' &&
    !/^--max-old-space-size=/.test(arg) &&
    !/^--max-semi-space-size=/.test(arg)
  )
  return [
    ...base,
    '--expose-gc',
    ...(SEMI_EXPLICITO ? [`--max-semi-space-size=${SEMI_SPACE_MB}`] : []),
    ...(HEAP_EXPLICITO ? [`--max-old-space-size=${HEAP_MB}`] : []),
  ]
}

/**
 * Divide las sesiones en N carriles de forma equilibrada.
 */
function dividirSesiones(sesiones, lanes) {
  const ordenadas = [...sesiones].sort()
  const resultado = Array.from({ length: lanes }, () => [])
  ordenadas.forEach((sesion, indice) => {
    resultado[indice % lanes].push(sesion)
  })
  return resultado
}

/**
 * Lee `storage/servers.json` (lo escribe el panel). Devuelve los servidores
 * activos o null si no hay configuración del panel.
 */
function leerServidoresPanel() {
  const ruta = join(ROOT, 'storage', 'servers.json')
  try {
    if (!existsSync(ruta)) return null
    const datos = JSON.parse(readFileSync(ruta, 'utf8'))
    if (!Array.isArray(datos)) return null
    const activos = datos.filter((s) => s && s.status === 'active')
    return activos.length ? activos : null
  } catch {
    return null
  }
}

/**
 * Construye los carriles a partir de la configuración del panel.
 * Cada servidor con `lanes` N genera N procesos; sus bots se reparten
 * round-robin entre esos procesos. El primer carril del primer servidor
 * es el primario (panel + bot principal).
 */
function carrilesDesdeServidores(servidores, sesionesDisco) {
  const enDisco = new Set(sesionesDisco)
  const carriles = []
  let primero = true
  for (const servidor of servidores) {
    const bots = Array.isArray(servidor.bots)
      ? servidor.bots.filter((b) => typeof b === 'string' && enDisco.has(b))
      : []
    // Si el servidor no tiene bots asignados, no se arranca: no consume RAM.
    if (!bots.length) continue
    const lanes = Math.max(1, Number(servidor.lanes) || 1)
    const partes = dividirSesiones(bots, lanes)
    for (let i = 0; i < lanes; i++) {
      carriles.push({
        id: carriles.length,
        serverId: servidor.id,
        serverName: servidor.name,
        tier: servidor.tier || 'free',
        heapMb: Number(servidor.heapMb) || 512,
        dbMode: servidor.dbMode || 'shared',
        sessions: partes[i],
        primary: primero,
      })
      primero = false
    }
  }
  return carriles
}

export async function startSingleSupervisor() {
  const log = (...args) => console.log('[supervisor]', ...args)

  // Estado por carril. Se construye al arrancar (desde servers.json o
  // desde PAIN_LANES como fallback).
  const carriles = []
  let stopping = false

  function esPrimario(id) {
    const carril = carriles.find((c) => c.id === id)
    return Boolean(carril?.primary)
  }

  function envParaCarril(carril) {
    const tier = carril.tier || TIER
    const perfil = PERFILES_TIER[tier] || PERFILES_TIER.free
    const heap = carril.heapMb || perfil.heapMb
    const base = {
      ...process.env,
      PAIN_TIER: tier,
      PAIN_WORKER_ID: `worker-${carril.id}`,
      PAIN_RSS_ALERT_MB: String(RSS_ALERT_MB),
      PAIN_GC_MIN_MB: process.env.PAIN_GC_MIN_MB || String(heap),
      PAIN_GC_MANUAL: process.env.PAIN_SINGLE_GC_MANUAL || '0',
      PAIN_MAX_MSG_CACHE: process.env.PAIN_MAX_MSG_CACHE || String(perfil.msgCache),
      PAIN_MAX_MSG_CHAT: process.env.PAIN_MAX_MSG_CHAT || String(perfil.msgChat),
      PAIN_MAX_CHATS_SOCKET: process.env.PAIN_MAX_CHATS_SOCKET || String(perfil.chatsSocket),
      PAIN_MAX_GROUP_META: process.env.PAIN_MAX_GROUP_META || String(perfil.groupMeta),
      PAIN_DB_FLUSH_MS: process.env.PAIN_DB_FLUSH_MS || String(perfil.dbFlushMs),
      PAIN_DB_COMMIT_MS: process.env.PAIN_DB_COMMIT_MS || String(perfil.dbCommitMs),
      PAIN_META_FETCH_MAX_MS: process.env.PAIN_META_FETCH_MAX_MS || '1500',
      PAIN_SUBBOT_START_DELAY_MS: process.env.PAIN_SUBBOT_START_DELAY_MS || '500',
      PAIN_SUBBOT_FOLLOW_CHANNELS: process.env.PAIN_SUBBOT_FOLLOW_CHANNELS || '0',
      PAIN_KEEPALIVE_MS: process.env.PAIN_KEEPALIVE_MS || String(perfil.keepAliveMs),
      PAIN_SERVER_NAME: carril.serverName || '',
      UV_THREADPOOL_SIZE: process.env.UV_THREADPOOL_SIZE || '32',
    }
    if (carriles.length === 1) {
      // Modo único: un solo proceso, todo en el mismo event loop.
      return {
        ...base,
        PAIN_ROLE: 'primary',
        PAIN_SESSIONS_JSON: JSON.stringify(carril.sessions),
        PAIN_SINGLE_PROCESS: '1',
      }
    }
    // Modo carriles: varios procesos, uno por carril.
    return {
      ...base,
      PAIN_ROLE: carril.primary ? 'primary' : 'worker',
      PAIN_SINGLE_PROCESS: '0',
      PAIN_SESSIONS_JSON: JSON.stringify(carril.sessions),
    }
  }

  function programarRearranque(carril, motivo) {
    if (stopping) return
    const runtime = Date.now() - carril.startedAt
    if (runtime >= STABLE_MS) carril.failures = 0
    if (runtime < FALLO_RAPIDO_MS) carril.fallosRapidos++
    else carril.fallosRapidos = 0
    const pausaLarga = carril.fallosRapidos >= FALLOS_RAPIDOS_ANTES_DE_PAUSA
    const delay = pausaLarga
      ? PAUSA_TRAS_FALLOS_RAPIDOS_MS
      : Math.min(1000 * (2 ** carril.failures++), RESTART_MAX_MS)
    if (pausaLarga) carril.fallosRapidos = 0
    console.error(
      `[supervisor] Carril ${carril.id} terminó (${motivo}). Se reinicia en ` +
      `${Math.round(delay / 1000)}s.`
    )
    carril.restartTimer = setTimeout(() => {
      carril.restartTimer = null
      arrancarCarril(carril.id)
    }, delay)
  }

  function arrancarCarril(id) {
    const carril = carriles[id]
    if (stopping || carril.child) return
    const sesiones = carril.sessions
    const totalCarpetas = contarCarpetasConCreds()
    carril.startedAt = Date.now()
    carril.tail = []
    let nuevo
    try {
      nuevo = fork(MAIN, process.argv.slice(2), {
        cwd: ROOT,
        execArgv: argumentosDeNode(),
        env: envParaCarril(carril),
        stdio: ['inherit', 'inherit', 'pipe', 'ipc'],
      })
    } catch (error) {
      console.error(`[supervisor] No se pudo iniciar el carril ${id}:`, error?.message || error)
      programarRearranque(carril, 'error al crear el proceso')
      return
    }
    carril.child = nuevo
    carril.stoppingChild = false

    if (nuevo.stderr) {
      let resto = ''
      nuevo.stderr.setEncoding('utf8')
      nuevo.stderr.on('data', (trozo) => {
        process.stderr.write(trozo)
        resto += trozo
        const lineas = resto.split(/\r?\n/)
        resto = lineas.pop() || ''
        for (const linea of lineas) {
          if (!linea.trim()) continue
          carril.tail.push(linea.slice(0, 500))
          if (carril.tail.length > TAIL_LINEAS) carril.tail.shift()
        }
      })
      nuevo.stderr.on('error', () => {})
    }

    nuevo.on('message', (message) => {
      if (typeof message === 'string') {
        if (message === 'reset' || message === 'restart') {
          console.log(`[supervisor] carril ${id} pidió reinicio.`)
          detenerCarril(id, 'reset')
        }
        return
      }
      if (!message || typeof message !== 'object') return
      if (message.type === 'primary-linked') {
        console.log(`[supervisor] carril ${id}: bot principal vinculado.`)
        return
      }
      if (message.type === 'primary-unlinked') {
        console.log(`[supervisor] carril ${id}: bot principal desvinculado.`)
        return
      }
    })

    nuevo.on('error', (error) => {
      console.error(`[supervisor] error del carril ${id}:`, error?.message || error)
    })

    nuevo.on('exit', (code, signal) => {
      if (carril.child !== nuevo) return
      carril.child = null
      if (carril.forceTimer) clearTimeout(carril.forceTimer)
      carril.forceTimer = null
      if (stopping || carril.stoppingChild) {
        if (stopping) {
          // Esperar a que todos los carriles terminen antes de salir.
          if (carriles.every((c) => c.child === null)) process.exit(0)
        }
        carril.stoppingChild = false
        arrancarCarril(id)
        return
      }
      const motivo = `código ${code ?? 'desconocido'}${signal ? `, señal ${signal}` : ''}`
      if (code !== 0 && carril.tail.length) {
        console.error(`[supervisor] últimas líneas del carril ${id} antes de salir:`)
        for (const linea of carril.tail.slice(-15)) console.error(`  ${linea}`)
        const archivo = volcarCrash(carril.tail, code)
        if (archivo) console.error(`[supervisor] log guardado en ${archivo}`)
      }
      if (code === 134) {
        console.error(
          HEAP_EXPLICITO
            ? `[supervisor] Heap agotado en carril ${id}. Sube PAIN_SINGLE_HEAP_MB (actual ${HEAP_MB} MB).`
            : `[supervisor] Heap agotado en carril ${id}. Revisa memoria del contenedor.`
        )
      }
      programarRearranque(carril, motivo)
    })

    log(
      `carril ${id} iniciado (PID ${nuevo.pid}), ${sesiones.length} sesión(es), ` +
      `rol=${esPrimario(id) ? 'primary' : 'worker'}, ` +
      `heap ${HEAP_EXPLICITO ? `${HEAP_MB} MB` : 'automático (V8)'}.`
    )
  }

  function detenerCarril(id, motivo) {
    const carril = carriles[id]
    if (!carril.child) return
    carril.stoppingChild = true
    console.log(`[supervisor] deteniendo carril ${id} (${motivo}).`)
    const actual = carril.child
    try { actual.send({ type: 'shutdown' }, () => {}) } catch {}
    try { actual.kill('SIGTERM') } catch {}
    carril.forceTimer = setTimeout(() => {
      if (actual.exitCode === null && actual.signalCode === null) {
        try { actual.kill('SIGKILL') } catch {}
      }
    }, STOP_TIMEOUT_MS)
    carril.forceTimer.unref?.()
  }

  function apagar(signal) {
    if (stopping) return
    stopping = true
    for (const carril of carriles) {
      if (carril.restartTimer) clearTimeout(carril.restartTimer)
      detenerCarril(carril.id, signal)
    }
    const shutdownTimer = setTimeout(() => {
      for (const carril of carriles) {
        if (carril.child) {
          try { carril.child.kill('SIGKILL') } catch {}
        }
      }
      process.exit(1)
    }, STOP_TIMEOUT_MS + 2000)
    shutdownTimer.unref?.()
    if (carriles.every((c) => c.child === null)) process.exit(0)
  }

  process.once('SIGINT', () => apagar('SIGINT'))
  process.once('SIGTERM', () => apagar('SIGTERM'))

  // Arranque inicial. Prioridad: configuración del panel (servers.json).
  const sesiones = listaSesiones()
  const totalCarpetas = contarCarpetasConCreds()
  const servidoresPanel = leerServidoresPanel()
  if (servidoresPanel) {
    const desdePanel = carrilesDesdeServidores(servidoresPanel, sesiones)
    if (desdePanel.length) {
      const primario = desdePanel.find((c) => c.primary)
      if (primario) primario.sessions = [...new Set([...primario.sessions, ...sesiones.filter(
        (s) => !desdePanel.some((c) => c.sessions.includes(s))
      )])]
      carriles.push(...desdePanel.map((c, i) => ({
        id: i,
        serverId: c.serverId,
        serverName: c.serverName,
        tier: c.tier,
        heapMb: c.heapMb,
        dbMode: c.dbMode,
        sessions: c.sessions,
        primary: c.primary,
        child: null,
        stopping: false,
        stoppingChild: false,
        failures: 0,
        fallosRapidos: 0,
        startedAt: 0,
        restartTimer: null,
        forceTimer: null,
        tail: [],
      })))
      console.log(
        `[supervisor] configuración del panel: ${servidoresPanel.length} servidor(es), ` +
        `${carriles.length} carril(es), ${sesiones.length} sesión(es) de sub-bot.`
      )
      for (const carril of carriles) arrancarCarril(carril.id)
      return
    }
  }
  // Fallback: PAIN_LANES del entorno, reparto round-robin de todas las sesiones.
  const partes = dividirSesiones(sesiones, LANES)
  for (let i = 0; i < LANES; i++) {
    carriles.push({
      id: i,
      serverId: null,
      serverName: '',
      tier: TIER,
      heapMb: HEAP_MB,
      dbMode: 'shared',
      sessions: partes[i],
      primary: i === 0,
      child: null,
      stopping: false,
      stoppingChild: false,
      failures: 0,
      fallosRapidos: 0,
      startedAt: 0,
      restartTimer: null,
      forceTimer: null,
      tail: [],
    })
  }
  console.log(
    `[supervisor] ${LANES} carril(es), ${sesiones.length} sesión(es) ` +
    `de sub-bot (${sesiones.length} registradas de ${totalCarpetas} carpetas con creds).`
  )
  for (let i = 0; i < LANES; i++) {
    arrancarCarril(i)
  }
}
