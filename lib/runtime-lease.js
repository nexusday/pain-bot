import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

// Procesos que no pueden existir dos veces en el mismo servidor. Los workers
// de sub-bots sí son varios (subbot-<pid>.json), por eso no llevan candado.
const UNICOS = new Set(['supervisor', 'primary', 'web'])
// Un registro de otro host sin latido reciente se considera basura de un
// contenedor anterior. En el mismo host manda el PID.
const MAX_EDAD_REGISTRO_MS = 6 * 60 * 60 * 1000
// El dueño de un candado lo "toca" cada 30 s. Si pasan 2 minutos sin latido,
// el candado está muerto aunque su PID siga existiendo: en un contenedor los
// PID se reinician al reiniciar y el número puede pertenecer a otro programa.
const LATIDO_MS = 30_000
const MAX_SIN_LATIDO_MS = 120_000

function mantenerLatido(ruta) {
  const intervalo = setInterval(() => {
    try {
      const ahora = new Date()
      fs.utimesSync(ruta, ahora, ahora)
    } catch {
      clearInterval(intervalo)
    }
  }, LATIDO_MS)
  intervalo.unref?.()
  return () => clearInterval(intervalo)
}

function msSinLatido(ruta) {
  try {
    return Date.now() - fs.statSync(ruta).mtimeMs
  } catch {
    return 0
  }
}

function leerJson(ruta) {
  try {
    return JSON.parse(fs.readFileSync(ruta, 'utf8'))
  } catch {
    return null
  }
}

function activo(info) {
  if (!info || !Number.isInteger(info.pid) || info.pid <= 0) return false
  if (info.host === os.hostname()) {
    try {
      process.kill(info.pid, 0)
      return true
    } catch (error) {
      return error.code !== 'ESRCH'
    }
  }
  const creado = Number(info.startedAt || info.at || 0)
  if (!Number.isFinite(creado) || creado <= 0) return false
  return Date.now() - creado < MAX_EDAD_REGISTRO_MS
}

function maintenanceActive(directory) {
  const lock = path.join(directory, 'restore.lock')
  if (!fs.existsSync(lock)) return false
  try {
    const info = leerJson(path.join(lock, 'owner.json'))
    if (activo(info)) return true
    if (fs.existsSync(path.join(lock, 'journal.json'))) return true
    try { fs.unlinkSync(path.join(lock, 'journal.json.tmp')) } catch {}
    fs.unlinkSync(path.join(lock, 'owner.json'))
    fs.rmdirSync(lock)
    return false
  } catch {
    return true
  }
}

function limpiarRegistrosMuertos(folder) {
  let archivos = []
  try {
    archivos = fs.readdirSync(folder)
  } catch {
    return
  }
  for (const archivo of archivos) {
    if (!/^(?:supervisor|primary|subbot|web)-\d+\.json$/.test(archivo)) continue
    const ruta = path.join(folder, archivo)
    const info = leerJson(ruta)
    if (!activo(info)) {
      try { fs.unlinkSync(ruta) } catch {}
    }
  }
}

/**
 * En contenedores el espacio de PID se recicla rápido: el PID guardado en un
 * candado huérfano puede acabar perteneciendo a otro proceso. En Linux se
 * comprueba que ese PID sea realmente el programa esperado; si no, el candado
 * está muerto aunque `process.kill(pid, 0)` diga que sigue vivo.
 */
function procesoCoincide(pid, kind) {
  if (process.platform !== 'linux') return true
  try {
    const cmd = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ').trim()
    // Sin cmdline legible no se arriesga: se mantiene el comportamiento previo.
    if (!cmd) return true
    if (kind === 'supervisor') return cmd.includes('index.js')
    if (kind === 'web') return cmd.includes('worker.js')
    if (!cmd.includes('main.js')) return false
    // primary y subbot comparten main.js: el rol real está en el entorno.
    try {
      const env = fs.readFileSync(`/proc/${pid}/environ`, 'utf8')
      return env.includes('PAIN_ROLE=primary')
    } catch {
      return true
    }
  } catch {
    return true
  }
}

