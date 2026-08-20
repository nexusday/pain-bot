import ws from 'ws'
import path, { join } from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import { isMainBotConn, cleanBotNum } from './modo-sub.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT_DIR = path.join(__dirname, '..')
const IMG_DIR = join(ROOT_DIR, 'storage', 'img')
const DEFAULT_IMG = 'https://files.catbox.moe/iomah1.jpg'

function clockString(ms) {
  let h = Math.floor(ms / 3600000)
  let m = Math.floor((ms % 3600000) / 60000)
  let s = Math.floor((ms % 60000) / 1000)
  return [h, m, s].map(v => v.toString().padStart(2, '0')).join(':')
}

function resolveBotImage(configPath) {
  const candidates = ['menu.jpg', 'menu2.jpg', 'menu3.jpg']
  const local = candidates
    .map(name => join(IMG_DIR, name))
    .find(full => {
      try { return fs.existsSync(full) } catch { return false }
    })

  if (local) return local

  if (configPath && fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      if (config.img) {
        const custom = config.img
        if (/^https?:\/\//i.test(custom)) return custom
        const customAbs = path.isAbsolute(custom) ? custom : join(ROOT_DIR, custom)
        if (fs.existsSync(customAbs)) return customAbs
      }
    } catch {}
  }

  return DEFAULT_IMG
}

let handler = async (m, { conn }) => {
  try {
    if (!global.conns || !Array.isArray(global.conns)) {
      global.conns = []
    }

    const mainBotConn = global.conn
    const botActual = cleanBotNum(conn.user?.jid || conn.user?.id)
    const configPath = join('./Serbot', botActual, 'config.json')

    global.conns = global.conns.filter(subConn => {
      return Boolean(
        subConn?.user?.jid &&
        subConn.ws?.socket?.readyState === ws.OPEN
      )
    })

    const uniqueUsers = new Map()
    const uniqueGroupIds = new Set()

    if (mainBotConn?.chats) {
      for (const jid of Object.keys(mainBotConn.chats)) {
        if (jid.endsWith('@g.us')) uniqueGroupIds.add(jid)
      }
    }

    for (const subConn of global.conns) {
      if (!subConn?.user?.jid) continue
      uniqueUsers.set(subConn.user.jid, subConn)
      if (subConn.chats) {
        for (const jid of Object.keys(subConn.chats)) {
          if (jid.endsWith('@g.us')) uniqueGroupIds.add(jid)
        }
      }
    }

    let nombreBot = global.namebot || 'PAIN BOT'
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
        if (config.name) nombreBot = config.name
      } catch {}
    }

    const totalSubBots = uniqueUsers.size
    const totalBots = totalSubBots + 1
    const totalGroups = uniqueGroupIds.size
    const memoryMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024)

    const mainNum = cleanBotNum(mainBotConn?.user?.jid || mainBotConn?.user?.id) || 'Desconocido'
    const mainBotStatus = mainBotConn?.user?.jid ? 'Conectado' : 'Desconectado'
    const mainBotUptime = mainBotConn?.startTime ? Date.now() - mainBotConn.startTime : 0
    const mainBotFormatUptime = clockString(mainBotUptime)

    let txt = `ɪɴғᴏ ᴅᴇ ʙᴏᴛs\n\n`
    txt += ` *Bot actual:* ${nombreBot}\n`
    txt += ` *Número:* +${botActual || 'Desconocido'}\n`
    txt += ` *Tipo:* ${isMainBotConn(conn) ? 'Principal' : 'Sub-Bot'}\n`
    txt += ` *Memoria:* ${memoryMB} MB\n\n`

    txt += `ᴇsᴛᴀᴅɪsᴛɪᴄᴀs\n\n`
    txt += ` *Total de bots:* ${totalBots}\n`
    txt += ` *Bot principal:* 1\n`
    txt += ` *Sub-bots activos:* ${totalSubBots}\n`
    txt += ` *Grupos (únicos):* ${totalGroups}\n\n`

    txt += `ʙᴏᴛ ᴘʀɪɴᴄɪᴘᴀʟ\n\n`
    txt += ` *Número:* +${mainNum}\n`
    txt += ` *Estado:* ${mainBotStatus}\n`
    txt += ` *Tiempo activo:* ${mainBotFormatUptime}\n\n`

    if (totalSubBots > 0) {
      txt += `sᴜʙ-ʙᴏᴛs ᴀᴄᴛɪᴠᴏs\n\n`
      let i = 1
      for (const [jid, subConn] of uniqueUsers) {
        const subBotNumber = cleanBotNum(jid)
        const subBotConfigPath = join('./Serbot', subBotNumber, 'config.json')
        let subBotName = `Sub-Bot ${i}`

        if (fs.existsSync(subBotConfigPath)) {
          try {
            const subBotConfig = JSON.parse(fs.readFileSync(subBotConfigPath, 'utf-8'))
            if (subBotConfig.name) subBotName = subBotConfig.name
          } catch {}
        }

        const subBotStatus = subConn.ws?.socket?.readyState === ws.OPEN ? 'Activo' : 'Inactivo'
        let userName = subConn.user?.name
          || subConn.authState?.creds?.me?.name
          || 'Anónimo'

        txt += `*${i}.* ${subBotName}\n`
        txt += ` *Número:* +${subBotNumber}\n`
        txt += ` *Usuario:* ${userName}\n`
        txt += ` *Estado:* ${subBotStatus}\n`
        if (i < totalSubBots) txt += `\n`
        i++
      }
      txt += `\n`
    } else {
      txt += `sᴜʙ-ʙᴏᴛs\n\n`
      txt += ` *Sin sub-bots activos*\n`
      txt += ` *Usa .code o .qrr para crear uno*\n\n`
    }

    txt += `ʀᴇsᴜᴍᴇɴ\n\n`
    txt += ` *Bots totales:* ${totalBots}`

    const imgBot = resolveBotImage(configPath)
    const sendOpts = {
      contextInfo: {
        ...(global.rcanal?.contextInfo || {})
      }
    }

    try {
      await conn.sendFile(m.chat, imgBot, 'thumbnail.jpg', txt, m, null, sendOpts)
    } catch (err) {
      console.error('sub-bots sendFile falló, enviando texto:', err?.message || err)
      await conn.sendMessage(m.chat, { text: txt, ...sendOpts }, { quoted: m })
    }
  } catch (e) {
    console.error('Error en /bots:', e)
    await m.reply('[❌] Error al listar los bots.\n> ' + (e?.message || e))
  }
}

handler.command = ['listjadibot', 'bots', 'subbots', 'listbots']
handler.help = ['bots', 'subbots', 'listbots']
handler.tags = ['subbots']
export default handler
