console.log('⧉ Inicializando Pain...')

import { fork } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import {
  assignSessions,
  groupIdForSession,
  addedSessions,
  canStartSessions,
  removedSessions,
  sesionPrincipalRegistrada as leerSesionPrincipalRegistrada,
  subBotsPermitidos
} from './lib/process-isolation.js'
import { ARCHIVO_REENLACE_PENDIENTE } from './lib/subbot-recovery.js'
import { ArchivoSqliteCompartido } from './lib/db-sqlite.js'
import { crearCoordinadorSubme } from './lib/subme-coordinator.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const mainPath = join(__dirname, 'main.js')

try {
  const { default: cfonts } = await import('cfonts')
  cfonts.say('PAIN\nBOT', { font: 'block', align: 'center', gradient: ['cyan', 'blue'] })
  cfonts.say('WhatsApp Multi-Bot-Official', { font: 'simple', align: 'center', gradient: ['blue', 'white'] })
} catch {
  console.log('PAIN BOT')
}

await import('./config.js')
console.log('Verificando base compartida antes de iniciar los procesos...')
await new ArchivoSqliteCompartido(
  join(__dirname, 'storage', 'databases', 'database.sqlite'),
  join(__dirname, 'storage', 'databases', 'database.json')
).read()
console.log('Base compartida lista.')
const subbotRoot = resolve(__dirname, global.bot || 'Serbot')
const slots = new Map()
const leasedSessions = new Set()
const pendingLeaseRequests = new Map()
const pendingSessionRemovals = new Set()
// /subme: el principal reparte la orden y cada worker responde con su conteo.
const coordinadorSubme = crearCoordinadorSubme({
  alTerminar: (resumen) => {
    const primary = slots.get('primary')?.child
    if (!primary?.connected) return
    primary.send({
      type: 'subme-ack',
      requestId: resumen.requestId,
      workers: resumen.workers,
      enviados: resumen.enviados,
      fallidos: resumen.fallidos,
    }, () => {})
  },
})
let stopping = false
let scanTimer
// Sesión del bot principal: mientras no exista, el principal está en modo
// emparejamiento y los sub-bots deben esperar (no tiene sentido conectar
// 150 sub-bots mientras el usuario sigue escribiendo el código).
const MAIN_SESSION_FILE = join(__dirname, 'sessions', 'creds.json')
let principalVinculado = false
let sesionRegistradaEnDisco = false
let ultimaLecturaSesion = 0

function existeSesionPrincipal() {
  try {
    if (Date.now() - ultimaLecturaSesion < 3000) return sesionRegistradaEnDisco
    ultimaLecturaSesion = Date.now()
    sesionRegistradaEnDisco = leerSesionPrincipalRegistrada(MAIN_SESSION_FILE)
    return sesionRegistradaEnDisco
  } catch {
    sesionRegistradaEnDisco = false
    return false
  }
}

function subBotsPermitidosAhora() {
  return subBotsPermitidos({
    principalVinculado,
    sesionRegistrada: existeSesionPrincipal(),
  })
}
const STOP_TIMEOUT_MS = 10_000
const RESTART_MAX_MS = 30_000
const STABLE_MS = 60_000
// Generación joven más grande: el GC llegó a ocupar ~20 % del tiempo por la cantidad de objetos pequeños.
const SEMI_SPACE_MB = Math.min(Math.max(Number.parseInt(process.env.PAIN_SEMI_SPACE_MB, 10) || 16, 16), 128)
// Tope de heap por proceso: con 150+ subbots un worker descontrolado podía
// crecer hasta llenar los 8 GB del VPS. Al llegar al tope, Node hace GC fuerte
// y, si de verdad no alcanza, el supervisor reinicia solo ese worker.
const HEAP_WORKER_MB = Math.min(
  Math.max(Number.parseInt(process.env.PAIN_WORKER_HEAP_MB, 10) || 896, 256),
  4096
)
const HEAP_PRIMARY_MB = Math.min(
  Math.max(Number.parseInt(process.env.PAIN_PRIMARY_HEAP_MB, 10) || 1024, 256),
  4096
)
const EXEC_ARGV_BASE = process.execArgv.filter((arg) =>
  arg !== '--expose-gc' && !/^--max-old-space-size=/.test(arg) && !/^--max-semi-space-size=/.test(arg)
)

