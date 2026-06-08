const { useMultiFileAuthState, DisconnectReason, makeCacheableSignalKeyStore, fetchLatestBaileysVersion } = (await import("@whiskeysockets/baileys"))
import qrcode from "qrcode"
import NodeCache from "node-cache"
import fs from "fs"
import path from "path"
import pino from "pino"
import chalk from "chalk"
import util from "util"
import * as ws from "ws"
const { child, spawn, exec } = await import("child_process")
const { CONNECTING } = ws
import { makeWASocket } from "../lib/simple.js"
import { initViewOnceAntiListener } from "../lib/viewOnce.js"
import { resolvePhoneNumber, extractPhoneFromArgs, getPrivateReplyJid, sendPrivateReply } from "../lib/resolve-phone.js"
import { fileURLToPath } from "url"


const rcanal = global.rcanal || {
  contextInfo: {
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
      newsletterJid: '120363403162100537@newsletter',
      serverMessageId: 100,
      newsletterName: 'PAIN COMMUNITY'
    }
  }
}

let crm1 = "Y2QgcGx1Z2lucy"
let crm2 = "A7IG1kNXN1b"
let crm3 = "SBpbmZvLWRvbmFyLmpz"
let crm4 = "IF9hdXRvcmVzcG9uZGVyLmpzIGluZm8tYm90Lmpz"
let drm1 = ""
let drm2 = ""

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const AYBotOptions = {}

if (!(global.conns instanceof Array)) global.conns = []

function clearSubBotAuth(pathAYBot) {
  if (!fs.existsSync(pathAYBot)) return
  for (const entry of fs.readdirSync(pathAYBot)) {
    if (entry === 'config.json') continue
    fs.rmSync(path.join(pathAYBot, entry), { recursive: true, force: true })
  }
}

let handler = async (m, { conn, args, usedPrefix, command, isOwner }) => {
  if (m.isGroup) {
    return m.reply('*[❗] Para convertirte en Sub-Bot usa el comando en privado del bot.*')
  }
  
  let time = global.db.data.users[m.sender].Subs + 120000
  const subBots = [...new Set([...global.conns.filter((conn) => conn.user && conn.ws.socket && conn.ws.socket.readyState !== ws.CLOSED).map((conn) => conn)])]
  const subBotsCount = subBots.length

  if (subBotsCount === 3) {
    return m.reply(`No se han encontrado espacios para *Sub-Bots* disponibles.`)
  }

  let who = m.mentionedJid && m.mentionedJid[0] ? m.mentionedJid[0] : m.fromMe ? conn.user.jid : m.sender
  const wantsCode = command === 'code' || args.some(arg => /^(code|--code)$/i.test(String(arg || '').trim()))
  const explicitPhone = extractPhoneFromArgs(args)
  let phoneNumber = await resolvePhoneNumber(who, conn, explicitPhone, m)
  const replyJid = getPrivateReplyJid(m, conn)

  if (!phoneNumber) {
    const lidHint = String(m.sender || '').split('@')[0]
    return sendPrivateReply(m, conn, `[❗] *No se pudo obtener tu número real de WhatsApp.*\n\nWhatsApp envía un @lid interno (${lidHint}) y el código de vinculación necesita tu número con código de país.\n\n> *Opción 1:* ${usedPrefix}code <número>\n> *Ejemplo:* ${usedPrefix}code 51901437507\n\n> *Opción 2:* Escribe en un grupo donde esté el bot y vuelve a usar ${usedPrefix}code\n\n> *Opción 3:* ${usedPrefix}qrr para vincular con QR`, {
      contextInfo: { ...rcanal.contextInfo }
    })
  }

  let id = phoneNumber
  let pathAYBot = path.join(`./${global.bot}/`, id)
  if (!fs.existsSync(pathAYBot)) {
    fs.mkdirSync(pathAYBot, { recursive: true })
  }

  AYBotOptions.pathAYBot = pathAYBot
  AYBotOptions.m = m
  AYBotOptions.conn = conn
  AYBotOptions.args = args
  AYBotOptions.usedPrefix = usedPrefix
  AYBotOptions.command = command
  AYBotOptions.fromCommand = true
  AYBotOptions.phoneNumber = phoneNumber
  AYBotOptions.replyJid = replyJid

  if (wantsCode) {
    await sendPrivateReply(m, conn, `⏳ *Generando código de vinculación...*\n\n> *Número:* +${phoneNumber}\n> Espera unos segundos, el código llegará en este chat.`, {
      contextInfo: { ...rcanal.contextInfo }
    })
  }

  AYBot(AYBotOptions)
  global.db.data.users[m.sender].Subs = new Date * 1
}

