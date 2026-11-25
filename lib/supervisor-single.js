/**
 * Supervisor de proceso único (estilo GataBot-MD).
 *
 * Un solo proceso `main.js` hospeda:
 *   - el bot principal,
 *   - TODOS los sub-bots (global.conns),
 *   - el panel web (en un proceso HTTP aparte, como siempre).
 *
 * Los plugins se cargan UNA vez en ese proceso. No hay workers por grupo, no
 * hay asignación por hash, no hay locks de handshake entre procesos y no se
 * reinicia un grupo de 38 bots por quitar una sesión.
 *
 * El supervisor solo vigila el proceso: si muere, lo reinicia con backoff.
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

const RAM_TOTAL_MB = Math.max(1024, Math.floor(os.totalmem() / 1048576))
function heapAutomaticoMb() {
  const porcentaje = enteroEnv('PAIN_SINGLE_HEAP_PERCENT', 35, 10, 50)
  return Math.min(
    Math.max(Math.floor((RAM_TOTAL_MB * porcentaje) / 100), 2560),
    5120
  )
}
const HEAP_MB = enteroEnv('PAIN_SINGLE_HEAP_MB', heapAutomaticoMb(), 768, 6144)
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
        return false
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
      `${new Date().toISOString()} — últimas líneas del proceso único (código ${code ?? '?'})\n\n` +
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
    `--max-semi-space-size=${SEMI_SPACE_MB}`,
    `--max-old-space-size=${HEAP_MB}`,
  ]
}

export async function startSingleSupervisor() {
  let child = null
  let stopping = false
  let stoppingChild = false
  let failures = 0
  let fallosRapidos = 0
  let startedAt = 0
  let restartTimer = null
  let forceTimer = null
  let tail = []

  const log = (...args) => console.log('[supervisor]', ...args)

  function programarRearranque(motivo) {
    if (stopping) return
    const runtime = Date.now() - startedAt
    if (runtime >= STABLE_MS) failures = 0
    if (runtime < FALLO_RAPIDO_MS) fallosRapidos++
    else fallosRapidos = 0
    const pausaLarga = fallosRapidos >= FALLOS_RAPIDOS_ANTES_DE_PAUSA
    const delay = pausaLarga
      ? PAUSA_TRAS_FALLOS_RAPIDOS_MS
      : Math.min(1000 * (2 ** failures++), RESTART_MAX_MS)
    if (pausaLarga) fallosRapidos = 0
    console.error(
      `[supervisor] El proceso único terminó (${motivo}). Se reinicia en ` +
      `${Math.round(delay / 1000)}s.`
    )
    restartTimer = setTimeout(() => {
      restartTimer = null
      arrancar()
    }, delay)
  }

  function arrancar() {
    if (stopping || child) return
    const sesiones = listaSesiones()
    const totalCarpetas = contarCarpetasConCreds()
    startedAt = Date.now()
    tail = []
    let nuevo
    try {
      nuevo = fork(MAIN, process.argv.slice(2), {
        cwd: ROOT,
        execArgv: argumentosDeNode(),
        env: {
          ...process.env,
          PAIN_ROLE: 'primary',
          PAIN_WORKER_ID: 'primary',
          PAIN_SESSIONS_JSON: JSON.stringify(sesiones),
          PAIN_RSS_ALERT_MB: String(RSS_ALERT_MB),
          PAIN_GC_MIN_MB: process.env.PAIN_GC_MIN_MB || '1536',
          PAIN_GC_MANUAL: process.env.PAIN_SINGLE_GC_MANUAL || '0',
          PAIN_MAX_MSG_CACHE: process.env.PAIN_MAX_MSG_CACHE || '12000',
          PAIN_MAX_MSG_CHAT: process.env.PAIN_MAX_MSG_CHAT || '50',
          PAIN_MAX_CHATS_SOCKET: process.env.PAIN_MAX_CHATS_SOCKET || '200',
          PAIN_MAX_GROUP_META: process.env.PAIN_MAX_GROUP_META || '400',
          PAIN_META_FETCH_MAX_MS: process.env.PAIN_META_FETCH_MAX_MS || '1500',
          PAIN_SUBBOT_START_DELAY_MS: process.env.PAIN_SUBBOT_START_DELAY_MS || '3000',
          PAIN_SUBBOT_FOLLOW_CHANNELS: process.env.PAIN_SUBBOT_FOLLOW_CHANNELS || '0',
          UV_THREADPOOL_SIZE: process.env.UV_THREADPOOL_SIZE || '8',
        },
        stdio: ['inherit', 'inherit', 'pipe', 'ipc'],
      })
    } catch (error) {
      console.error('[supervisor] No se pudo iniciar el proceso único:', error?.message || error)
      programarRearranque('error al crear el proceso')
      return
    }
    child = nuevo
    stoppingChild = false

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
          tail.push(linea.slice(0, 500))
          if (tail.length > TAIL_LINEAS) tail.shift()
        }
      })
      nuevo.stderr.on('error', () => {})
    }

    nuevo.on('message', (message) => {
      if (typeof message === 'string') {
        if (message === 'reset' || message === 'restart') {
          log('el proceso pidió reinicio.')
          detenerHijo('reset')
        }
        return
      }
      if (!message || typeof message !== 'object') return
      if (message.type === 'primary-linked') {
        log('bot principal vinculado; sub-bots gestionados en el mismo proceso.')
        return
      }
      if (message.type === 'primary-unlinked') {
        log('el bot principal quedó desvinculado; se puede revincular desde el panel.')
        return
      }
      // Mensajes del supervisor clásico que ya no se usan en modo único.
      if (message.type === 'reconnect-all-ack' ||
          message.type === 'reconnect-one-ack' ||
          message.type === 'reload-all-ack' ||
          message.type === 'subme-ack' ||
          message.type === 'lease-session-ack' ||
          message.type === 'session-removed') {
        return
      }
    })

    nuevo.on('error', (error) => {
      console.error('[supervisor] error del proceso único:', error?.message || error)
    })

    nuevo.on('exit', (code, signal) => {
      if (child !== nuevo) return
      child = null
      if (forceTimer) clearTimeout(forceTimer)
      forceTimer = null
      if (stopping || stoppingChild) {
        if (stopping) {
          clearTimeout(shutdownTimer)
          process.exit(0)
        }
        stoppingChild = false
        arrancar()
        return
      }
      const motivo = `código ${code ?? 'desconocido'}${signal ? `, señal ${signal}` : ''}`
      if (code !== 0 && tail.length) {
        console.error('[supervisor] últimas líneas antes de salir:')
        for (const linea of tail.slice(-15)) console.error(`  ${linea}`)
        const archivo = volcarCrash(tail, code)
        if (archivo) console.error(`[supervisor] log guardado en ${archivo}`)
      }
      if (code === 134) {
        console.error(
          `[supervisor] Heap agotado en el proceso único. Sube ` +
          `PAIN_SINGLE_HEAP_MB (actual ${HEAP_MB} MB).`
        )
      }
      programarRearranque(motivo)
    })

    log(
      `proceso único iniciado (PID ${nuevo.pid}), ${sesiones.length} sesión(es) ` +
      `de sub-bot (${sesiones.length} registradas de ${totalCarpetas} carpetas con creds), heap ${HEAP_MB} MB (RAM ${RAM_TOTAL_MB} MB).`
    )
  }

  function detenerHijo(motivo) {
    if (!child) return
    stoppingChild = true
    log(`deteniendo proceso único (${motivo}).`)
    const actual = child
    try { actual.send({ type: 'shutdown' }, () => {}) } catch {}
    try { actual.kill('SIGTERM') } catch {}
    forceTimer = setTimeout(() => {
      if (actual.exitCode === null && actual.signalCode === null) {
        try { actual.kill('SIGKILL') } catch {}
      }
    }, STOP_TIMEOUT_MS)
    forceTimer.unref?.()
  }

  let shutdownTimer
  function apagar(signal) {
    if (stopping) return
    stopping = true
    if (restartTimer) clearTimeout(restartTimer)
    detenerHijo(signal)
    shutdownTimer = setTimeout(() => {
      if (child) {
        try { child.kill('SIGKILL') } catch {}
      }
      process.exit(1)
    }, STOP_TIMEOUT_MS + 2000)
    shutdownTimer.unref?.()
    if (!child) process.exit(0)
  }

  process.once('SIGINT', () => apagar('SIGINT'))
  process.once('SIGTERM', () => apagar('SIGTERM'))

  arrancar()
}
