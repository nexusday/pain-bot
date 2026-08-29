import fs from 'fs'
import path from 'path'
import { join } from 'path'

const MIN_MAX = 0

function maxSubsPath() {
  return join(process.cwd(), 'storage', 'maxsubs.json')
}

function serbotRoot() {
  return join(process.cwd(), global.bot || 'Serbot')
}

function parseMaxValue(raw) {
  const max = Math.floor(Number(raw))
  if (!Number.isFinite(max) || max < MIN_MAX) return 0
  return max
}

function ensureMaxSubsFile() {
  const file = maxSubsPath()
  const dir = path.dirname(file)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  if (!fs.existsSync(file)) return 0

  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'))
    return parseMaxValue(data?.max)
  } catch {
    return 0
  }
}

export function isUnlimitedSubBots(max = getMaxSubs()) {
  return !max || max <= 0
}

export function getMaxSubs() {
  return ensureMaxSubsFile()
}

export function setMaxSubs(value) {
  const max = parseMaxValue(value)
  if (!Number.isFinite(max) || max < MIN_MAX) {
    throw new Error('El máximo debe ser 0 (ilimitado) o un número mayor a 0.')
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
  const registered = countRegisteredSubBots()
  const max = getMaxSubs()

  if (alreadyExists) {
    return { ok: true, reconnect: true, registered, max, unlimited: isUnlimitedSubBots(max) }
  }

  if (isUnlimitedSubBots(max)) {
    return { ok: true, reconnect: false, registered, max, unlimited: true }
  }

  if (registered >= max) {
    return { ok: false, reconnect: false, registered, max, unlimited: false }
  }

  return { ok: true, reconnect: false, registered, max, unlimited: false }
}

export function getSubBotSlotsInfo(wsModule) {
  const max = getMaxSubs()
  const unlimited = isUnlimitedSubBots(max)
  const registered = countRegisteredSubBots()
  const connected = countConnectedSubBots(wsModule)
  const available = unlimited ? null : Math.max(0, max - registered)

  return { max, unlimited, registered, connected, available, list: listRegisteredSubBots() }
}