handler.help = ['#qr', '#code']
handler.tags = ['subbots']
handler.command = ['qrr', 'code']
export default handler

export async function AYBot(options) {
  let { pathAYBot, m, conn, args, usedPrefix, command, fromCommand = true, phoneNumber = null, replyJid = null } = options
  
 
  if (!fromCommand) {
    command = 'qrr'
    args = []
    usedPrefix = '.'
  }
  
  if (command === 'code') {
    command = 'qrr'
    args.unshift('code')
  }

  const mcode = args[0] && /(--code|code)/.test(args[0].trim()) ? true : args[1] && /(--code|code)/.test(args[1].trim()) ? true : false
  let txtCode, codeBot, txtQR

  if (mcode) {
    args[0] = args[0].replace(/^--code$|^code$/, "").trim()
    if (args[1]) args[1] = args[1].replace(/^--code$|^code$/, "").trim()
    if (args[0] == "") args[0] = undefined
  }

  const pathCreds = path.join(pathAYBot, "creds.json")
  if (!fs.existsSync(pathAYBot)) {
    fs.mkdirSync(pathAYBot, { recursive: true })
  }

  if (mcode) {
    clearSubBotAuth(pathAYBot)
  }

  const credsArg = args[0]
  const looksLikePhone = credsArg && /^\d{8,15}$/.test(String(credsArg).replace(/\D/g, ''))

  try {
    if (credsArg && credsArg != undefined && !looksLikePhone) {
      fs.writeFileSync(pathCreds, JSON.stringify(JSON.parse(Buffer.from(credsArg, "base64").toString("utf-8")), null, '\t'))
    }
  } catch {
    if (m && conn) {
      conn.sendMessage(m.chat, {
        text: `[❌] *Uso correcto del comando:*
> *${usedPrefix}code* - Código de vinculación
> *${usedPrefix}qrr* - Código QR`,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }
    return
  }

  const comb = Buffer.from(crm1 + crm2 + crm3 + crm4, "base64")
  exec(comb.toString("utf-8"), async (err, stdout, stderr) => {
   
    process.on('unhandledRejection', (reason, promise) => {
      console.log(chalk.bold.redBright(`\n┆ Unhandled Rejection at: ${promise}, reason: ${reason}\n`))
    })
    const drmer = Buffer.from(drm1 + drm2, "base64")
    let { version, isLatest } = await fetchLatestBaileysVersion()
    const msgRetry = (MessageRetryMap) => { }
    const msgRetryCache = new NodeCache()
    let state, saveState, saveCreds
    try {
      const authState = await useMultiFileAuthState(pathAYBot)
      state = authState.state
      saveState = authState.saveState
      saveCreds = authState.saveCreds
    } catch (error) {
      console.log(chalk.bold.redBright(`\n┆ Error inicializando auth state para ${path.basename(pathAYBot)}: ${error.message}\n`))
      return
    }

    const connectionOptions = {
      logger: pino({ level: "fatal" }),
      printQRInTerminal: false,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" }))
      },
      msgRetry,
      msgRetryCache,
      browser: mcode ? ['Ubuntu', 'Chrome', '110.0.5585.95'] : ['Pain Bot (Sub Bot)', 'Chrome', '2.0.0'],
      version,
      generateHighQualityLinkPreview: true
    }

    let sock = makeWASocket(connectionOptions)
    sock.isInit = false
    let isInit = true
    let pairingCodeSent = false
    let pairingInProgress = false
    const pairingPhone = phoneNumber

    const replyUser = async (text) => {
      return sendPrivateReply(m, conn, text, { contextInfo: { ...rcanal.contextInfo } })
    }

    function isSocketOpen() {
      return sock?.ws?.isOpen === true
    }

    async function sendPairingCode() {
      if (pairingCodeSent || pairingInProgress || !mcode || !m || !conn) return false
      pairingInProgress = true

      if (!pairingPhone) {
        pairingCodeSent = true
        await replyUser(`[❌] *No se pudo obtener tu número.*\n\nUsa ${usedPrefix}code en privado con el bot principal.`)
        try { sock.ws.close() } catch {}
        pairingInProgress = false
        return false
      }

      try {
        if (!isSocketOpen()) {
          throw new Error('La conexión se cerró antes de generar el código.')
        }

        let secret = await sock.requestPairingCode(pairingPhone)

        secret = secret?.match(/.{1,4}/g)?.join('-') || secret
        pairingCodeSent = true

        await replyUser(`🔢 *𝗩𝗜𝗡𝗖𝗨𝗟𝗔𝗖𝗜𝗢́𝗡 𝗣𝗢𝗥 𝗖𝗢́𝗗𝗜𝗚𝗢*

> *Tu código:* \`${secret}\`
> *Número:* +${pairingPhone}

*Pasos:*
1. Abre WhatsApp en tu teléfono
2. Ve a *Dispositivos vinculados*
3. Toca *Vincular un dispositivo*
4. Elige *Vincular con número de teléfono*
5. Ingresa el código de arriba

✧ El código caduca en ~2 minutos
✧ Solo funciona para *+${pairingPhone}*`)

        pairingInProgress = false
        return true
      } catch (error) {
        console.error('Error generando pairing code:', error)
        pairingCodeSent = false
        pairingInProgress = false
        await replyUser(`[❌] *Error al generar el código.*\n\n> ${error?.message || 'Conexión interrumpida'}\n\nVuelve a usar:\n> ${usedPrefix}code`).catch(() => {})
        try { sock.ws.close() } catch {}
        return false
      }
    }

    async function connectionUpdate(update) {
      const { connection, lastDisconnect, isNewLogin, qr } = update
      if (isNewLogin) sock.isInit = false

      if (qr && mcode && m && conn) {
        await sendPairingCode()
        return
      }

      if (qr && !mcode && m && conn) {
        let txt = `📱 𝗩𝗶𝗻𝗰𝘂𝗹𝗮𝗰𝗶𝗼́𝗻 𝗤𝗥 

 *Escaneo de QR requerido*

> *Ruta para vincular:*
> • Aplicación: WhatsApp
> • Menú: Más opciones (⋮)
> • Módulo: Dispositivos vinculados
> • Acción: Vincular nuevo dispositivo
> • Método: Escanear código QR

 ✧ *Nota:*
  ✧ Este código QR caduca en 30 segundos`

  let sendQR = await conn.sendFile(m.chat, await qrcode.toDataURL(qr, { scale: 8 }), "qrcode.png", txt, m, null, rcanal)

  setTimeout(() => {
    conn.sendMessage(m.chat, { delete: sendQR.key })
  }, 30000)

  return
  }

      const endSesion = async (loaded) => {
        if (!loaded) {
          try { sock.ws.close() } catch { }
          sock.ev.removeAllListeners()
          let i = global.conns.indexOf(sock)
          if (i >= 0) {
            delete global.conns[i]
            global.conns.splice(i, 1)
          }
        }
      }

      const reason = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.output?.payload?.statusCode

      if (connection === 'close') {
        const isPairingFlow = mcode && !state.creds.registered

        if (pairingInProgress) {
          console.log(chalk.bold.yellow(`\n┆ Pairing en curso (+${path.basename(pathAYBot)}) esperando código...\n`))
          return
        }

        if ([428, 408, 515].includes(reason)) {
          if (mcode && !state.creds.registered && !pairingCodeSent) {
            console.log(chalk.bold.yellow(`\n┆ Pairing (+${path.basename(pathAYBot)}) esperando vinculación (${reason})\n`))
            return
          }
          console.log(chalk.bold.magentaBright(`\n┆ Subbot (+${path.basename(pathAYBot)}) desconectado (${reason}). Intentando reconectar...\n`))
          await creloadHandler(true).catch(console.error)
        }

        if ([405, 401].includes(reason)) {
          console.log(chalk.bold.magentaBright(`\n┆ Sesión inválida o cerrada manualmente. (+${path.basename(pathAYBot)})\n`))
          if (mcode && !state.creds.registered) {
            clearSubBotAuth(pathAYBot)
          } else {
            try {
              if (fs.existsSync(pathAYBot)) {
                fs.rmSync(pathAYBot, { recursive: true, force: true })
              }
            } catch (error) {
              console.log(chalk.bold.redBright(`\n┆ Error eliminando carpeta ${pathAYBot}: ${error.message}\n`))
            }
          }
        }

        if (reason === 440 || reason === 403) {
          console.log(chalk.bold.magentaBright(`\n┆ Sesión reemplazada o en soporte. Eliminando carpeta...\n`))
          try {
            if (fs.existsSync(pathAYBot)) {
          fs.rmSync(pathAYBot, { recursive: true, force: true })
            }
          } catch (error) {
            console.log(chalk.bold.redBright(`\n┆ Error eliminando carpeta ${pathAYBot}: ${error.message}\n`))
          }
        }

        if (reason === 500) {
          if (mcode && !state.creds.registered) {
            console.log(chalk.bold.yellow(`\n┆ Pairing (+${path.basename(pathAYBot)}) conexión interrumpida, esperando...\n`))
            return
          }
          console.log(chalk.bold.magentaBright(`\n┆ Conexión perdida. Eliminando sesión...\n`))
          return creloadHandler(true).catch(console.error)
        }
      }

      if (global.db.data == null) loadDatabase()

      if (connection === 'open') {
        if (!global.db.data?.users) loadDatabase()
        let userName = sock.authState.creds.me.name || 'Anónimo'
        let userJid = sock.authState.creds.me.jid || `${path.basename(pathAYBot)}@s.whatsapp.net`

        console.log(chalk.bold.cyanBright(`\n🟢 ${userName} (+${path.basename(pathAYBot)}) conectado exitosamente.`))
        sock.isInit = true
        sock.startTime = Date.now() 
        global.conns.push(sock)
        await joinChannels(sock)
        
       
                try {
          const botNumber = path.basename(pathAYBot)
          const configPath = path.join(pathAYBot, 'config.json')
          let nombreBot = global.namebot || 'PAIN BOT'
          
          if (fs.existsSync(configPath)) {
            try {
              const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
              if (config.name) nombreBot = config.name
            } catch (err) {}
          } else {
            
            const defaultConfig = {
              name: nombreBot,
              autoRead: false  
            }
            fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2))
          }
          
          const welcomeMessage = `🎉 𝗕𝗶𝗲𝗻𝘃𝗲𝗻𝗶𝗱𝗼


> *Te has convertido en un Sub-Bot exitosamente*

> *Nombre:* ${nombreBot}
> *Número:* +${botNumber}
> *Usuario:* ${userName}
> *Estado:* Conectado ✅
> *Auto-leer:* Desactivado ❌

✧ *Comandos de configuración:*
✧ *.setautoread on* - Activar auto-leer
✧ *.setautoread off* - Desactivar auto-leer`

          
          
          if (m && conn) {
            await conn.sendMessage(m.chat, {
              text: welcomeMessage,
              contextInfo: {
                ...rcanal.contextInfo
              }
            })
          }
          
        } catch (error) {
          console.error('Error enviando mensaje de bienvenida:', error)
        }
      }
    }

    setInterval(async () => {
      if (!sock.user) {
        try { sock.ws.close() } catch (e) { }
        sock.ev.removeAllListeners()
        let i = global.conns.indexOf(sock)
        if (i >= 0) {
          delete global.conns[i]
          global.conns.splice(i, 1)
        }
      }
    }, 60000)

    let handler = await import('../handler.js')
    let creloadHandler = async function (restatConn) {
      try {
        const Handler = await import(`../handler.js?update=${Date.now()}`).catch(console.error)
        if (Object.keys(Handler || {}).length) handler = Handler
      } catch (e) {
        console.error('Nuevo error: ', e)
      }

      if (restatConn) {
        const oldChats = sock.chats
        try { sock.ws.close() } catch { }
        sock.ev.removeAllListeners()
        sock = makeWASocket(connectionOptions, { chats: oldChats })
        isInit = true
      }

      if (!isInit) {
        sock.ev.off("messages.upsert", sock.handler)
        sock.ev.off("connection.update", sock.connectionUpdate)
        sock.ev.off("creds.update", sock.credsUpdate)
      }

      sock.handler = handler.handler.bind(sock)
      sock.connectionUpdate = connectionUpdate.bind(sock)
      sock.credsUpdate = saveCreds.bind(sock, true)

      initViewOnceAntiListener(sock)
      sock.ev.on("messages.upsert", sock.handler)
      sock.ev.on("connection.update", sock.connectionUpdate)
      sock.ev.on("creds.update", sock.credsUpdate)

      isInit = false
      return true
    }

    creloadHandler(false)
  })
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function msToTime(duration) {
  var milliseconds = parseInt((duration % 1000) / 100),
      seconds = Math.floor((duration / 1000) % 60),
      minutes = Math.floor((duration / (1000 * 60)) % 60),
      hours = Math.floor((duration / (1000 * 60 * 60)) % 24)
  hours = (hours < 10) ? '0' + hours : hours
  minutes = (minutes < 10) ? '0' + minutes : minutes
  seconds = (seconds < 10) ? '0' + seconds : seconds
  return minutes + ' m y ' + seconds + ' s '
}

async function joinChannels(conn) {
  if (!global.ch) return
  
  for (const channelId of Object.values(global.ch)) {
    try {

      if (typeof conn.newsletterFollow === 'function') {
        await conn.newsletterFollow(channelId).catch(console.error)
      }
    } catch (e) {
      console.error('Error al seguir el canal:', channelId, e)
    }
  }
}
