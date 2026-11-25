import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

// Procesos que no pueden existir dos veces en el mismo servidor. Los workers
// de sub-bots sí son varios (subbot-<pid>.json), por eso no llevan candado.
const UNICOS = new Set(['supervisor', 'primary', 'web'])
// Un registro de otro host sin latido reciente se considera basura de un
// contenedor anterior. En el mismo host manda el PID.
const MAX_EDAD_REGISTRO_MS = 6 * 60 * 60 * 1000

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
      return () => {
        try { fs.unlinkSync(ruta) } catch {}
      }
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
      const info = leerJson(ruta)
      if (info && activo(info) && info.pid !== process.pid) {
        throw new Error(
          `Ya hay un ${kind} activo (PID ${info.pid}). ` +
          'Detén ese proceso antes de iniciar otro; dos instancias abren las mismas sesiones de WhatsApp y provocan 440/Bad MAC.'
        )
      }
      // Candado huérfano: se retira y se reintenta una vez.
      try { fs.unlinkSync(ruta) } catch {}
    }
  }
  throw new Error(`No se pudo obtener el candado de ${kind}.`)
}

export function acquireRuntimeLease(directory, kind) {
  fs.mkdirSync(directory, { recursive: true })
  if (maintenanceActive(directory)) {
    throw new Error('Hay una restauración de datos en curso. No se inicia el bot.')
  }

  const folder = path.join(directory, 'runtime-pids')
  fs.mkdirSync(folder, { recursive: true })
  limpiarRegistrosMuertos(folder)

  // El candado se toma ANTES de escribir el registro del PID: si hay otra
  // instancia viva, este proceso no debe llegar a conectar ningún socket.
  const releaseLock = UNICOS.has(kind) ? candadoUnico(folder, kind) : null
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