function candadoUnico(folder, kind) {
  const ruta = path.join(folder, `${kind}.lock`)
  for (let intento = 0; intento < 2; intento++) {
    try {
      fs.writeFileSync(
        ruta,
        JSON.stringify({
          pid: process.pid,
          host: os.hostname(),
          kind,
          startedAt: Date.now(),
        }),
        { flag: 'wx', mode: 0o600 }
      )
      const detenerLatido = mantenerLatido(ruta)
      return () => {
        detenerLatido()
        try { fs.unlinkSync(ruta) } catch {}
      }
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
      const info = leerJson(ruta)
      const sinLatido = msSinLatido(ruta) > MAX_SIN_LATIDO_MS
      if (
        info &&
        activo(info) &&
        info.pid !== process.pid &&
        !sinLatido &&
        procesoCoincide(Number(info.pid), kind)
      ) {
        throw new Error(
          `Ya hay un ${kind} activo (PID ${info.pid}). ` +
          'Detén ese proceso antes de iniciar otro; dos instancias abren las mismas sesiones de WhatsApp y provocan 440/Bad MAC.'
        )
      }
      // Candado huérfano, PID reciclado por otro programa o dueño sin latido:
      // se retira y se reintenta una vez. Queda constancia para diagnóstico.
      console.error(
        `[runtime] Candado ${kind}.lock obsoleto retirado ` +
        `(PID ${info?.pid ?? 'desconocido'}${sinLatido ? ', sin latido' : ''}).`
      )
      try { fs.unlinkSync(ruta) } catch {}
    }
  }
  throw new Error(`No se pudo obtener el candado de ${kind}.`)
}

export function acquireRuntimeLease(directory, kind, { unique = UNICOS.has(kind) } = {}) {
  fs.mkdirSync(directory, { recursive: true })
  if (maintenanceActive(directory)) {
    throw new Error('Hay una restauración de datos en curso. No se inicia el bot.')
  }

  const folder = path.join(directory, 'runtime-pids')
  fs.mkdirSync(folder, { recursive: true })
  limpiarRegistrosMuertos(folder)

  // El candado se toma ANTES de escribir el registro del PID: si hay otra
  // instancia viva, este proceso no debe llegar a conectar ningún socket.
  // `unique:false` mantiene el registro del PID (necesario para bloquear
  // restauraciones mientras el bot corre) pero no exige el candado.
  const releaseLock = unique && UNICOS.has(kind) ? candadoUnico(folder, kind) : null
  const filename = path.join(folder, `${kind}-${process.pid}.json`)
  fs.writeFileSync(
    filename,
    JSON.stringify({
      pid: process.pid,
      host: os.hostname(),
      kind,
      startedAt: Date.now(),
    }),
    { mode: 0o600 }
  )

  const release = () => {
    try { fs.unlinkSync(filename) } catch {}
    if (releaseLock) releaseLock()
  }

  if (maintenanceActive(directory)) {
    release()
    throw new Error('Hay una restauración en curso.')
  }
  process.once('exit', release)
  return () => {
    process.off('exit', release)
    release()
  }
}

export function acquireRestoreLock(directory, { recovery = false } = {}) {
  fs.mkdirSync(directory, { recursive: true })
  const lock = path.join(directory, 'restore.lock')
  if (maintenanceActive(directory)) {
    const owner = leerJson(path.join(lock, 'owner.json'))
    if (!recovery || activo(owner)) {
      throw new Error('Hay una restauración en curso o interrumpida. Revisa restore-recovery antes de iniciar el bot.')
    }
  } else {
    fs.mkdirSync(lock, { mode: 0o700 })
  }
  fs.writeFileSync(
    path.join(lock, 'owner.json'),
    JSON.stringify({ pid: process.pid, host: os.hostname() }),
    { mode: 0o600 }
  )
  const release = () => {
    if (fs.existsSync(path.join(lock, 'journal.json'))) return
    try {
      try { fs.unlinkSync(path.join(lock, 'journal.json.tmp')) } catch {}
      fs.unlinkSync(path.join(lock, 'owner.json'))
      fs.rmdirSync(lock)
    } catch {}
  }
  try {
    const folder = path.join(directory, 'runtime-pids')
    for (const file of fs.existsSync(folder) ? fs.readdirSync(folder) : []) {
      if (!/^(?:supervisor|primary|subbot|web)-\d+\.json$/.test(file)) continue
      const record = leerJson(path.join(folder, file))
      if (activo(record)) {
        throw new Error(
          `Detén primero el bot y la web. Sigue activo ${record.kind} (PID ${record.pid}).`
        )
      }
    }
    return release
  } catch (error) {
    release()
    throw error
  }
}