function listSessions() {
  if (!existsSync(subbotRoot)) return []
  return readdirSync(subbotRoot).filter((folder) => {
    if (!/^[a-zA-Z0-9_-]+$/.test(folder)) return false
    try {
      const sessionPath = join(subbotRoot, folder)
      return statSync(sessionPath).isDirectory() && (
        existsSync(join(sessionPath, 'creds.json')) ||
        existsSync(join(sessionPath, ARCHIVO_REENLACE_PENDIENTE))
      )
    } catch {
      return false
    }
  }).filter((folder) => !leasedSessions.has(folder)).sort()
}

function makeTargets() {
  const targets = new Map([['primary', { role: 'primary', sessions: [] }]])
  for (const [id, sessions] of assignSessions(listSessions())) {
    targets.set(id, { role: 'subbot', sessions })
  }
  return targets
}

function fingerprint(target) {
  return JSON.stringify({ role: target.role, sessions: target.sessions })
}

function ensureTarget(id, target) {
  const wantedFingerprint = fingerprint(target)
  let slot = slots.get(id)
  if (slot && slot.fingerprint !== wantedFingerprint) {
    if (slot.child) return
    if (slot.restartTimer) clearTimeout(slot.restartTimer)
    slots.delete(id)
    slot = null
  }
  if (!slot) {
    slot = {
      target,
      fingerprint: wantedFingerprint,
      child: null,
      failures: 0,
      restartAt: 0,
      startedAt: 0,
      stopping: false,
      restartTimer: null,
      forceTimer: null
    }
    slots.set(id, slot)
  }
  startSlot(id, slot)
}

function removeSessionFromWorker(slot, target, session, { handoff = false } = {}) {
  const removed = removedSessions(slot.target.sessions, target.sessions)
  if (!removed?.includes(session) || !slot.child?.connected) return false

  const child = slot.child
  const previousTarget = slot.target
  const previousFingerprint = slot.fingerprint
  const queued = child.send({ type: 'remove-sessions', sessions: [session], handoff }, (error) => {
    if (error) {
      console.error(
        `No se pudieron cerrar las sesiones eliminadas en ${previousTarget.role}:`,
        error.message
      )
      pendingSessionRemovals.delete(session)
      if (slot.child === child) {
        slot.target = previousTarget
        slot.fingerprint = previousFingerprint
        reconcile()
      }
    }
  })
  if (!queued) return false

  if (handoff) pendingSessionRemovals.add(session)
  console.log(
    `Actualizando ${slot.target.role} sin reiniciar el worker; ` +
    `se eliminó la sesión ${session}.`
  )
  slot.target = target
  slot.fingerprint = fingerprint(target)
  return true
}

function addSessionsToWorker(slot, target) {
  const added = addedSessions(slot.target.sessions, target.sessions)
  if (!added || !slot.child?.connected) return false

  const child = slot.child
  const previousTarget = slot.target
  const previousFingerprint = slot.fingerprint
  const queued = child.send({ type: 'add-sessions', sessions: added }, (error) => {
    if (error) {
      console.error(`No se pudieron iniciar las nuevas sesiones en ${previousTarget.role}:`, error.message)
      if (slot.child === child) {
        slot.target = previousTarget
        slot.fingerprint = previousFingerprint
        reconcile()
      }
    }
  })
  if (!queued) return false

  slot.target = target
  slot.fingerprint = fingerprint(target)
  console.log(
    `Actualizando ${slot.target.role} sin reiniciar el worker; ` +
    `${added.length} sesión(es) nueva(s).`
  )
  return true
}

