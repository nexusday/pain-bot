import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

function alive(info) {
  if (info.host !== os.hostname()) return true
  try {
    process.kill(info.pid, 0)
    return true
  } catch (error) {
    return error.code !== 'ESRCH'
  }
}
function maintenanceActive(directory) {
  const lock = path.join(directory, 'restore.lock')
  if (!fs.existsSync(lock)) return false
  try {
    const info = JSON.parse(
      fs.readFileSync(path.join(lock, 'owner.json'), 'utf8')
    )
    if (alive(info)) return true
    if (fs.existsSync(path.join(lock,'journal.json'))) return true
    try{fs.unlinkSync(path.join(lock,'journal.json.tmp'))}catch{}
    fs.unlinkSync(path.join(lock, 'owner.json'))
    fs.rmdirSync(lock)
    return false
  } catch {
    return true
  }
}
export function acquireRuntimeLease(directory, kind) {
  fs.mkdirSync(directory, { recursive: true })
  if (maintenanceActive(directory))
    throw new Error(
      'Hay una restauración de datos en curso. No se inicia el bot.'
    )
  const folder = path.join(directory, 'runtime-pids')
  fs.mkdirSync(folder, { recursive: true })
  const filename = path.join(folder, `${kind}-${process.pid}.json`)
  fs.writeFileSync(
    filename,
    JSON.stringify({ pid: process.pid, host: os.hostname(), kind }),
    { mode: 0o600 }
  )
  const release = () => {
    try {
      fs.unlinkSync(filename)
    } catch {}
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
    const owner=JSON.parse(fs.readFileSync(path.join(lock,'owner.json'),'utf8'))
    if(!recovery || alive(owner))throw new Error('Hay una restauración en curso o interrumpida. Revisa restore-recovery antes de iniciar el bot.')
  } else fs.mkdirSync(lock, { mode: 0o700 })
  fs.writeFileSync(
    path.join(lock, 'owner.json'),
    JSON.stringify({ pid: process.pid, host: os.hostname() }),
    { mode: 0o600 }
  )
  const release = () => {
    if(fs.existsSync(path.join(lock,'journal.json')))return
    try {
      try{fs.unlinkSync(path.join(lock,'journal.json.tmp'))}catch{}
      fs.unlinkSync(path.join(lock, 'owner.json'))
      fs.rmdirSync(lock)
    } catch {}
  }
  try {
    const folder = path.join(directory, 'runtime-pids')
    for (const file of fs.existsSync(folder) ? fs.readdirSync(folder) : []) {
      if (!/^(?:supervisor|primary|subbot|web)-\d+\.json$/.test(file)) continue
      const record = JSON.parse(
        fs.readFileSync(path.join(folder, file), 'utf8')
      )
      if (alive(record))
        throw new Error(
          `Detén primero el bot y la web. Sigue activo ${record.kind} (PID ${record.pid}).`
        )
    }
    return release
  } catch (error) {
    release()
    throw error
  }
}
