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
    heapMb: 1024,
    msgCache: 5000,
    msgChat: 50,
    chatsSocket: 100,
    groupMeta: 200,
    keepAliveMs: 60_000,
    dbFlushMs: 10000,
    dbCommitMs: 30000,
  },
  premium: {
    heapMb: 3072,
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
 *
 * Carril 0 = primario: SIEMPRE existe, corre el bot principal y el panel,
 * usa la DB compartida y recibe los bots que no estén asignados a ningún
 * servidor (los "free" por defecto).
 *
 * Cada servidor activo genera `lanes` procesos con sus bots. Si el servidor
 * es de DB aislada, cada proceso usa `storage/databases/worker-<id>`.
 * El bot principal NUNCA vive en un servidor premium: vive en el carril 0.
 */
/** Escribe el mapa efectivo carpeta -> servidor/carril para que el panel lo lea. */
function escribirAsignaciones(carriles) {
  try {
    const mapa = {}
    for (const carril of carriles) {
      const workerId = carril.primary
        ? 'primary'
        : (carril.serverId ? `server-${carril.serverId}-lane-${carril.id}` : `worker-${carril.id}`)
      for (const folder of carril.sessions) {
        mapa[folder] = {
          serverId: carril.serverId,
          serverName: carril.serverName,
          workerId,
          tier: carril.tier,
        }
      }
    }
    const dir = join(ROOT, 'storage')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'assignments.json'), JSON.stringify(mapa, null, 2), 'utf8')
  } catch (error) {
    console.error('[supervisor] No se pudo escribir assignments.json:', error?.message || error)
  }
}

