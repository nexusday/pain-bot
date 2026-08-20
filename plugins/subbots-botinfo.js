import fs from 'fs'
import path, { join } from 'path'
import { fileURLToPath } from 'url'
import ws from 'ws'
import { isMainBotConn, cleanBotNum } from './modo-sub.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT_DIR = join(__dirname, '..')
const IMG_DIR = join(ROOT_DIR, 'storage', 'img')
const DEFAULT_IMG = 'https://files.catbox.moe/iomah1.jpg'

function resolveBotImage(configPath) {
  const candidates = ['menu2.jpg', 'menu.jpg', 'menu3.jpg']
  let imgBot = candidates
    .map(name => join(IMG_DIR, name))
    .find(full => {
      try { return fs.existsSync(full) } catch { return false }
    }) || DEFAULT_IMG

  if (!fs.existsSync(configPath)) return imgBot

  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    if (config.img) {
      const custom = config.img
      const customAbs = path.isAbsolute(custom) ? custom : join(ROOT_DIR, custom)
      if (fs.existsSync(customAbs)) imgBot = customAbs
    }
  } catch {}

  return imgBot
}

function clockString(ms) {
  if (!ms || isNaN(ms)) return '00:00:00'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  return [h, m, s].map(v => v.toString().padStart(2, '0')).join(':')
}

let handler = async (m, { conn, usedPrefix }) => {
  const botActual = cleanBotNum(conn.user?.jid || conn.user?.id)
  const configPath = join(ROOT_DIR, 'Serbot', botActual, 'config.json')
  const isMain = isMainBotConn(conn)

  let nombreBot = global.namebot || 'PAIN BOT'
  let imgBot = resolveBotImage(configPath)

  if (!isMain && fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      if (config.name) nombreBot = config.name
    } catch {}
  }

  const tipo = isMain ? 'Principal' : 'Sub-Bot'
  const totalf = Object.values(global.plugins).filter(v => v.help && v.tags).length

  let botUptime = 0
  if (conn.startTime) botUptime = Date.now() - conn.startTime
  const botFormatUptime = clockString(botUptime)

  let subBotsActivos = 0
  if (global.conns && Array.isArray(global.conns)) {
    subBotsActivos = global.conns.filter(subConn =>
      subConn.user &&
      subConn.ws?.socket?.readyState !== ws.CLOSED
    ).length
  }

  let txt = `ɪɴғᴏ ᴅᴇʟ ʙᴏᴛ\n\n`
  txt += ` *Nombre:* ${nombreBot}\n`
  txt += ` *Número:* +${botActual || 'Desconocido'}\n`
  txt += ` *Tipo:* ${tipo}\n`
  txt += ` *Librería:* Baileys MD\n`
  txt += ` *Tiempo activo:* ${botFormatUptime}\n`
  txt += ` *Sub-bots activos:* ${subBotsActivos}\n`
  txt += ` *Plugins:* ${totalf}\n`
  txt += ` *Prefijo:* ${usedPrefix}\n\n`

  if (global.owner && Array.isArray(global.owner) && global.owner.length) {
    txt += `ᴘʀᴏᴘɪᴇᴛᴀʀɪᴏs\n\n`
    for (const [number, name] of global.owner) {
      if (!number || /tunumero|acael|xxx/i.test(String(number))) continue
      txt += ` *${name || 'Owner'}:* +${String(number).replace(/\D/g, '')}\n`
    }
  }

  await conn.sendFile(m.chat, imgBot, 'thumbnail.jpg', txt.trim(), m, null, {
    contextInfo: {
      ...(global.rcanal?.contextInfo || {})
    }
  })
}

handler.help = ['info', 'infobot']
handler.tags = ['subbots']
handler.command = ['info', 'infobot', 'botinfo']

export default handler
