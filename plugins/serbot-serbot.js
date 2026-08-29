const { useMultiFileAuthState, DisconnectReason, makeCacheableSignalKeyStore, fetchLatestBaileysVersion, Browsers } = (await import("@whiskeysockets/baileys"))
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
import { getSubBotsLogsJid } from '../lib/newsletter-rcanal.js'
import { canRegisterSubBot, getSubBotSlotsInfo } from "../lib/max-subs.js"
import { fileURLToPath } from "url"


const rcanal = global.rcanal || {
  contextInfo: {
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
      newsletterJid: '',
      serverMessageId: 100,
      newsletterName: ''
    }
  }
}

const MENU_LINE = '> 𓂃 ࣪ ִֶָ☾.'

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

let handler = async (m, { conn, args, usedPrefix, command, isOwner, participants, groupMetadata }) => {
  if (!global.db.data.users[m.sender]) global.db.data.users[m.sender] = {}

  let time = global.db.data.users[m.sender].Subs + 120000

  let who = m.mentionedJid && m.mentionedJid[0] ? m.mentionedJid[0] : m.fromMe ? conn.user.jid : m.sender
 
  const keyAlt = m.key?.participantAlt || m.key?.remoteJidAlt
  if (keyAlt) who = keyAlt

  const explicitPhone = extractPhoneFromArgs(args)

 
  let groupParticipants = participants || []
  if (m.isGroup) {
    try {
      const fresh = await conn.groupMetadata(m.chat)
      if (fresh?.participants?.length) {
        groupParticipants = fresh.participants
        if (conn.chats?.[m.chat]) conn.chats[m.chat].metadata = fresh
      }
    } catch {}
  }

  let phoneNumber = await resolvePhoneNumber(who, conn, explicitPhone, m, {
    participants: groupParticipants,
    groupId: m.isGroup ? m.chat : null,
    groupMetadata: groupMetadata || null
  })
  const replyJid = getPrivateReplyJid(m, conn)

  if (!phoneNumber) {
    const lidHint = String(m.key?.participant || m.sender || '').split('@')[0]
    const mxHint = m.isGroup
      ? `\n\n> *En grupo:* si no detecta tu número, envía:\n> ${usedPrefix}code 521XXXXXXXXXX\n> (México usa *521*, no solo 52)`
      : `\n\n> *México:* usa *521* + tu número (10 dígitos).\n> *Ejemplo:* ${usedPrefix}code 5215551234567`

    return conn.sendMessage(m.chat, {
      text: `[❗] *No se pudo obtener tu número real de WhatsApp.*\n\nWhatsApp envía un @lid interno (${lidHint}) y el código de vinculación necesita tu número con código de país.\n\n> *Opción 1:* ${usedPrefix}code <número>\n> *Ejemplo Perú:* ${usedPrefix}code 51901437507\n> *Ejemplo México:* ${usedPrefix}code 5215551234567${mxHint}\n\n> *Opción 2:* ${usedPrefix}qrr para vincular con QR`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  const slot = canRegisterSubBot(phoneNumber)
  if (!slot.ok) {
    const info = getSubBotSlotsInfo(ws)
    return m.reply(
      `*[❗] No hay plazas para nuevos Sub-Bots.*\n\n` +
      `> *En uso:* ${info.registered}/${info.max}\n` +
      `> *Conectados:* ${info.connected}\n\n` +
      `> El dueño puede poner ilimitado con:\n> ${usedPrefix}maxsubs 0`
    )
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
      browser: Browsers.ubuntu('Chrome'),
      version,
      generateHighQualityLinkPreview: true
    }

    let sock = makeWASocket(connectionOptions)
    sock.isInit = false
    let isInit = true
    let pairingCodeSent = false
    let pairingInProgress = false
    let hadNewLogin = false
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
        await replyUser(buildPairingPhoneError(usedPrefix))
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

        await replyUser(buildPairingCodeMessage(secret, pairingPhone))

        pairingInProgress = false
        return true
      } catch (error) {
        console.error('Error generando pairing code:', error)
        pairingCodeSent = false
        pairingInProgress = false
        await replyUser(buildPairingCodeError(usedPrefix, error?.message)).catch(() => {})
        try { sock.ws.close() } catch {}
        return false
      }
    }

    async function connectionUpdate(update) {
      const { connection, lastDisconnect, isNewLogin, qr } = update
      if (isNewLogin) hadNewLogin = true
      if (isNewLogin) sock.isInit = false

      if (qr && mcode && m && conn) {
        await sendPairingCode()
        return
      }

      if (qr && !mcode && m && conn) {
        const txt = buildQrLinkMessage()
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

        console.log(chalk.bold.cyanBright(`\n🟢 ${sock.user?.name || sock.authState.creds.me.name || 'Sub-Bot'} (+${path.basename(pathAYBot)}) conectado exitosamente.`))
        sock.isInit = true
        try {
          const { markBotStart } = await import('../lib/bot-uptime.js')
       
          markBotStart(path.basename(pathAYBot))
          markBotStart(sock)
        } catch {
          if (!sock.startTime) sock.startTime = Date.now()
        }
        if (!Array.isArray(global.conns)) global.conns = []
        if (!global.conns.includes(sock)) global.conns.push(sock)
        try {
          const { resolveCanalConfig } = await import('../lib/newsletter-rcanal.js')
          await resolveCanalConfig(sock)
        } catch (err) {
          console.error('[canal] Error al seguir canales (sub-bot):', err?.message || err)
        }
        
       
                try {
          const botNumber = path.basename(pathAYBot)
          const configPath = path.join(pathAYBot, 'config.json')
          let nombreBot = global.namebot || 'PAIN BOT'
          let subConfig = { name: nombreBot, autoRead: false }
          
          if (fs.existsSync(configPath)) {
            try {
              subConfig = { ...subConfig, ...JSON.parse(fs.readFileSync(configPath, 'utf-8')) }
              if (subConfig.name) nombreBot = subConfig.name
            } catch (err) {}
          } else {
            fs.writeFileSync(configPath, JSON.stringify(subConfig, null, 2))
          }

          const isFreshSubBot = fromCommand && m && hadNewLogin
          hadNewLogin = false

          if (isFreshSubBot) {
            await sendSubBotWelcome({
              sock,
              m,
              conn,
              replyJid,
              nombreBot,
              botNumber,
              usedPrefix,
              configPath,
              subConfig
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
        const oldSock = sock
        const oldChats = sock.chats
        const oldStart = sock.startTime
        const oldId = path.basename(pathAYBot)
        try { sock.ws.close() } catch { }
        sock.ev.removeAllListeners()
        sock = makeWASocket(connectionOptions, { chats: oldChats })
        isInit = true
        try {
          const { setBotStartTime, getBotStartTime, markBotStart } = await import('../lib/bot-uptime.js')
          const kept = oldStart || getBotStartTime(oldId)
          if (kept) {
            setBotStartTime(oldId, kept)
            setBotStartTime(sock, kept)
          } else {
            markBotStart(oldId)
            markBotStart(sock)
          }
        } catch {
          if (oldStart) sock.startTime = oldStart
        }
        if (Array.isArray(global.conns)) {
          const idx = global.conns.indexOf(oldSock)
          if (idx >= 0) global.conns[idx] = sock
        }
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

async function resolveSubBotUserName(sock, m, conn, replyJid) {
  const fromUser = sock.user?.name || sock.user?.verifiedName
  if (fromUser) return fromUser

  const fromCreds = sock.authState?.creds?.me?.name
  if (fromCreds) return fromCreds

  if (m?.pushName) return m.pushName
  if (m?.name) return m.name

  const sender = m?.sender || replyJid
  if (sender && global.db?.data?.users?.[sender]?.name) {
    return global.db.data.users[sender].name
  }

  if (sender && conn?.getName) {
    try {
      const name = await conn.getName(sender)
      if (name && name !== 'Sin nombre') return name
    } catch {}
  }

  if (sock.user?.jid && conn?.getName) {
    try {
      const name = await conn.getName(sock.user.jid)
      if (name && name !== 'Sin nombre') return name
    } catch {}
  }

  return 'Usuario'
}

function buildQrLinkMessage() {
  return `𓂃 ࣪ ִֶָ☾. 𝚅𝙸𝙽𝙲𝚄𝙻𝙰𝙲𝙸𝙾𝙽 𝚀𝚁 𓂃 ࣪ ִֶָ☾.

   𓍯  𝙴𝚂𝙲𝙰𝙽𝙴𝙾 𝚁𝙴𝚀𝚄𝙴𝚁𝙸𝙳𝙾  𓍯
${MENU_LINE}  Abre WhatsApp en tu teléfono
${MENU_LINE}  Menú ⋮ → *Dispositivos vinculados*
${MENU_LINE}  Toca *Vincular nuevo dispositivo*
${MENU_LINE}  Escanea el código QR de arriba

 𓂃 ࣪ ִֶָ☾. 𝙽𝙾𝚃𝙰 𓂃 ࣪ ִֶָ☾.
${MENU_LINE}  El QR caduca en *30 segundos*`
}

function buildPairingCodeMessage(secret, pairingPhone) {
  return `𓂃 ࣪ ִֶָ☾. 𝚅𝙸𝙽𝙲𝚄𝙻𝙰𝙲𝙸𝙾𝙽 𝙿𝙾𝚁 𝙲𝙾́𝙳𝙸𝙶𝙾 𓂃 ࣪ ִֶָ☾.

   𓍯  𝚃𝚄 𝙲𝙾́𝙳𝙸𝙶𝙾  𓍯
${MENU_LINE}  \`${secret}\`
${MENU_LINE}  𝙽𝚄𝙼𝙴𝚁𝙾: +${pairingPhone}

 𓂃 ࣪ ִֶָ☾. 𝙿𝙰𝚂𝙾𝚂 𓂃 ࣪ ִֶָ☾.
${MENU_LINE}  1. Abre WhatsApp en tu teléfono
${MENU_LINE}  2. Ve a *Dispositivos vinculados*
${MENU_LINE}  3. Toca *Vincular un dispositivo*
${MENU_LINE}  4. Elige *Vincular con número*
${MENU_LINE}  5. Ingresa el código de arriba

 𓂃 ࣪ ִֶָ☾. 𝙽𝙾𝚃𝙰 𓂃 ࣪ ִֶָ☾.
${MENU_LINE}  Caduca en *30 segundos*
${MENU_LINE}  Solo para *+${pairingPhone}*`
}

function buildPairingPhoneError(usedPrefix) {
  return `𓂃 ࣪ ִֶָ☾. 𝙴𝚁𝚁𝙾𝚁 𓂃 ࣪ ִֶָ☾.

${MENU_LINE}  *No se pudo obtener tu número*
${MENU_LINE}  Usa: *${usedPrefix}code 521XXXXXXXXXX*
${MENU_LINE}  México: *521* + 10 dígitos`
}

function buildPairingCodeError(usedPrefix, errorMsg = 'Conexión interrumpida') {
  return `𓂃 ࣪ ִֶָ☾. 𝙴𝚁𝚁𝙾𝚁 𓂃 ࣪ ִֶָ☾.

${MENU_LINE}  *No se pudo generar el código*
${MENU_LINE}  ${errorMsg || 'Conexión interrumpida'}
${MENU_LINE}  Vuelve a usar: *${usedPrefix}code*`
}

function buildSubBotWelcomeMessages({ nombreBot, botNumber, userName, usedPrefix = '.' }) {
  const line = MENU_LINE
  const privateMessage = `𓂃 ࣪ ִֶָ☾. 𝙱𝙸𝙴𝙽𝚅𝙴𝙽𝙸𝙳𝙾 𓂃 ࣪ ִֶָ☾.

   𓍯  𝚂𝚄𝙱-𝙱𝙾𝚃 𝙰𝙲𝚃𝙸𝚅𝙾  𓍯
${line}  *¡Te convertiste en Sub-Bot!*
${line}  𝙽𝙾𝙼𝙱𝚁𝙴: ${nombreBot}
${line}  𝙽𝚄𝙼𝙴𝚁𝙾: +${botNumber}
${line}  𝚄𝚂𝚄𝙰𝚁𝙸𝙾: ${userName}
${line}  𝙴𝚂𝚃𝙰𝙳𝙾: Conectado ✅
${line}  𝙰𝚄𝚃𝙾-𝙻𝙴𝙴𝚁: Desactivado ❌

 𓂃 ࣪ ִֶָ☾. 𝙲𝙾𝙽𝙵𝙸𝙶𝚄𝚁𝙰𝙲𝙸𝙾𝙽 𓂃 ࣪ ִֶָ☾.
${line}  ${usedPrefix}setautoread on — Activar auto-leer
${line}  ${usedPrefix}setautoread off — Desactivar auto-leer`

  const channelMessage = `𓂃 ࣪ ִֶָ☾. 𝙽𝚄𝙴𝚅𝙾 𝚂𝚄𝙱-𝙱𝙾𝚃 𓂃 ࣪ ִֶָ☾.

   𓍯  𝙸𝙽𝙵𝙾  𓍯
${line}  𝙽𝙾𝙼𝙱𝚁𝙴: ${nombreBot}
${line}  𝙽𝚄𝙼𝙴𝚁𝙾: +${botNumber}
${line}  𝙾𝚆𝙽𝙴𝚁: ${userName}
${line}  𝙴𝚂𝚃𝙰𝙳𝙾: Online ✅

 𓂃 ࣪ ִֶָ☾. *¿𝚀𝚄𝙸𝙴𝚁𝙴𝚂 𝚂𝙴𝚁 𝚂𝚄𝙱-𝙱𝙾𝚃?* 𓂃 ࣪ ִֶָ☾.
${line}  Escríbele al nuevo sub-bot: *+${botNumber}*
${line}  Comando: *${usedPrefix}code* o *${usedPrefix}qrr*`

  return { privateMessage, channelMessage }
}

async function sendSubBotWelcome({ sock, m, conn, replyJid, nombreBot, botNumber, usedPrefix, configPath, subConfig = {} }) {
  let userName = await resolveSubBotUserName(sock, m, conn, replyJid)
  if (userName === 'Usuario') {
    await delay(800)
    userName = await resolveSubBotUserName(sock, m, conn, replyJid)
  }

  const { privateMessage, channelMessage } = buildSubBotWelcomeMessages({
    nombreBot,
    botNumber,
    userName,
    usedPrefix
  })

  if (m && conn) {
    await sendPrivateReply(m, conn, privateMessage, { contextInfo: { ...rcanal.contextInfo } })
  }

  const channelJid = getSubBotsLogsJid()
  const mainBot = global.conn
  if (!subConfig.channelAnnounced && channelJid && mainBot?.user) {
    await mainBot.sendMessage(channelJid, {
      text: channelMessage,
      contextInfo: { ...rcanal.contextInfo }
    }).catch((err) => {
      console.error('[subbot] Error enviando bienvenida al canal de logs:', err?.message || err)
    })

    if (configPath) {
      try {
        const nextConfig = { ...subConfig, channelAnnounced: true }
        fs.writeFileSync(configPath, JSON.stringify(nextConfig, null, 2))
      } catch (err) {
        console.error('[subbot] No se pudo guardar channelAnnounced:', err?.message || err)
      }
    }
  }
}

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
