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
import { handleModoDescargas } from './lib/Modos/modo-descargas.js'
import { isViewOnceCandidate, isKnownViewOnce, runAntiViewOnce } from './lib/viewOnce.js'
import { checkGroupRental, isRentalBypassCommand } from './lib/alquiler.js'
import { checkCmd18Command } from './lib/cmd18.js'
import { findGroupParticipant, findBotParticipant } from './lib/group-participant.js'
import { shouldSkipGroupMessageEarly } from './plugins/modo-sub.js'
import { shouldBlockByGrupoOff } from './lib/bot-groups.js'
import { sendMichiBoard } from './lib/michi-board.js'
import { isInviteOpponent } from './lib/michi-users.js'
import { ensureRpgUser, awardCommandProgress, isStickerMessage, trackSentSticker, formatLevelUpMessage } from './lib/rpg-level.js'
import { trackUserMessage } from './lib/msg-activity.js'

const { proto } = (await import('@whiskeysockets/baileys')).default
const isNumber = x => typeof x === 'number' && !isNaN(x)
const delay = ms => isNumber(ms) && new Promise(resolve => setTimeout(function () {
clearTimeout(this)
resolve()
}, ms))

export async function handler(chatUpdate) {
this.msgqueque = this.msgqueque || []
if (!chatUpdate) return
let m = chatUpdate.messages[chatUpdate.messages.length - 1]
if (!m) return

// .modosub: los bots inactivos salen aquí (sin pushMessage, DB, plugins ni finally)
try {
  if (global.db.data == null) await global.loadDatabase()
  if (shouldSkipGroupMessageEarly(this, m)) return
} catch (e) {
  console.error('Error modosub early:', e)
}

await this.pushMessage(chatUpdate.messages).catch(console.error)

try {
m = smsg(this, m) || m
if (!m) return
const conn = this

if (!m.messageStubType && m.isGroup && !m.fromMe) {
  await runAntiViewOnce(this, m)
}

if (m.messageStubType) return
m.exp = 0
m.limit = false

try {  
  let user = global.db.data.users[m.sender] ||= {}  
  if (!isNumber(user.limit)) user.limit = 10  
  if (!('registered' in user)) user.registered = false  
  if (!user.registered) {
    user.registered = true
    user.name = m.name || m.pushName || 'Usuario'
    user.regTime = Date.now()
    user.age = -1
    user.level = 1
    user.coins = 100
    user.exp = 0
    user.commandCount = 0
    user.stickerCount = 0
    user.msgCount = 0
    user.msgByChat = {}
    user.genre = 'No establecido'
    user.birth = 'No registrado'
    user.desc = 'Sin descripción'
    user.favourite = 'No establecido'
    user.partner = ''
    user.banned = false
    user.prem = false
    user.rpgV2 = true
  }
  if (!('banned' in user)) user.banned = false
  if (!isNumber(user.coins)) user.coins = 0
  ensureRpgUser(user)  

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
    const ahora = Date.now()
    const longitudOriginal = global.db.data.notes[m.chat].length
    global.db.data.notes[m.chat] = global.db.data.notes[m.chat].filter(nota => nota.expiresAt > ahora)
    const longitudLimpia = global.db.data.notes[m.chat].length
    if (longitudOriginal > longitudLimpia) {
      console.log(`[NOTAS] Se limpiaron ${longitudOriginal - longitudLimpia} notas expiradas en ${m.chat}`)
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

const crearIdsOwner = (numero) => {
  const numeroLimpio = String(numero || '').replace(/[^0-9]/g, '')
  if (!numeroLimpio) return []
  return [
    numeroLimpio + '@s.whatsapp.net',
    numeroLimpio + '@lid'
  ]
}

const listaOwner = Array.isArray(global.owner) ? global.owner : []
const listaOwnerLid = Array.isArray(global.ownerLid) ? global.ownerLid : []
const listaMods = Array.isArray(global.mods) ? global.mods : []
const listaPrems = Array.isArray(global.prems) ? global.prems : []

const todosIdsOwner = [
  conn.decodeJid(global.conn.user.id),
  ...listaOwner.flatMap((entrada) => {
    const numero = Array.isArray(entrada) ? entrada[0] : entrada
    return crearIdsOwner(numero)
  }),
  ...listaOwnerLid.flatMap((entrada) => {
    const numero = Array.isArray(entrada) ? entrada[0] : entrada
    return crearIdsOwner(numero)
  })
]

const isROwner = todosIdsOwner.includes(m.sender)
const isOwner = isROwner || m.fromMe  
const isMods = isOwner || listaMods.map(v => String(v).replace(/[^0-9]/g, '') + '@s.whatsapp.net').includes(m.sender)  
const isPrems = isROwner || listaPrems.map(v => String(v).replace(/[^0-9]/g, '') + '@s.whatsapp.net').includes(m.sender) || _user?.prem == true  

if (opts['queque'] && m.text && !(isMods || isPrems)) {  
  let cola = this.msgqueque, tiempo = 1000 * 5  
  const idAnterior = cola[cola.length - 1]  
  cola.push(m.id || m.key.id)  
  setInterval(async function () {  
    if (cola.indexOf(idAnterior) === -1) clearInterval(this)  
    await delay(tiempo)  
  }, tiempo)  
}  

if (m.isBaileys) return  

try {
  trackUserMessage(m, this)
} catch (e) {
  console.error('msg-activity:', e?.message || e)
}

if (!m.fromMe && isStickerMessage(m)) {
  const usuarioDb = global.db.data.users[m.sender]
  if (usuarioDb) trackSentSticker(usuarioDb)
}

const groupMetadata = (m.isGroup ? ((this.chats[m.chat] || {}).metadata || await this.groupMetadata(m.chat).catch(_ => null)) : {}) || {}  
const participants = (m.isGroup ? groupMetadata.participants : []) || []  
const user = (m.isGroup ? findGroupParticipant(participants, m, this) : null) || {}  
const bot = (m.isGroup ? findBotParticipant(participants, this) : null) || {}  
const isRAdmin = user?.admin == 'superadmin' || false  
const isAdmin = isRAdmin || user?.admin == 'admin' || false  
const isBotAdmin = bot?.admin || false  

if (shouldBlockByGrupoOff(m, this)) return

if (m.isGroup && !isRentalBypassCommand(m, this, isOwner, isROwner)) {
  const alquilerBloqueado = await checkGroupRental(m, this)
  if (alquilerBloqueado) return
}

  
  try {
    if (!global.db.data.muted) global.db.data.muted = {}
    const listaMuteados = m.isGroup ? global.db.data.muted[m.chat] : null
    if (m.isGroup && Array.isArray(listaMuteados) && listaMuteados.length && !m.fromMe) {
    
      const idsRemitente = [
        m.sender,
        m.participant,
        m.key?.participant,
        m.key?.participantAlt,
        m.senderPn,
        m.participantPn,
        m.participantAlt
      ].filter(Boolean).map(String)

      const conjuntoDigitos = new Set(
        listaMuteados.map(j => String(j).split('@')[0].split(':')[0].replace(/\D/g, '')).filter(d => d.length >= 6)
      )
      let golpeMute = idsRemitente.some(id => listaMuteados.includes(id))
      if (!golpeMute) {
        golpeMute = idsRemitente.some(id => {
          const d = String(id).split('@')[0].split(':')[0].replace(/\D/g, '')
          return d.length >= 6 && conjuntoDigitos.has(d)
        })
      }
      if (!golpeMute) {
        const p = findGroupParticipant(participants, m, this)
        if (p) {
          const idsParticipante = [p.id, p.jid, p.lid, p.phoneNumber]
            .filter(Boolean)
            .map(v => {
              const s = String(v)
              if (s.includes('@')) return s
              if (String(p.lid) === s || /lid/i.test(s)) return `${s.replace(/\D/g, '')}@lid`
              return `${s.replace(/\D/g, '')}@s.whatsapp.net`
            })
          golpeMute = idsParticipante.some(id => listaMuteados.includes(id)) ||
            idsParticipante.some(id => {
              const d = String(id).split('@')[0].split(':')[0].replace(/\D/g, '')
              return d.length >= 6 && conjuntoDigitos.has(d)
            })
        }
      }

      if (golpeMute) {
        try {
          await this.sendMessage(m.chat, { delete: m.key })
        } catch (err) {
          console.error('Error deleting message from muted user:', err)
        }
        return
      }
    }
  } catch (err) {
    console.error('Error processing muted list:', err)
  }

const ___dirname = path.join(path.dirname(fileURLToPath(import.meta.url)), './plugins')  

let usedPrefix = '.'  


let comandoEjecutado = false


const pluginsProcesados = []
for (let name in global.plugins) {
  let plugin = global.plugins[name]
  if (!plugin || plugin.disabled) continue
  
 
  let pluginNormalizado = {
    name: name,
    handler: plugin.handler || plugin,
    command: plugin.command || [],
    tags: plugin.tags || [],
    help: plugin.help || [],
    all: plugin.all || plugin.handler?.all,
    customPrefix: plugin.customPrefix || plugin.handler?.customPrefix
  }
  
  
  if (typeof pluginNormalizado.command === 'string') {
    pluginNormalizado.command = [pluginNormalizado.command]
  }
  
  
  if (pluginNormalizado.command instanceof RegExp) {
    pluginNormalizado.command = [pluginNormalizado.command.source]
  }
  
  pluginsProcesados.push(pluginNormalizado)
}

const pluginsSesion = ['xnxx.js', 'hentai.js', 'xvideos.js']

for (let plugin of pluginsProcesados) {
  if (plugin.handler && typeof plugin.handler.before === 'function' && pluginsSesion.includes(plugin.name)) {
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

for (let plugin of pluginsProcesados) {
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

  
  const escaparRegex = str => str.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&')
  let _prefix = plugin.customPrefix ? plugin.customPrefix : conn.prefix ? conn.prefix : global.prefix
  
  let match = (_prefix instanceof RegExp ?
    [[_prefix.exec(m.text), _prefix]] :
    Array.isArray(_prefix) ?
      _prefix.map(p => {
        let re = p instanceof RegExp ? p : new RegExp(escaparRegex(p))
        return [re.exec(m.text), re]
      }) :
      typeof _prefix === 'string' ?
        [[new RegExp(escaparRegex(_prefix)).exec(m.text), new RegExp(escaparRegex(_prefix))]] :
        [[[], new RegExp]]
  ).find(p => p[1] && p[0])

  // prefijo o sin 
  let coincidenciaPrefijo, sinPrefijo, textoComando, args, command
  if (!match) {
    const grupoPermiteSinPrefijo = m.isGroup && global.db?.data?.antiprefijo && global.db.data.antiprefijo[m.chat] === true
    if (!isOwner && !isROwner && !grupoPermiteSinPrefijo) continue
    
    sinPrefijo = (m.text || '').trim()
    if (!sinPrefijo) continue
    ;[textoComando, ...args] = sinPrefijo.split(/\s+/)
    command = textoComando?.toLowerCase()
    
    const esCoincideSinPrefijo = plugin.command && plugin.command.some(cmd => {
      if (typeof cmd === 'string') return command === cmd.toLowerCase()
      if (cmd instanceof RegExp) return cmd.test(command)
      return false
    })
    if (!esCoincideSinPrefijo) continue
    coincidenciaPrefijo = ['']
  } else {
    coincidenciaPrefijo = match[0]
    sinPrefijo = m.text.slice(coincidenciaPrefijo[0].length).trim()
    ;[textoComando, ...args] = sinPrefijo.split(/\s+/)
    command = textoComando?.toLowerCase()
  }

 
  const esComandoCoincide = plugin.command && plugin.command.some(cmd => {
    if (typeof cmd === 'string') {
      return command === cmd.toLowerCase()
    } else if (cmd instanceof RegExp) {
      return cmd.test(command)
    }
    return false
  })

  if (esComandoCoincide) {
    
  
    if (m.isGroup && global.db.data.soloAdmin && global.db.data.soloAdmin[m.chat] === true) {
      if (!isAdmin && !isOwner && !isROwner) {
        
        continue
      }
    }
    
    const comandosPrivadosPermitidos = ['qr', 'code', 'setbotname', 'setbotimg', 'setautoread']
    if (!m.isGroup && !comandosPrivadosPermitidos.includes(command) && !isOwner) {
      return 
    }
    
    if (m.isGroup && global.db.data.botGroups && global.db.data.botGroups[m.chat] === false) {
      if (command !== 'grupo') return
    }

    if (await checkCmd18Command(m, this, command, coincidenciaPrefijo[0] || usedPrefix, isOwner, isROwner)) {
      continue
    }
    
    comandoEjecutado = true
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
        usedPrefix: coincidenciaPrefijo[0],
        command,
        args,
        text: args.join(' ').trim()
      })
      m.plugin = plugin.name
      m.command = command
      m.args = args

      if (m.error == null && !m.rpgAwarded) {
        const usuarioDb = global.db.data.users[m.sender]
        if (usuarioDb) {
          const esSticker = Array.isArray(plugin.tags) && plugin.tags.includes('stickers')
          m.rpgProgress = awardCommandProgress(usuarioDb, { isSticker: esSticker })
          m.rpgAwarded = true
        }
      }
    } catch (e) {
      m.error = e
      console.error(`Error ejecutando plugin ${plugin.name}:`, e)
    }
  }
}

if (m.rpgProgress?.leveled) {
  const rpg = m.rpgProgress
  await this.sendMessage(m.chat, {
    text: formatLevelUpMessage(rpg),
    contextInfo: { ...(global.rcanal?.contextInfo || {}) }
  }, { quoted: m }).catch(() => {})
}



if (m.text && !comandoEjecutado && global.db.data.adivinanzasActivas && global.db.data.adivinanzasActivas[m.chat]) {
  
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


  
  await handleModoDescargas(m, this, comandoEjecutado)
  await handleAntiSystems(m, this, isAdmin, isOwner, isRAdmin, isBotAdmin, isPrems, comandoEjecutado)

  await handleGroupEvents(m, this, isAdmin, isBotAdmin, isOwner, participants)

  
  if (m.isGroup && global.pendingInvites && global.pendingInvites[m.chat] && !comandoEjecutado) {
    
    if (global.db.data.soloAdmin && global.db.data.soloAdmin[m.chat] === true) {
      if (!isAdmin && !isOwner && !isROwner) {
        return 
      }
    }
    
    const invitacion = global.pendingInvites[m.chat]

    if (!isInviteOpponent(m, invitacion, this, participants)) return

    const mensaje = m.text?.toLowerCase().trim()

    if (mensaje === 'si' || mensaje === 'sí' || mensaje === 'yes' || mensaje === 'acepto') {
      try {
        let modulo
        if (invitacion.type === 'miner') modulo = await import(`./lib/logic-miner.js`)
        else if (invitacion.type === 'bomba') modulo = await import(`./lib/logic-bomba.js`)
        else modulo = await import(`./plugins/rpg-michi.js`)
        const { acceptInvite } = modulo
        return acceptInvite.call(this, m, this, invitacion, participants)
      } catch (e) {
        console.error('Error al aceptar invitación:', e)
      }
    } else if (mensaje === 'no' || mensaje === 'rechazo' || mensaje === 'rechazar') {
      try {
        let modulo
        if (invitacion.type === 'miner') modulo = await import(`./lib/logic-miner.js`)
        else if (invitacion.type === 'bomba') modulo = await import(`./lib/logic-bomba.js`)
        else modulo = await import(`./plugins/rpg-michi.js`)
        const { rejectInvite } = modulo
        return rejectInvite.call(this, m, this, invitacion)
      } catch (e) {
        console.error('Error al rechazar invitación:', e)
      }
    }
  }

  if (m.isGroup && global.games && global.games[m.chat] && global.games[m.chat].type === 'tictactoe' && !comandoEjecutado) {
    
    if (global.db.data.soloAdmin && global.db.data.soloAdmin[m.chat] === true) {
      if (!isAdmin && !isOwner && !isROwner) {
        return 
      }
    }
    
    const datosJuego = global.games[m.chat]
    const game = datosJuego.game

    
    if (!datosJuego.players.includes(m.sender)) return

    
    if (!game.gameActive) return

    
    const mensaje = m.text?.trim()
    if (!mensaje || !/^[1-9]$/.test(mensaje)) return

    const posicion = parseInt(mensaje)

    try {
      
      const { handleGameEnd } = await import(`./plugins/rpg-michi.js`)

      
      const resultado = game.makeMove(posicion, m.sender)

      if (!resultado.success) {
        
        return this.sendMessage(m.chat, {
          text: `𝗧𝗲𝗻𝗲𝗺𝗼𝘀 𝘂𝗻 𝗲𝗿𝗿𝗼𝗿:  
  𓂃 ࣪ ִֶָ☾.  ${resultado.message}`,
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

      if (resultado.finished) {
        
        return handleGameEnd(m, this, game, resultado.winner ? 'finished' : 'draw')
      } else {
        const siguienteJugador = game.currentPlayer
        const siguienteSimbolo = game.currentPlayer === game.player1 ? '❌' : '⭕'
        const leyenda = `Movimiento realizado\n\nTurno de @${siguienteJugador.split('@')[0]} (${siguienteSimbolo})\nResponde con el numero 1-9`

        return sendMichiBoard(this, m.chat, game, {
          quoted: m,
          caption: leyenda,
          mentionedJid: [siguienteJugador],
          status: 'playing',
        })
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

  // Miner game moves
  if (m.isGroup && global.games && global.games[m.chat] && global.games[m.chat].type === 'miner' && !comandoEjecutado) {
    if (global.db.data.soloAdmin && global.db.data.soloAdmin[m.chat] === true) {
      if (!isAdmin && !isOwner && !isROwner) {
        return 
      }
    }

    const datosJuego = global.games[m.chat]
    const game = datosJuego.game
    if (!datosJuego.players.includes(m.sender)) return
    if (!game?.gameActive) return

    const mensaje = m.text?.trim()
    if (!mensaje || !/^[0-9]+$/.test(mensaje)) return

    try {
      const modulo = await import(`./lib/logic-miner.js`)
      await modulo.handleMove.call(this, m, this, datosJuego)
    } catch (e) {
      console.error('Error procesando movimiento miner:', e)
      return this.sendMessage(m.chat, { text: '[❌] Error al procesar el movimiento.', contextInfo: { ...rcanal.contextInfo } }, { quoted: m })
    }
  }

  // Bomba game moves (botones interactivos o numero 1-10)
  if (m.isGroup && global.games && global.games[m.chat] && global.games[m.chat].type === 'bomba' && !comandoEjecutado) {
    if (global.db.data.soloAdmin && global.db.data.soloAdmin[m.chat] === true) {
      if (!isAdmin && !isOwner && !isROwner) return
    }

    try {
      const modulo = await import(`./lib/logic-bomba.js`)
      await modulo.handleMove(m, this, global.games[m.chat], participants)
    } catch (e) {
      console.error('Error procesando movimiento bomba:', e)
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
const indiceCola = this.msgqueque.indexOf(m.id || m.key.id)
if (indiceCola !== -1) this.msgqueque.splice(indiceCola, 1)
}

let user, stats = global.db.data.stats  
if (m) {  
  if (m.sender && (user = global.db.data.users[m.sender])) {  
    if (m.limit) user.limit -= m.limit * 1  
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

const ajustesLectura = global.db.data.settings[this.user.jid] || {}


const esSubBot = this.user.jid !== global.conn.user.jid
let debeAutoLeer = true

if (esSubBot) {
  try {
    const numeroBot = this.user.jid.split('@')[0].replace(/\D/g, '')
    const rutaConfig = `./Serbot/${numeroBot}/config.json`

    if (existsSync(rutaConfig)) {
      const config = JSON.parse(readFileSync(rutaConfig, 'utf-8'))

      if (config.autoRead === false) {
        debeAutoLeer = false
      }
    }
  } catch (error) {
    console.error('Error leyendo configuración de auto-leer:', error)
  }
} else {
  try {
    const claveBot = this.user?.jid || this.decodeJid(this.user?.id)
    const settings = claveBot && global.db?.data?.settings?.[claveBot]
    if (settings?.autoread === false) {
      debeAutoLeer = false
    }
  } catch (error) {
    console.error('Error leyendo visto del bot principal:', error)
  }
}

const idMensaje = m.id || m.key?.id
const saltarAutoLeer = isKnownViewOnce(idMensaje) || isViewOnceCandidate(m)

if (debeAutoLeer && !saltarAutoLeer) {
  try {
    await this.readMessages([m.key])

    if (m.isGroup) {
      await this.readMessages([m.key], { readEphemeral: true })
    }
  } catch (e) {
    console.error('Error al marcar como leído:', e)
  }
}

if (debeAutoLeer) {
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