// Los grupos de sub-bots no arrancan a la vez: cada uno espera su turno para no saturar la CPU.
function startDelayMs(id) {
  const n = Number.parseInt(/^subbot-group-(\d+)$/.exec(id)?.[1], 10)
  return Number.isInteger(n) ? 4_000 + n * 12_000 : 0
}

function startSlot(id, slot) {
  if (stopping || slot.child || Date.now() < slot.restartAt) return
  // El principal manda la señal cuando termina de vincularse; hasta entonces
  // los workers de sub-bots se quedan en espera (no se lanzan ni se conectan).
  if (slot.target.role === 'subbot' && !subBotsPermitidosAhora()) {
    if (!slot.esperandoVinculacion) {
      slot.esperandoVinculacion = true
      console.log(
        '[supervisor] El bot principal todavía no está vinculado: ' +
        'los sub-bots esperan a que termines el emparejamiento.'
      )
    }
    return
  }
  slot.esperandoVinculacion = false
  const liveAssignments = [...slots]
    .filter(([ownerId, owner]) => owner.child && owner.child.exitCode === null && owner.child.signalCode === null)
    .map(([ownerId, owner]) => [ownerId, owner.target.sessions])
  if (!canStartSessions(slot.target.sessions, liveAssignments, id)) return
  slot.stopping = false
  slot.startedAt = Date.now()
  const child = fork(mainPath, process.argv.slice(2), {
    cwd: __dirname,
    execArgv: [
      ...EXEC_ARGV_BASE,
      '--expose-gc',
      `--max-semi-space-size=${SEMI_SPACE_MB}`,
      `--max-old-space-size=${slot.target.role === 'primary' ? HEAP_PRIMARY_MB : HEAP_WORKER_MB}`,
    ],
    env: {
      ...process.env,
      PAIN_ROLE: slot.target.role,
      PAIN_WORKER_ID: id,
      PAIN_START_DELAY_MS: String(startDelayMs(id)),
      PAIN_SESSIONS_JSON: JSON.stringify(slot.target.sessions)
    },
    stdio: ['inherit', 'inherit', 'inherit', 'ipc']
  })
  slot.child = child
  child.on('message', (message) => {
    if (slot.child !== child) return
    if (message?.type === 'session-removed' && /^[a-zA-Z0-9_-]+$/.test(message.session || '')) {
      pendingSessionRemovals.delete(message.session)
      const primary = slots.get('primary')?.child
      if (primary) resolveLeaseRequests(primary)
      return
    }
    if (message?.type === 'remove-session' && /^[a-zA-Z0-9_-]+$/.test(message.session || '')) {
      const groupId = groupIdForSession(message.session)
      const target = makeTargets().get(groupId)
      const worker = slots.get(groupId)
      if (target && worker) removeSessionFromWorker(worker, target, message.session)
      reconcile()
      return
    }
    if (message?.type === 'session-added' && /^[a-zA-Z0-9_-]+$/.test(message.session || '')) {
      const groupId = groupIdForSession(message.session)
      const target = makeTargets().get(groupId)
      const worker = slots.get(groupId)
      if (target && worker) addSessionsToWorker(worker, target)
      reconcile()
      return
    }
    if (message?.type === 'send-private-result' && typeof message.requestId === 'string') {
      coordinadorSubme.resultado(message.requestId, id, {
        enviados: message.enviados,
        fallidos: message.fallidos,
      })
      return
    }
    if (message?.type === 'reconcile-sessions') {
      reconcile()
      return
    }
    if (message?.type === 'primary-linked') {
      if (id !== 'primary') return
      // El principal terminó de vincularse: ahora sí arrancan los sub-bots.
      // Este testigo se queda en true durante toda la ejecución del supervisor:
      // si más adelante el principal se desvincula, los sub-bots que ya están
      // conectados siguen funcionando (y se reinician solos si hace falta).
      principalVinculado = true
      console.log('[supervisor] Bot principal vinculado: arrancan los sub-bots.')
      reconcile()
      return
    }
    if (message?.type === 'primary-unlinked') {
      if (id !== 'primary') return
      console.log(
        '[supervisor] El bot principal se desvinculó: ' +
        'los sub-bots que ya estaban conectados siguen funcionando.'
      )
      return
    }
    if ((message === 'reset' || message === 'restart') && id === 'primary') {
      stopSlot(id, slot)
      return
    }
    if (id !== 'primary' || !message || typeof message !== 'object') return
    if (message.type === 'request-send-private' && typeof message.requestId === 'string' &&
        typeof message.jid === 'string' && typeof message.text === 'string') {
      const workerIds = []
      for (const [workerId, worker] of slots) {
        if (workerId === 'primary' || !worker.child?.connected) continue
        workerIds.push(workerId)
        worker.child.send({
          type: 'send-private',
          requestId: message.requestId,
          jid: message.jid,
          text: message.text,
        }, () => {})
      }
      coordinadorSubme.registrar(message.requestId, workerIds)
      return
    }
    if (message.type === 'lease-session' && /^[a-zA-Z0-9_-]+$/.test(message.session || '') &&
        typeof message.requestId === 'string') {
      leasedSessions.add(message.session)
      pendingLeaseRequests.set(message.requestId, message.session)
      const groupId = groupIdForSession(message.session)
      const target = makeTargets().get(groupId)
      const worker = slots.get(groupId)
      if (target && worker) {
        removeSessionFromWorker(worker, target, message.session, { handoff: true })
      }
      reconcile()
      resolveLeaseRequests(child)
      return
    }
    if (message.type === 'release-session' && /^[a-zA-Z0-9_-]+$/.test(message.session || '')) {
      leasedSessions.delete(message.session)
      for (const [requestId, session] of pendingLeaseRequests) {
        if (session === message.session) pendingLeaseRequests.delete(requestId)
      }
      const groupId = groupIdForSession(message.session)
      const target = makeTargets().get(groupId)
      const worker = slots.get(groupId)
      if (target && worker) addSessionsToWorker(worker, target)
      reconcile()
      return
    }
    if (message.type === 'request-reconnect-one' && typeof message.requestId === 'string' &&
        /^[a-zA-Z0-9_-]+$/.test(message.session || '')) {
      const groupId = groupIdForSession(message.session)
      const worker = slots.get(groupId)
      let dispatched = false
      if (worker?.child?.connected) {
        dispatched = worker.child.send(
          { type: 'reconnect-sessions', sessions: [message.session] },
          () => {}
        ) !== false
      }
      if (child.connected) {
        child.send({
          type: 'reconnect-one-ack',
          requestId: message.requestId,
          session: message.session,
          dispatched,
          worker: groupId
        }, () => {})
      }
      return
    }
    if (message.type === 'request-reconnect-all' && typeof message.requestId === 'string') {
      const desired = makeTargets()
      let workers = 0
      let sessions = 0
      for (const [workerId, target] of desired) {
        if (workerId === 'primary') continue
        const worker = slots.get(workerId)
        if (!worker?.child?.connected) continue
        const ok = worker.child.send(
          { type: 'reconnect-sessions', sessions: target.sessions },
          () => {}
        ) !== false
        if (ok) {
          workers++
          sessions += target.sessions.length
        }
      }
      if (child.connected) {
        child.send({
          type: 'reconnect-all-ack',
          requestId: message.requestId,
          dispatched: workers > 0,
          workers,
          sessions
        }, () => {})
      }
      return
    }
  })
  child.on('error', (error) => console.error(`Error del proceso ${id}:`, error?.message || error))
  child.on('exit', (code, signal) => {
    if (slot.child !== child) return
    slot.child = null
    if (slot.forceTimer) clearTimeout(slot.forceTimer)
    slot.forceTimer = null
    const stoppedIntentionally = slot.stopping || stopping
    slot.stopping = false
    if (id === 'primary') {
      for (const lease of leasedSessions) leasedSessions.delete(lease)
      pendingLeaseRequests.clear()
    }
    if (stoppedIntentionally) {
      slots.delete(id)
      if (!stopping) reconcile()
      else finishShutdownIfReady()
      return
    }
    const runtime = Date.now() - slot.startedAt
    if (runtime >= STABLE_MS) slot.failures = 0
    const delay = Math.min(1000 * (2 ** slot.failures++), RESTART_MAX_MS)
    slot.restartAt = Date.now() + delay
    console.error(
      `Proceso ${id} terminó (código ${code ?? 'desconocido'}, señal ${signal || 'ninguna'}). ` +
      `Se reiniciará en ${delay / 1000}s.`
    )
    slot.restartTimer = setTimeout(() => {
      slot.restartTimer = null
      reconcile()
    }, delay)
    slot.restartTimer.unref?.()
    reconcile()
  })
}

