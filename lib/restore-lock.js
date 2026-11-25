/**
 * Candado para restauraciones de backup: mientras se reemplazan las bases no
 * debe haber bot ni panel escribiendo. Es independiente del candado de
 * instancia única; solo comprueba que no haya procesos vivos.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

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
  if (!info.host || info.host === os.hostname()) {
    try {
      process.kill(info.pid, 0)
      return true
    } catch (error) {
      return error?.code !== 'ESRCH'
    }
  }
  const creado = Date.parse(info.startedAt || info.at || '') || 0
  return creado > 0 && Date.now() - creado < MAX_EDAD_REGISTRO_MS
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

/** ¿Hay una restauración de backup en curso o pendiente? */
export function restauracionEnCurso(directory) {
  return maintenanceActive(path.resolve(directory))
}

export function acquireRestoreLock(directory, { recovery = false } = {}) {
  const carpeta = path.resolve(directory)
  fs.mkdirSync(carpeta, { recursive: true })
  const lock = path.join(carpeta, 'restore.lock')
  if (maintenanceActive(carpeta)) {
    const owner = leerJson(path.join(lock, 'owner.json'))
    if (!recovery || activo(owner)) {
      throw new Error('Hay una restauración en curso o interrumpida. Revisa restore-recovery antes de iniciar el bot.')
    }
  } else {
    fs.mkdirSync(lock, { mode: 0o700 })
  }
  fs.writeFileSync(
    path.join(lock, 'owner.json'),
    JSON.stringify({ pid: process.pid, host: os.hostname(), startedAt: new Date().toISOString() }),
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
    for (const nombre of ['supervisor.lock', 'primary.lock', 'web.lock']) {
      const record = leerJson(path.join(carpeta, nombre))
      if (activo(record)) {
        throw new Error(
          `Detén primero el bot y la web. Sigue activo ${record.rol || nombre} (PID ${record.pid}).`
        )
      }
    }
    return release
  } catch (error) {
    release()
    throw error
  }
}
