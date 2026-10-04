import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const STATUS_DIRECTORY = path.join('storage', 'process-status')
const WORKER_ID_PATTERN = /^[a-zA-Z0-9_-]+$/
const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]+$/

function rutaEstado(rootDir, workerId) {
  return path.join(rootDir, STATUS_DIRECTORY, `${workerId}.json`)
}

export function writeSubbotWorkerStatus(rootDir, workerId, sessions) {
  if (!WORKER_ID_PATTERN.test(workerId) || !Array.isArray(sessions)) {
    throw new TypeError('El identificador del worker y la lista de sesiones deben ser válidos.')
  }
  const directory = path.join(rootDir, STATUS_DIRECTORY)
  fs.mkdirSync(directory, { recursive: true })
  const destination = rutaEstado(rootDir, workerId)
  const temporary = `${destination}.${process.pid}.tmp`
  const status = {
    workerId,
    pid: process.pid,
    host: os.hostname(),
    updatedAt: Date.now(),
    sessions: sessions.filter(session =>
      session && typeof session.folder === 'string' && SESSION_ID_PATTERN.test(session.folder)
    ),
  }
  fs.writeFileSync(temporary, `${JSON.stringify(status)}\n`, 'utf8')
  fs.renameSync(temporary, destination)
}

export function removeSubbotWorkerStatus(rootDir, workerId) {
  if (!WORKER_ID_PATTERN.test(workerId)) return false
  const destination = rutaEstado(rootDir, workerId)
  try {
    const status = JSON.parse(fs.readFileSync(destination, 'utf8'))
    if (status.pid !== process.pid) return false
    fs.rmSync(destination, { force: true })
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

export function readSubbotWorkerStatuses(rootDir, { maxAgeMs = 60_000, now = Date.now() } = {}) {
  const directory = path.join(rootDir, STATUS_DIRECTORY)
  let entries
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }

  const statuses = []
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue
    const file = path.join(directory, entry.name)
    try {
      const status = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (
        !WORKER_ID_PATTERN.test(status.workerId) ||
        status.workerId !== path.basename(entry.name, '.json') ||
        !Number.isInteger(status.pid) ||
        !Number.isFinite(status.updatedAt) ||
        now - status.updatedAt > maxAgeMs ||
        !Array.isArray(status.sessions)
      ) continue
      status.sessions = status.sessions.filter(session =>
        session &&
        typeof session.folder === 'string' &&
        SESSION_ID_PATTERN.test(session.folder) &&
        typeof session.connected === 'boolean'
      )
      statuses.push(status)
    } catch (error) {
      if (error?.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error
    }
  }
  return statuses
}