function stopSlot(id, slot) {
  if (!slot.child) {
    if (slot.restartTimer) clearTimeout(slot.restartTimer)
    slots.delete(id)
    return
  }
  if (slot.stopping) return
  slot.stopping = true
  slot.child.kill('SIGTERM')
  slot.forceTimer = setTimeout(() => {
    if (slot.child && slot.child.exitCode === null && slot.child.signalCode === null) {
      slot.child.kill('SIGKILL')
    }
  }, STOP_TIMEOUT_MS)
}

function resolveLeaseRequests(primaryChild) {
  const liveAssignments = [...slots]
    .filter(([id, slot]) => id !== 'primary' && slot.child &&
      slot.child.exitCode === null && slot.child.signalCode === null)
    .flatMap(([, slot]) => slot.target.sessions)
  for (const [requestId, session] of pendingLeaseRequests) {
    if (pendingSessionRemovals.has(session)) continue
    if (liveAssignments.includes(session)) continue
    pendingLeaseRequests.delete(requestId)
    if (primaryChild.connected) {
      primaryChild.send({ type: 'lease-session-ack', requestId, session })
    }
  }
}

function reconcile() {
  if (stopping) return
  const desired = makeTargets()
  for (const [id, slot] of slots) {
    const target = desired.get(id)
    if (!target || fingerprint(target) !== slot.fingerprint) {
      if (target && id !== 'primary' &&
          addSessionsToWorker(slot, target)) continue
      stopSlot(id, slot)
      continue
    }
  }

  const drainingSubbot = [...slots].some(([id, slot]) => {
    const target = desired.get(id)
    return slot.target.role === 'subbot' && slot.child &&
      (!target || fingerprint(target) !== slot.fingerprint)
  })
  const primaryTarget = desired.get('primary')
  if (primaryTarget) ensureTarget('primary', primaryTarget)
  if (drainingSubbot) return

  for (const [id, target] of desired) {
    if (id !== 'primary') ensureTarget(id, target)
  }
  const primary = slots.get('primary')?.child
  if (primary) resolveLeaseRequests(primary)
}

function finishShutdownIfReady() {
  if ([...slots.values()].some(({ child }) => child)) return
  clearTimeout(shutdownTimer)
  process.exit(0)
}

let shutdownTimer
function shutdown(signal) {
  if (stopping) return
  stopping = true
  clearInterval(scanTimer)
  for (const [id, slot] of slots) {
    if (slot.restartTimer) clearTimeout(slot.restartTimer)
    if (slot.child) stopSlot(id, slot)
    else slots.delete(id)
  }
  shutdownTimer = setTimeout(() => {
    for (const slot of slots.values()) {
      if (slot.child) slot.child.kill('SIGKILL')
    }
    process.exit(1)
  }, STOP_TIMEOUT_MS + 1000)
  shutdownTimer.unref?.()
  finishShutdownIfReady()
  console.log(`Supervisor apagando por ${signal}.`)
}

process.once('SIGINT', () => shutdown('SIGINT'))
process.once('SIGTERM', () => shutdown('SIGTERM'))

reconcile()
scanTimer = setInterval(reconcile, 20_000)
