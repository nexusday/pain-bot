import ws from 'ws'
import { format } from 'util'
import path, { join } from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

let handler = async (m, { conn }) => {
  
  const isMainBot = conn === global.conn
  const currentBotNumber = conn.user?.jid?.split('@')[0]
  
  
  const mainBotConn = global.conn
  
  let uniqueUsers = new Map()
  let totalGroups = 0

  if (!global.conns || !Array.isArray(global.conns)) {
    global.conns = []
  }

  
  global.conns = global.conns.filter(subConn => {
    const isConnected = subConn.user && 
                       subConn.user.jid &&
                       subConn.ws?.socket?.readyState === ws.OPEN
    
    if (!isConnected) {
      console.log(`Limpiando sub-bot desconectado: ${subConn.user?.jid || 'Desconocido'}`)
    }
    
    return isConnected
  })

 
  let mainBotGroups = 0
  if (mainBotConn.chats) {
    for (let [jid, chat] of Object.entries(mainBotConn.chats)) {
      if (jid.endsWith('@g.us')) {
        mainBotGroups++
      }
    }
  }


  let uniqueGroupIds = new Set()
  

  if (mainBotConn.chats) {
    for (let [jid, chat] of Object.entries(mainBotConn.chats)) {
      if (jid.endsWith('@g.us')) {
        uniqueGroupIds.add(jid)
      }
    }
  }


  global.conns.forEach((subConn) => {
    const isConnected = subConn.user && 
                       subConn.user.jid &&
                       subConn.ws?.socket?.readyState === ws.OPEN
    
    if (isConnected) {
      uniqueUsers.set(subConn.user.jid, subConn)
      
      if (subConn.chats) {
        for (let [jid, chat] of Object.entries(subConn.chats)) {
          if (jid.endsWith('@g.us')) {
            uniqueGroupIds.add(jid)
          }
        }
      }
    } else {
      let i = global.conns.indexOf(subConn)
      if (i >= 0) {
        console.log(`Removiendo sub-bot desconectado: ${subConn.user?.jid || 'Desconocido'}`)
        delete global.conns[i]
        global.conns.splice(i, 1)
      }
    }
  })

  totalGroups = uniqueGroupIds.size

 
  let mainBotUptime = 0
  if (mainBotConn.startTime) {
    mainBotUptime = Date.now() - mainBotConn.startTime
  } else {
    mainBotUptime = 0
  }
  let mainBotFormatUptime = clockString(mainBotUptime)
  
  let totalSubBots = uniqueUsers.size

  const botActual = conn.user?.jid?.split('@')[0].replace(/\D/g, '')
  const configPath = join('./Serbot', botActual, 'config.json')
  let nombreBot = global.namebot || 'PAIN BOT'
  
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath))
      if (config.name) nombreBot = config.name
    } catch (err) {
      console.error('Error al leer el archivo de configuración:', err)
    }
  }


  const totalBots = totalSubBots + 1
  const memoryUsage = process.memoryUsage()
  const memoryMB = Math.round(memoryUsage.heapUsed / 1024 / 1024)

  let txt = `╭─「 ✦ 𓆩⚡𓆪 ɪɴғᴏ ᴅᴇ ʙᴏᴛs ✦ 」─╮\n`
  txt += `│\n`
  txt += `╰➺ ✧ *Bot Actual:* ${nombreBot}\n`
  txt += `╰➺ ✧ *Número:* +${botActual}\n`
  txt += `╰➺ ✧ *Memoria:* ${memoryMB} MB\n`
  txt += `│\n`
  txt += `╰────────────────╯\n\n`
  
  txt += `╭─「 ✦ 𓆩📊𓆪 ᴇsᴛᴀᴅɪsᴛɪᴄᴀs ✦ 」─╮\n`
  txt += `│\n`
  txt += `╰➺ ✧ *Total de Bots:* ${totalBots}\n`
  txt += `╰➺ ✧ *Bot Principal:* 1\n`
  txt += `╰➺ ✧ *Sub-Bots Activos:* ${totalSubBots}\n`
  txt += `│\n`
  txt += `╰────────────────╯\n\n`

 
  const mainBotStatus = mainBotConn.user && 
                       mainBotConn.user.jid ? 'Conectado ✅' : 'Desconectado ❌'

  txt += `╭─「 ✦ 𓆩👑𓆪 ʙᴏᴛ ᴘʀɪɴᴄɪᴘᴀʟ ✦ 」─╮\n`
  txt += `│\n`
  txt += `╰➺ ✧ *Número:* +${mainBotConn.user.jid.split('@')[0]}\n`
  txt += `╰➺ ✧ *Estado:* ${mainBotStatus}\n`
  txt += `╰➺ ✧ *Tiempo Activo:* ${mainBotFormatUptime}\n`
  txt += `│\n`
  txt += `╰────────────────╯\n\n`
  
  if (totalSubBots > 0) {
    txt += `╭─「 ✦ 𓆩🤖𓆪 sᴜʙ-ʙᴏᴛs ᴀᴄᴛɪᴠᴏs ✦ 」─╮\n`
    txt += `│\n`
    
    let i = 1
    for (let [jid, subConn] of uniqueUsers) {
      const subBotNumber = jid.split('@')[0]
      
      
      const subBotConfigPath = join('./Serbot', subBotNumber, 'config.json')
      let subBotName = global.namebot || 'PAIN BOT'
      
      if (fs.existsSync(subBotConfigPath)) {
        try {
          const subBotConfig = JSON.parse(fs.readFileSync(subBotConfigPath, 'utf-8'))
          if (subBotConfig.name) subBotName = subBotConfig.name
        } catch (err) {
          console.error('Error al leer configuración del sub-bot:', err)
        }
      } else {
       
        subBotName = `Sub-Bot ${i}`
      }
      
      const subBotStatus = subConn.ws?.socket?.readyState === ws.OPEN ? 'Activo ✅' : 'Inactivo ❌'
      
     
      let userName = 'Anónimo'
      if (subConn.user && subConn.user.name) {
        userName = subConn.user.name
      } else if (subConn.authState && subConn.authState.creds && subConn.authState.creds.me && subConn.authState.creds.me.name) {
        userName = subConn.authState.creds.me.name
      }
      
      txt += `╰➺ ✧ *${i}. Sub Bot*\n`
      txt += `│   • Número: +${subBotNumber}\n`
      txt += `│   • Usuario: *${userName}*\n`
      txt += `│   • Estado: ${subBotStatus}\n`
      if (i < totalSubBots) txt += `│\n`
      i++
    }
    
    txt += `│\n`
    txt += `╰────────────────╯\n\n`
  } else {
    txt += `╭─「 ✦ 𓆩❌𓆪 sᴜʙ-ʙᴏᴛs ✦ 」─╮\n`
    txt += `│\n`
    txt += `╰➺ ✧ *Sin sub-bots activos*\n`
    txt += `╰➺ ✧ *Usa #qr o #code para crear uno*\n`
    txt += `│\n`
    txt += `╰────────────────╯\n\n`
  }

  txt += `╭─「 ✦ 𓆩📈𓆪 ʀᴇsᴜᴍᴇɴ ✦ 」─╮\n`
  txt += `│\n`
  txt += `╰➺ ✧ *Bots Totales:* ${totalBots}`


  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  const ROOT_DIR = path.join(__dirname, '..')
  const IMG_DIR = join(ROOT_DIR, 'storage', 'img')

  const candidates = [
    'menu.jpg'
  ]

  let imgBot = candidates
    .map(name => join(IMG_DIR, name))
    .find(full => { try { return fs.existsSync(full) } catch { return false } })
    || join(IMG_DIR, 'menu.jpg')

 
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath))
      if (config.img) {
        const custom = config.img
        const customAbs = path.isAbsolute(custom) ? custom : join(ROOT_DIR, custom)
        if (fs.existsSync(customAbs)) imgBot = customAbs
      }
    } catch (err) {
      console.error('Error al leer el archivo de configuración:', err)
    }
  }

  await conn.sendFile(m.chat, imgBot, 'thumbnail.jpg', txt, m, null, { 
    mentions: [],
    contextInfo: {
      ...rcanal.contextInfo
    }
  })
}

handler.command = ['listjadibot', 'bots', 'subbots', 'listbots']
handler.help = ['#bots • #subbots • #listbots\n→ Ver información detallada de todos los bots']
handler.tags = ['subbots']
export default handler

function clockString(ms) {
  let h = Math.floor(ms / 3600000)
  let m = Math.floor((ms % 3600000) / 60000)
  let s = Math.floor((ms % 60000) / 1000)
  return [h, m, s].map(v => v.toString().padStart(2, '0')).join(':')
}