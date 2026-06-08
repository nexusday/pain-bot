import { readFileSync, existsSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CMD18_PATH = join(__dirname, '../storage/cmd18.json')

let cmd18Cache = []
let cmd18Mtime = 0

export function ensureCmd18Db() {
  if (!global.db.data.cmd18) global.db.data.cmd18 = {}
  return global.db.data.cmd18
}

export function loadCmd18List() {
  try {
    if (!existsSync(CMD18_PATH)) return []

    const mtime = statSync(CMD18_PATH).mtimeMs
    if (mtime !== cmd18Mtime) {
      const raw = JSON.parse(readFileSync(CMD18_PATH, 'utf8'))
      const list = raw.comandos || raw.commands || []
      cmd18Cache = list.map(cmd => String(cmd).toLowerCase().trim()).filter(Boolean)
      cmd18Mtime = mtime
    }

    return cmd18Cache
  } catch (e) {
    console.error('Error leyendo cmd18.json:', e)
    return []
  }
}

export function isCmd18Command(command = '') {
  const cmd = String(command || '').toLowerCase().trim()
  if (!cmd) return false
  return loadCmd18List().includes(cmd)
}

export function isCmd18Enabled(chatId) {
  const db = ensureCmd18Db()
  return db[chatId] === true
}

export function isCmd18Blocked(chatId, command) {
  if (!isCmd18Command(command)) return false
  return !isCmd18Enabled(chatId)
}

export async function notifyCmd18Disabled(m, conn, usedPrefix = '.') {
  await conn.sendMessage(m.chat, {
    text: `🔞 *Comandos +18 desactivados en este grupo.*\n\nUn administrador debe activarlos con:\n> ${usedPrefix}cmd18 on`,
    contextInfo: { ...global.rcanal.contextInfo }
  }, { quoted: m }).catch(() => {})
}

export async function checkCmd18Command(m, conn, command, usedPrefix, isOwner, isROwner) {
  if (!m.isGroup || isOwner || isROwner) return false
  if (!isCmd18Blocked(m.chat, command)) return false

  await notifyCmd18Disabled(m, conn, usedPrefix)
  return true
}
