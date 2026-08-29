import fs from 'fs'
import path from 'path'
import { join } from 'path'

const DEFAULT_MAX = 3
const MIN_MAX = 1
const MAX_MAX = 80

function maxSubsPath() {
  return join(process.cwd(), 'storage', 'maxsubs.json')
}

function serbotRoot() {
  return join(process.cwd(), global.bot || 'Serbot')
}

function ensureMaxSubsFile() {
  const file = maxSubsPath()
  const dir = path.dirname(file)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify({ max: DEFAULT_MAX }, null, 2))
    return DEFAULT_MAX
  }

  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'))
    const max = Number(data?.max)
    if (!Number.isFinite(max) || max < MIN_MAX) return DEFAULT_MAX
    return Math.min(Math.floor(max), MAX_MAX)
  } catch {
    fs.writeFileSync(file, JSON.stringify({ max: DEFAULT_MAX }, null, 2))
    return DEFAULT_MAX
  }
}

export function getMaxSubs() {
  return ensureMaxSubsFile()
}

export function setMaxSubs(value) {
  const max = Math.floor(Number(value))
  if (!Number.isFinite(max) || max < MIN_MAX || max > MAX_MAX) {
    throw new Error(`El máximo debe ser un número entre ${MIN_MAX} y ${MAX_MAX}.`)
  }

  const file = maxSubsPath()
  const dir = path.dirname(file)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  fs.writeFileSync(file, JSON.stringify({ max }, null, 2))
  return max
}

/** Sub-bots registrados (carpeta Serbot con creds.json). No borra nada. */
export function listRegisteredSubBots() {
  const root = serbotRoot()
  if (!fs.existsSync(root)) return []

  return fs.readdirSync(root).filter(folder => {
    const folderPath = join(root, folder)
    try {
      return (
        fs.statSync(folderPath).isDirectory() &&
        fs.existsSync(join(folderPath, 'creds.json'))
      )
    } catch {
      return false
    }
  })
}

export function countRegisteredSubBots() {
  return listRegisteredSubBots().length
}

export function countConnectedSubBots(wsModule) {
  const CLOSED = wsModule?.CLOSED ?? 3
  if (!Array.isArray(global.conns)) return 0

  const active = global.conns.filter(
    conn => conn?.user && conn?.ws?.socket && conn.ws.socket.readyState !== CLOSED
  )
  return [...new Set(active)].length
}

/** true = puede vincular (nuevo o reconexión del mismo número). */
export function canRegisterSubBot(phoneNumber) {
  const id = String(phoneNumber || '').replace(/\D/g, '')
  if (!id) return { ok: false, reason: 'invalid' }

  const root = join(serbotRoot(), id)
  const alreadyExists = fs.existsSync(join(root, 'creds.json'))

  if (alreadyExists) {
    return { ok: true, reconnect: true, registered: countRegisteredSubBots(), max: getMaxSubs() }
  }

  const registered = countRegisteredSubBots()
  const max = getMaxSubs()

  if (registered >= max) {
    return { ok: false, reconnect: false, registered, max }
  }

  return { ok: true, reconnect: false, registered, max }
}

export function getSubBotSlotsInfo(wsModule) {
  const max = getMaxSubs()
  const registered = countRegisteredSubBots()
  const connected = countConnectedSubBots(wsModule)
  const available = Math.max(0, max - registered)

  return { max, registered, connected, available, list: listRegisteredSubBots() }
}
