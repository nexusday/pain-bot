import { smsg } from './lib/simple.js'
import { format } from 'util'
import { fileURLToPath } from 'url'
import path, { join } from 'path'
import { unwatchFile, watchFile, readFileSync, existsSync } from 'fs'
import chalk from 'chalk'
import fetch from 'node-fetch'

import { handleAIModes } from './lib/eventHandlers.js'
import { handleAntiSystems } from './lib/antiHandlers.js'
import { handleGroupEvents } from './lib/event.js'

const { proto } = (await import('@whiskeysockets/baileys')).default
const isNumber = x => typeof x === 'number' && !isNaN(x)
const delay = ms => isNumber(ms) && new Promise(resolve => setTimeout(function () {
clearTimeout(this)
resolve()
}, ms))

export async function handler(chatUpdate) {
this.msgqueque = this.msgqueque || []
if (!chatUpdate) return
this.pushMessage(chatUpdate.messages).catch(console.error)
let m = chatUpdate.messages[chatUpdate.messages.length - 1]
if (!m) return
if (global.db.data == null) await global.loadDatabase()

try {
m = smsg(this, m) || m
if (!m) return
if (m.messageStubType) return
m.exp = 0
m.limit = false

try {  
  let user = global.db.data.users[m.sender] ||= {}  
  if (!isNumber(user.exp)) user.exp = 0  
  if (!isNumber(user.limit)) user.limit = 10  
  if (!('registered' in user)) user.registered = false  
  if (!user.registered) {  

    user.registered = true
    user.name = m.name || m.pushName || 'Usuario'
    user.regTime = Date.now()
    user.age = -1
    user.level = 0
    user.coins = 100 
    user.exp = 0
    user.genre = 'No establecido'
    user.birth = 'No registrado'
    user.desc = 'Sin descripción'
    user.favourite = 'No establecido'
    user.partner = ''
    user.banned = false
    user.prem = false    
    

  }  
  if (!('banned' in user)) user.banned = false  
  if (!isNumber(user.level)) user.level = 0  
  if (!isNumber(user.coins)) user.coins = 0  

  let chat = global.db.data.chats[m.chat] ||= {}  
  if (!('isBanned' in chat)) chat.isBanned = false  
  if (!('bienvenida' in chat)) chat.bienvenida = true  
  if (!('antiLink' in chat)) chat.antiLink = false  
  if (!('onlyLatinos' in chat)) chat.onlyLatinos = false  
  if (!('nsfw' in chat)) chat.nsfw = false  
  if (!isNumber(chat.expired)) chat.expired = 0  

  let settings = global.db.data.settings[this.user.jid] ||= {}  
  if (!('self' in settings)) settings.self = false  
  if (!('autoread' in settings)) settings.autoread = true 
  if (!('autoread' in opts)) opts.autoread = true 
  
  
  if (global.db.data.notes && global.db.data.notes[m.chat]) {
    const now = Date.now()
    const originalLength = global.db.data.notes[m.chat].length
    global.db.data.notes[m.chat] = global.db.data.notes[m.chat].filter(note => note.expiresAt > now)
    const cleanedLength = global.db.data.notes[m.chat].length
    if (originalLength > cleanedLength) {
      console.log(`[NOTAS] Se limpiaron ${originalLength - cleanedLength} notas expiradas en ${m.chat}`)
    }
  }
} catch (e) {  
  console.error(e)  
}  

if (opts['nyimak']) return  
if (!m.fromMe && opts['self']) return  
if (opts['swonly'] && m.chat !== 'status@broadcast') return  
if (typeof m.text !== 'string') m.text = ''  

let _user = global.db.data?.users?.[m.sender]  

const createOwnerIds = (number) => {
  const cleanNumber = number.replace(/[^0-9]/g, '')
  return [
    cleanNumber + '@s.whatsapp.net',
    cleanNumber + '@lid'
  ]
}

const allOwnerIds = [
  conn.decodeJid(global.conn.user.id),
  ...global.owner.flatMap(([number]) => createOwnerIds(number)),
  ...(global.ownerLid || []).flatMap(([number]) => createOwnerIds(number))
]

const isROwner = allOwnerIds.includes(m.sender)
const isOwner = isROwner || m.fromMe  
const isMods = isOwner || global.mods.map(v => v.replace(/[^0-9]/g, '') + '@s.whatsapp.net').includes(m.sender)  
const isPrems = isROwner || global.prems.map(v => v.replace(/[^0-9]/g, '') + '@s.whatsapp.net').includes(m.sender) || _user?.prem == true  

if (opts['queque'] && m.text && !(isMods || isPrems)) {  
  let queque = this.msgqueque, time = 1000 * 5  
  const previousID = queque[queque.length - 1]  
  queque.push(m.id || m.key.id)  
  setInterval(async function () {  
    if (queque.indexOf(previousID) === -1) clearInterval(this)  
    await delay(time)  
  }, time)  
}  

if (m.isBaileys) return  
m.exp += Math.ceil(Math.random() * 10)  

const groupMetadata = (m.isGroup ? ((conn.chats[m.chat] || {}).metadata || await this.groupMetadata(m.chat).catch(_ => null)) : {}) || {}  
const participants = (m.isGroup ? groupMetadata.participants : []) || []  
const user = (m.isGroup ? participants.find(u => conn.decodeJid(u.id) === m.sender) : {}) || {}  
const bot = (m.isGroup ? participants.find(u => conn.decodeJid(u.id) == this.user.jid) : {}) || {}  
const isRAdmin = user?.admin == 'superadmin' || false  
const isAdmin = isRAdmin || user?.admin == 'admin' || false  
const isBotAdmin = bot?.admin || false  

const ___dirname = path.join(path.dirname(fileURLToPath(import.meta.url)), './plugins')  

global.idcanal = ''  
global.namecanal = ''  
global.rcanal = {  
  contextInfo: {  
    isForwarded: true,  
    forwardedNewsletterMessageInfo: {  
      newsletterJid: idcanal,  
      serverMessageId: 100,  
      newsletterName: namecanal  
    }  
  }  
}  

let usedPrefix = '.'  


let commandExecuted = false


const processedPlugins = []
for (let name in global.plugins) {
  let plugin = global.plugins[name]
  if (!plugin || plugin.disabled) continue
  
 
  let normalizedPlugin = {
    name: name,
    handler: plugin.handler || plugin,
    command: plugin.command || [],
    tags: plugin.tags || [],
    help: plugin.help || [],
    all: plugin.all,
    customPrefix: plugin.customPrefix
  }
  
  
  if (typeof normalizedPlugin.command === 'string') {
    normalizedPlugin.command = [normalizedPlugin.command]
  }
  
  
  if (normalizedPlugin.command instanceof RegExp) {
    normalizedPlugin.command = [normalizedPlugin.command.source]
  }
  
  processedPlugins.push(normalizedPlugin)
}

const sessionPlugins = ['xnxx.js', 'hentai.js', 'xvideos.js']

for (let plugin of processedPlugins) {
  if (plugin.handler && typeof plugin.handler.before === 'function' && sessionPlugins.includes(plugin.name)) {
    try {
      await plugin.handler.before.call(this, m, {
        conn: this,
        participants,
        groupMetadata,
        user,
        bot,
        isROwner,
        isOwner,
        isRAdmin,
        isAdmin,
        isBotAdmin,
        isPrems,
        chatUpdate,
        __dirname: ___dirname,
        __filename
      })
      
      if (m.commandExecuted) break
    } catch (e) {
      console.error(`Error en handler.before de ${plugin.name}:`, e)
    }
  }
}

for (let plugin of processedPlugins) {
  const __filename = join(___dirname, plugin.name)

  
  if (typeof plugin.all === 'function') {
    try {
      await plugin.all.call(this, m, {
        conn: this,
        participants,
        groupMetadata,
        user,
        bot,
        isROwner,
        isOwner,
        isRAdmin,
        isAdmin,
        isBotAdmin,
        isPrems,
        chatUpdate,
        __dirname: ___dirname,
        __filename
      })
    } catch (e) {
      console.error(`Error en plugin.all de ${plugin.name}:`, e)
    }
  }

  
  if (!opts['restrict']) {
    if (plugin.tags && plugin.tags.includes('admin')) continue
  }

  
  const str2Regex = str => str.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&')
  let _prefix = plugin.customPrefix ? plugin.customPrefix : conn.prefix ? conn.prefix : global.prefix
  
  let match = (_prefix instanceof RegExp ?
    [[_prefix.exec(m.text), _prefix]] :
    Array.isArray(_prefix) ?
      _prefix.map(p => {
        let re = p instanceof RegExp ? p : new RegExp(str2Regex(p))
        return [re.exec(m.text), re]
      }) :
      typeof _prefix === 'string' ?
        [[new RegExp(str2Regex(_prefix)).exec(m.text), new RegExp(str2Regex(_prefix))]] :
        [[[], new RegExp]]
  ).find(p => p[1] && p[0])

  if (!match) continue

  const prefixMatch = match[0]
  const noPrefix = m.text.slice(prefixMatch[0].length).trim()
  const [commandText, ...args] = noPrefix.split(/\s+/)
  const command = commandText?.toLowerCase()

 
  const isMatchCommand = plugin.command && plugin.command.some(cmd => {
    if (typeof cmd === 'string') {
      return command === cmd.toLowerCase()
    } else if (cmd instanceof RegExp) {
      return cmd.test(command)
    }
    return false
  })

  if (isMatchCommand) {
    
  
    if (m.isGroup && global.db.data.soloAdmin && global.db.data.soloAdmin[m.chat] === true) {
      if (!isAdmin && !isOwner && !isROwner) {
        
        continue
      }
    }
    
    const allowedPrivateCommands = ['qr', 'code', 'setbotname', 'setbotimg', 'setautoread']
    if (!m.isGroup && !allowedPrivateCommands.includes(command) && !isOwner) {
      return 
    }
    
    if (m.isGroup && global.db.data.botGroups && global.db.data.botGroups[m.chat] === false) {
      const alwaysAllowedCommands = ['grupo']
      if (!alwaysAllowedCommands.includes(command) && !isOwner) {
        return m.reply(`*[🪐] El bot está desactivado en este grupo.*\n\n> Pídele a un administrador que lo active.`)
      }
    }
    
    commandExecuted = true
    try {
      await plugin.handler.call(this, m, {
        match,
        conn: this,
        participants,
        groupMetadata,
        user,
        bot,
        isROwner,
        isOwner,
        isRAdmin,
        isAdmin,
        isBotAdmin,
        isPrems,
        chatUpdate,
        __dirname: ___dirname,
        __filename,
        usedPrefix: prefixMatch[0],
        command,
        args,
        text: args.join(' ').trim()
      })
      m.plugin = plugin.name
      m.command = command
      m.args = args
    } catch (e) {
      m.error = e
      console.error(`Error ejecutando plugin ${plugin.name}:`, e)
    }
  }
}



if (m.text && !commandExecuted && global.db.data.adivinanzasActivas && global.db.data.adivinanzasActivas[m.chat]) {
  
  if (m.isGroup && global.db.data.soloAdmin && global.db.data.soloAdmin[m.chat] === true) {
    if (!isAdmin && !isOwner && !isROwner) {
      return 
    }
  }
  
  const adivinanzaActiva = global.db.data.adivinanzasActivas[m.chat]
  
  
  if (adivinanzaActiva.activa && !adivinanzaActiva.respondida) {
    const tiempoTranscurrido = Date.now() - adivinanzaActiva.timestamp
    const tiempoLimite = 60 * 1000 
    
    
    if (tiempoTranscurrido > tiempoLimite) {
      adivinanzaActiva.activa = false
      adivinanzaActiva.respondida = true
      
      await this.sendMessage(m.chat, {
        text: `👻 𝗔𝗱𝗶𝘃𝗶𝗻𝗮𝗻𝘇𝗮 𝗲𝘅𝗽𝗶𝗿𝗮𝗱𝗼\n\n> *Respuesta:* ${adivinanzaActiva.respuesta}\n> Nadie pudo adivinarlo.`,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
      
      return
    }
    
  
    const respuestaUsuario = m.text.toLowerCase().trim()
    if (respuestaUsuario === adivinanzaActiva.respuesta) {
     
      adivinanzaActiva.activa = false
      adivinanzaActiva.respondida = true
      adivinanzaActiva.ganador = m.sender
      
    
      let user = global.db.data.users[m.sender]
      if (!user) global.db.data.users[m.sender] = {}
      
      const premio = Math.floor(Math.random() * (500 - 250 + 1)) + 250
      user.coins = (user.coins || 0) + premio
      
      await this.sendMessage(m.chat, {
        text: ` 🎉 𝗧𝗲𝗻𝗲𝗺𝗼𝘀 𝘂𝗻 𝗴𝗮𝗻𝗮𝗱𝗼𝗿 🎉\n\n> *Ganador:* @${m.sender.split('@')[0]}\n> *Respuesta:* ${adivinanzaActiva.respuesta}\n> *Premio:* +${premio} ${global.moneda}\n> *Total:* ${user.coins} ${global.moneda}`,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [m.sender]
        }
      }, { quoted: m })
      
      return
    }
  }
}


  
  await handleAntiSystems(m, this, isAdmin, isOwner, isRAdmin, isBotAdmin, isPrems, commandExecuted)

  await handleGroupEvents(m, this, isAdmin, isBotAdmin, isOwner, participants)

  
  if (m.isGroup && global.pendingInvites && global.pendingInvites[m.chat] && !commandExecuted) {
    
    if (global.db.data.soloAdmin && global.db.data.soloAdmin[m.chat] === true) {
      if (!isAdmin && !isOwner && !isROwner) {
        return 
      }
    }
    
    const invite = global.pendingInvites[m.chat]
    
    
    if (m.sender !== invite.opponent) return
    
    const message = m.text?.toLowerCase().trim()
    
    if (message === 'si' || message === 'sí' || message === 'yes' || message === 'acepto') {
      
      try {
        const { acceptInvite } = await import(`./plugins/rpg-michi.js`)
        return acceptInvite.call(this, m, this, invite)
      } catch (e) {
        console.error('Error al aceptar invitación:', e)
      }
    } else if (message === 'no' || message === 'rechazo' || message === 'rechazar') {
  
      try {
        const { rejectInvite } = await import(`./plugins/rpg-michi.js`)
        return rejectInvite.call(this, m, this, invite)
      } catch (e) {
        console.error('Error al rechazar invitación:', e)
      }
    }
  }

  if (m.isGroup && global.games && global.games[m.chat] && global.games[m.chat].type === 'tictactoe' && !commandExecuted) {
    
    if (global.db.data.soloAdmin && global.db.data.soloAdmin[m.chat] === true) {
      if (!isAdmin && !isOwner && !isROwner) {
        return 
      }
    }
    
    const gameData = global.games[m.chat]
    const game = gameData.game

    
    if (!gameData.players.includes(m.sender)) return

    
    if (!game.gameActive) return

    
    const message = m.text?.trim()
    if (!message || !/^[1-9]$/.test(message)) return

    const position = parseInt(message)

    try {
      
      const { handleGameEnd } = await import(`./plugins/rpg-michi.js`)

      
      const result = game.makeMove(position, m.sender)

      if (!result.success) {
        
        return this.sendMessage(m.chat, {
          text: `𝗧𝗲𝗻𝗲𝗺𝗼𝘀 𝘂𝗻 𝗲𝗿𝗿𝗼𝗿:  
  𓂃 ࣪ ִֶָ☾.  ${result.message}`,
          contextInfo: {
            ...rcanal.contextInfo
          }
        }, { quoted: m })
      }

      
      game.startInactivityTimeout((cancelledGame) => {
        if (global.games && global.games[m.chat] && global.games[m.chat].type === 'tictactoe') {
          handleGameEnd(m, this, cancelledGame, 'timeout')
        }
      })

      if (result.finished) {
        
        return handleGameEnd(m, this, game, result.winner ? 'finished' : 'draw')
      } else {
        
        const board = game.getBoard()
        const nextPlayerName = game.currentPlayer === game.player1 ? '𝙅𝙪𝙜𝙖𝙖𝙙𝙤𝙧 1 (❌)' : '𝙅𝙪𝙜𝙖𝙖𝙙𝙤𝙧 2 (⭕)'
        const nextPlayer = game.currentPlayer

        const message = `𝗠𝗼𝘃𝗶𝗺𝗶𝗲𝗻𝘁𝗼 𝗿𝗲𝗮𝗹𝗶𝘇𝗮𝗱𝗼  

${board}

  𓂃 ࣪ ִֶָ☾.  🎯 𝙏𝙐𝙍𝙉𝙊 𝘿𝙀: @${nextPlayer.split('@')[0]} (${nextPlayerName})

`.trim()

        return this.sendMessage(m.chat, {
          text: message,
          contextInfo: {
            ...rcanal.contextInfo,
            mentionedJid: [nextPlayer]
          }
        }, { quoted: m })
      }

    } catch (e) {
      console.error('Error procesando movimiento de 3 en raya:', e)
      return this.sendMessage(m.chat, {
        text: `[❌ Error al procesar el movimiento.`,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }
  }

global.dfail = (type, m, conn) => {  
  const msg = {  
    rowner: `𓂃 ࣪ ִֶָ☾.  Hola, este comando solo puede ser utilizado por el *Creador* de la Bot.`,  
    owner: `𓂃 ࣪ ִֶָ☾.  Hola, este comando solo puede ser utilizado por el *Creador* de la Bot y *Sub Bots*.`,  
    mods: `𓂃 ࣪ ִֶָ☾.  Hola, este comando solo puede ser utilizado por los *Moderadores* de la Bot.`,  
    premium: `𓂃 ࣪ ִֶָ☾.  Hola, este comando solo puede ser utilizado por Usuarios *Premium*.`,  
    group: `𓂃 ࣪ ִֶָ☾.  Hola, este comando solo puede ser utilizado en *Grupos*.`,  
    private: `𓂃 ࣪ ִֶָ☾.  Hola, este comando solo puede ser utilizado en mi Chat *Privado*.`,  
    admin: `𓂃 ࣪ ִֶָ☾.  Hola, este comando solo puede ser utilizado por los *Administradores* del Grupo.`,  
    botAdmin: `𓂃 ࣪ ִֶָ☾.  Hola, la bot debe ser *Administradora* para ejecutar este Comando.`,  
    unreg: `𓂃 ࣪ ִֶָ☾.  Hola, para usar este comando debes estar *Registrado.*`,  
    restrict: `𓂃 ࣪ ִֶָ☾.  Hola, esta característica está *deshabilitada.*`  
  }[type]  
  if (msg) return conn.reply(m.chat, msg, m, rcanal)  
}

} catch (e) {
console.error(e)
} finally {
if (opts['queque'] && m.text) {
const quequeIndex = this.msgqueque.indexOf(m.id || m.key.id)
if (quequeIndex !== -1) this.msgqueque.splice(quequeIndex, 1)
}

let user, stats = global.db.data.stats  
if (m) {  
  if (m.sender && (user = global.db.data.users[m.sender])) {  
    user.exp += m.exp  
    user.limit -= m.limit * 1  
  }  

  let stat  
  if (m.plugin) {  
    let now = +new Date  
    stat = stats[m.plugin] ||= {  
      total: 0,  
      success: 0,  
      last: 0,  
      lastSuccess: 0  
    }  
    stat.total += 1  
    stat.last = now  
    if (m.error == null) {  
      stat.success += 1  
      stat.lastSuccess = now  
    }  
  }  
}  

try {  
  if (!opts['noprint']) await (await import(`./lib/print.js`)).default(m, this)  
} catch (e) {  
  console.log(m, m.quoted, e)  
}  

const settingsREAD = global.db.data.settings[this.user.jid] || {}


const isSubBot = this.user.jid !== global.conn.user.jid
let shouldAutoRead = true

if (isSubBot) {
  try {
    const botNumber = this.user.jid.split('@')[0].replace(/\D/g, '')
    const configPath = `./Serbot/${botNumber}/config.json`
    
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'))
     
      if (config.autoRead === false) {
        shouldAutoRead = false
      }
    }
  } catch (error) {
   
    console.error('Error leyendo configuración de auto-leer:', error)
  }
}

if (shouldAutoRead) {
  try {
    await this.readMessages([m.key])
    
    if (m.isGroup) {
      await this.readMessages([m.key], { readEphemeral: true })
    }
  } catch (e) {
    console.error('Error al marcar como leído:', e)
  }

  
  await handleAIModes(m, this)

}

}
}

let file = global.__filename(import.meta.url, true)
watchFile(file, async () => {
unwatchFile(file)
console.log(chalk.magenta("Se actualizó 'handler.js'"))
if (global.reloadHandler) console.log(await global.reloadHandler())
})