function carrilesDesdeServidores(servidores, sesionesDisco) {
  const enDisco = new Set(sesionesDisco)
  const asignadas = new Set()
  // Carril 0: SOLO bot principal + panel. Sin subbots, para que el
  // emparejamiento y los keepalives del principal nunca compitan por el
  // event loop con 20+ sockets de sub-bots.
  const carriles = [{
    id: 0,
    serverId: null,
    serverName: 'principal',
    tier: 'free',
    heapMb: 1024,
    dbMode: 'shared',
    sessions: [],
    primary: true,
  }]

  // Orden de asignación: servidores FREE primero (los bots sin premium son
  // la mayoría), después premium y vip. Así el espacio premium queda libre
  // para quien lo pida explícitamente, pero si sobra capacidad free los bots
  // se reparten igualmente para no amontonar 70 sockets en un solo carril.
  const prioridadTier = { free: 0, premium: 1, vip: 2 }
  const ordenados = [...servidores].sort(
    (a, b) => (prioridadTier[a.tier] ?? 3) - (prioridadTier[b.tier] ?? 3)
  )

  // Reservar primero los bots asignados explícitamente en el panel.
  const explicitos = new Map()
  for (const servidor of servidores) {
    const bots = Array.isArray(servidor.bots)
      ? servidor.bots.filter((b) => typeof b === 'string' && enDisco.has(b))
      : []
    explicitos.set(servidor.id, bots)
    for (const bot of bots) asignadas.add(bot)
  }

  // Pool de bots sin servidor asignado.
  const pool = sesionesDisco.filter((sesion) => !asignadas.has(sesion))

  // Reparto round-robin SOLO entre servidores free. Los servidores premium/vip
  // quedan reservados para los bots que el usuario asigne explícitamente
  // (o para cuando los free se llenen). Así un bot free no consume RAM premium.
  const botsPorServidor = new Map()
  for (const servidor of ordenados) {
    botsPorServidor.set(servidor.id, [...(explicitos.get(servidor.id) || [])])
  }
  const servidoresFree = ordenados.filter((s) => (s.tier || 'free') === 'free')
  // Preferir los free con DB compartida: son los que el panel creó para
  // recibir bots automáticamente. Los free con DB aislada quedan para
  // asignaciones explícitas (cada uno con su propia DB).
  const servidoresFreeShared = servidoresFree.filter(
    (s) => (s.dbMode || 'shared') === 'shared'
  )
  const destinoAuto = servidoresFreeShared.length
    ? servidoresFreeShared
    : (servidoresFree.length ? servidoresFree : ordenados)
  let indice = 0
  while (pool.length && destinoAuto.length) {
    const servidor = destinoAuto[indice % destinoAuto.length]
    const maxSessions = Math.max(1, Number(servidor.maxSessions) || 100)
    const actual = botsPorServidor.get(servidor.id)
    if (actual.length < maxSessions) {
      actual.push(pool.shift())
    } else {
      const todosLlenos = destinoAuto.every((s) => {
        const cupo = Math.max(1, Number(s.maxSessions) || 100)
        return botsPorServidor.get(s.id).length >= cupo
      })
      if (todosLlenos) {
        // Los free están llenos: el resto va a premium si hay cupo.
        const premium = ordenados.filter((s) => (s.tier || 'free') !== 'free')
        if (!premium.length) break
        const libre = premium.find((s) => {
          const cupo = Math.max(1, Number(s.maxSessions) || 100)
          return botsPorServidor.get(s.id).length < cupo
        })
        if (!libre) break
        botsPorServidor.get(libre.id).push(pool.shift())
      }
    }
    indice++
  }

  // Crear los carriles de cada servidor. El número de carriles crece solo
  // cuando hay muchos bots (20 por carril) para que ningún proceso cargue
  // 70 sockets. El mínimo es el configurado en el panel.
  const maxLanes = Math.min(Math.max(2, os.cpus().length), 6)
  for (const servidor of ordenados) {
    const bots = botsPorServidor.get(servidor.id) || []
    if (!bots.length) continue
    for (const bot of bots) asignadas.add(bot)
    const lanesConfig = Math.max(1, Number(servidor.lanes) || 1)
    const lanesAuto = Math.ceil(bots.length / 20)
    const lanes = Math.min(Math.max(lanesConfig, lanesAuto), maxLanes)
    const partes = dividirSesiones(bots, lanes)
    for (let i = 0; i < lanes; i++) {
      if (!partes[i].length) continue
      carriles.push({
        id: carriles.length,
        serverId: servidor.id,
        serverName: servidor.name,
        tier: servidor.tier || 'free',
        heapMb: Number(servidor.heapMb) || 1024,
        dbMode: servidor.dbMode || 'shared',
        sessions: partes[i],
        primary: false,
      })
    }
  }

  // Si después de llenar todos los servidores quedan bots, se crea un carril
  // de desbordamiento. Nunca van al carril del bot principal.
  if (pool.length) {
    const lanes = Math.min(Math.max(1, Math.ceil(pool.length / 20)), maxLanes)
    const partes = dividirSesiones(pool, lanes)
    for (let i = 0; i < lanes; i++) {
      if (!partes[i].length) continue
      carriles.push({
        id: carriles.length,
        serverId: null,
        serverName: 'free-overflow',
        tier: 'free',
        heapMb: 2048,
        dbMode: 'shared',
        sessions: partes[i],
        primary: false,
      })
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
      PAIN_WORKER_ID: carril.primary
        ? 'primary'
        : (carril.serverId
          ? `server-${carril.serverId}-lane-${carril.id}`
          : `worker-${carril.id}`),
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
      PAIN_DB_MODE: carril.dbMode || 'shared',
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

  /**
   * Mueve una sesión de un carril a otro sin reiniciar el supervisor.
   * - Pide al carril actual que cierre esa sesión.
   * - Añade la carpeta al carril del servidor elegido.
   * - Si el carril destino está vivo, le pide que abra la sesión.
   * - Si no está vivo (no tenía bots), lo arranca.
   */
  async function reasignarBot(phone, serverId) {
    const folder = String(phone || '').replace(/\D/g, '')
    if (!folder) return
    const origen = carriles.find((c) => c.sessions.includes(folder))
    let destino = carriles.find((c) => Number(c.serverId) === Number(serverId))
    if (!destino) {
      // Servidor sin carriles activos: se crea uno nuevo para ese servidor.
      const servidores = leerServidoresPanel() || []
      const servidor = servidores.find((s) => Number(s.id) === Number(serverId))
      if (!servidor) {
        console.error(`[supervisor] No existe el servidor ${serverId} para reasignar +${folder}.`)
        return
      }
      destino = {
        id: carriles.length,
        serverId: servidor.id,
        serverName: servidor.name,
        tier: servidor.tier || 'free',
        heapMb: Number(servidor.heapMb) || 512,
        dbMode: servidor.dbMode || 'shared',
        sessions: [],
        primary: false,
        child: null,
        stopping: false,
        stoppingChild: false,
        failures: 0,
        fallosRapidos: 0,
        startedAt: 0,
        restartTimer: null,
        forceTimer: null,
        tail: [],
      }
      carriles.push(destino)
    }
    if (origen && origen.id !== destino.id) {
      origen.sessions = origen.sessions.filter((s) => s !== folder)
      try { origen.child?.send({ type: 'remove-session', folder }) } catch {}
    }
    if (!destino.sessions.includes(folder)) destino.sessions.push(folder)
    if (destino.child) {
      try { destino.child.send({ type: 'add-session', folder }) } catch {}
      console.log(`[supervisor] +${folder} reasignado en caliente al carril ${destino.id} (${destino.serverName || 'sin nombre'}).`)
    } else {
      arrancarCarril(destino.id)
      console.log(`[supervisor] +${folder} reasignado; carril ${destino.id} arrancado.`)
    }
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
      if (message.type === 'reassign-bot') {
        void reasignarBot(message.phone, message.serverId)
        return
      }
      if (message.type === 'reconnect-bot') {
        const folder = String(message.folder || '')
        const destino = carriles.find((c) => c.sessions.includes(folder))
        if (destino?.child) {
          try { destino.child.send({ type: 'reconnect-bot', folder }) } catch {}
        }
        return
      }
      if (message.type === 'restart-server') {
        const serverId = Number(message.serverId)
        for (const carril of carriles) {
          if (Number(carril.serverId) === serverId && carril.child) {
            console.log(`[supervisor] reiniciando carril ${carril.id} por importación de DB del servidor ${serverId}.`)
            detenerCarril(carril.id, 'import-db')
          }
        }
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
      `rol=${carril.primary ? 'primary' : 'worker'}` +
      `${carril.serverName ? `, servidor=${carril.serverName}` : ''}, ` +
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

  // Arranque escalonado: importar 255 plugins en 10 procesos a la vez satura
  // la CPU durante un minuto y tumba los keepalives (428 en cadena). Se
  // arranca un carril cada 3 s para que cada uno compile con CPU disponible.
  async function arrancarTodos() {
    for (let i = 0; i < carriles.length; i++) {
      arrancarCarril(i)
      if (i < carriles.length - 1) {
        await new Promise((resolver) => setTimeout(resolver, 3000))
      }
    }
  }

  // Arranque inicial. Prioridad: configuración del panel (servers.json).
  const sesiones = listaSesiones()
  const totalCarpetas = contarCarpetasConCreds()
  const servidoresPanel = leerServidoresPanel()
  if (servidoresPanel) {
    const desdePanel = carrilesDesdeServidores(servidoresPanel, sesiones)
    if (desdePanel.length) {
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
      escribirAsignaciones(carriles)
      console.log(
        `[supervisor] configuración del panel: ${servidoresPanel.length} servidor(es), ` +
        `${carriles.length} carril(es), ${sesiones.length} sesión(es) de sub-bot.`
      )
      await arrancarTodos()
      return
    }
  }
  // Fallback: PAIN_LANES del entorno.
  // Con más de un carril, el carril 0 queda SOLO para el bot principal y el
  // panel; los sub-bots se reparten entre los carriles 1..N-1. Así el
  // emparejamiento del principal nunca compite con 20+ sockets.
  const crearCarril = (id, sessions, primary) => ({
    id,
    serverId: null,
    serverName: primary ? 'principal' : 'free',
    tier: TIER,
    heapMb: HEAP_MB,
    dbMode: 'shared',
    sessions,
    primary,
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
  if (LANES <= 1) {
    carriles.push(crearCarril(0, sesiones, true))
  } else {
    carriles.push(crearCarril(0, [], true))
    const lanesSubbots = LANES - 1
    const partes = dividirSesiones(sesiones, lanesSubbots)
    for (let i = 0; i < lanesSubbots; i++) {
      if (!partes[i].length) continue
      carriles.push(crearCarril(carriles.length, partes[i], false))
    }
  }
  escribirAsignaciones(carriles)
  console.log(
    `[supervisor] ${carriles.length} carril(es), ${sesiones.length} sesión(es) ` +
    `de sub-bot (${sesiones.length} registradas de ${totalCarpetas} carpetas con creds). ` +
    `Carril 0 reservado para el bot principal y el panel.`
  )
  await arrancarTodos()
}
