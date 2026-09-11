import { readFileSync, existsSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RUTA_CMD18 = join(__dirname, '../storage/cmd18.json')

let cacheCmd18 = []
let mtimeCmd18 = 0

export function asegurarDbCmd18() {
  if (!global.db.data.cmd18) global.db.data.cmd18 = {}
  return global.db.data.cmd18
}

export function cargarListaCmd18() {
  try {
    if (!existsSync(RUTA_CMD18)) return []

    const mtime = statSync(RUTA_CMD18).mtimeMs
    if (mtime !== mtimeCmd18) {
      const crudo = JSON.parse(readFileSync(RUTA_CMD18, 'utf8'))
      const lista = crudo.comandos || crudo.commands || []
      cacheCmd18 = lista.map(cmd => String(cmd).toLowerCase().trim()).filter(Boolean)
      mtimeCmd18 = mtime
    }

    return cacheCmd18
  } catch (e) {
    console.error('Error leyendo cmd18.json:', e)
    return []
  }
}

export function esComandoCmd18(comando = '') {
  const cmd = String(comando || '').toLowerCase().trim()
  if (!cmd) return false
  return cargarListaCmd18().includes(cmd)
}

export function estaCmd18Activado(chatId) {
  const db = asegurarDbCmd18()
  return db[chatId] === true
}

export function estaCmd18Bloqueado(chatId, comando) {
  if (!esComandoCmd18(comando)) return false
  return !estaCmd18Activado(chatId)
}

export async function notificarCmd18Desactivado(m, conn, prefijoUsado = '.') {
  await conn.sendMessage(m.chat, {
    text: `🔞 *Comandos +18 desactivados en este grupo.*\n\nUn administrador debe activarlos con:\n> ${prefijoUsado}cmd18 on`,
    contextInfo: { ...global.rcanal.contextInfo }
  }, { quoted: m }).catch(() => {})
}

export async function verificarComandoCmd18(m, conn, comando, prefijoUsado, isOwner, isROwner) {
  if (!m.isGroup || isOwner || isROwner) return false
  if (!estaCmd18Bloqueado(m.chat, comando)) return false

  await notificarCmd18Desactivado(m, conn, prefijoUsado)
  return true
}

export {
  asegurarDbCmd18 as ensureCmd18Db,
  cargarListaCmd18 as loadCmd18List,
  esComandoCmd18 as isCmd18Command,
  estaCmd18Activado as isCmd18Enabled,
  estaCmd18Bloqueado as isCmd18Blocked,
  notificarCmd18Desactivado as notifyCmd18Disabled,
  verificarComandoCmd18 as checkCmd18Command
}
