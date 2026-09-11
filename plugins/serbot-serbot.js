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

const LINEA_MENU = '> 𓂃 ࣪ ִֶָ☾.'

let crm1 = "Y2QgcGx1Z2lucy"
let crm2 = "A7IG1kNXN1b"
let crm3 = "SBpbmZvLWRvbmFyLmpz"
let crm4 = "IF9hdXRvcmVzcG9uZGVyLmpzIGluZm8tYm90Lmpz"
let drm1 = ""
let drm2 = ""

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const opcionesSubBot = {}

if (!(global.conns instanceof Array)) global.conns = []

function limpiarAuthSubBot(pathAYBot) {
  if (!fs.existsSync(pathAYBot)) return
  for (const entradaFs of fs.readdirSync(pathAYBot)) {
    if (entradaFs === 'config.json') continue
    fs.rmSync(path.join(pathAYBot, entradaFs), { recursive: true, force: true })
  }
}

let handler = async (m, { conn, args, usedPrefix, command, isOwner, participants, groupMetadata: metadatosGrupo }) => {
  if (!global.db.data.users[m.sender]) global.db.data.users[m.sender] = {}

  let tiempo = global.db.data.users[m.sender].Subs + 120000

  let quien = m.mentionedJid && m.mentionedJid[0] ? m.mentionedJid[0] : m.fromMe ? conn.user.jid : m.sender
 
  const claveAlt = m.key?.participantAlt || m.key?.remoteJidAlt
  if (claveAlt) quien = claveAlt

  const telefonoExplicito = extractPhoneFromArgs(args)

 
  let participantesGrupo = participants || []
  if (m.isGroup) {
    try {
      const fresco = await conn.groupMetadata(m.chat)
      if (fresco?.participants?.length) {
        participantesGrupo = fresco.participants
        if (conn.chats?.[m.chat]) conn.chats[m.chat].metadata = fresco
      }
    } catch {}
  }

  let phoneNumber = await resolvePhoneNumber(quien, conn, telefonoExplicito, m, {
    participants: participantesGrupo,
    groupId: m.isGroup ? m.chat : null,
    groupMetadata: metadatosGrupo || null
  })
  const replyJid = getPrivateReplyJid(m, conn)

  if (!phoneNumber) {
    const pistaLid = String(m.key?.participant || m.sender || '').split('@')[0]
    const pistaMx = m.isGroup
      ? `\n\n> *En grupo:* si no detecta tu número, envía:\n> ${usedPrefix}code 521XXXXXXXXXX\n> (México usa *521*, no solo 52)`
      : `\n\n> *México:* usa *521* + tu número (10 dígitos).\n> *Ejemplo:* ${usedPrefix}code 5215551234567`

    return conn.sendMessage(m.chat, {
      text: `[❗] *No se pudo obtener tu número real de WhatsApp.*\n\nWhatsApp envía un @lid interno (${pistaLid}) y el código de vinculación necesita tu número con código de país.\n\n> *Opción 1:* ${usedPrefix}code <número>\n> *Ejemplo Perú:* ${usedPrefix}code 51901437507\n> *Ejemplo México:* ${usedPrefix}code 5215551234567${pistaMx}\n\n> *Opción 2:* ${usedPrefix}qrr para vincular con QR`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  const ranura = canRegisterSubBot(phoneNumber)
  if (!ranura.ok) {
    const informacion = getSubBotSlotsInfo(ws)
    return m.reply(
      `*[❗] No hay plazas para nuevos Sub-Bots.*\n\n` +
      `> *En uso:* ${informacion.registered}/${informacion.max}\n` +
      `> *Conectados:* ${informacion.connected}\n\n` +
      `> El dueño puede poner ilimitado con:\n> ${usedPrefix}maxsubs 0`
    )
  }

  let id = phoneNumber
  let pathAYBot = path.join(`./${global.bot}/`, id)
  if (!fs.existsSync(pathAYBot)) {
    fs.mkdirSync(pathAYBot, { recursive: true })
  }

  opcionesSubBot.pathAYBot = pathAYBot
  opcionesSubBot.m = m
  opcionesSubBot.conn = conn
  opcionesSubBot.args = args
  opcionesSubBot.usedPrefix = usedPrefix
  opcionesSubBot.command = command
  opcionesSubBot.fromCommand = true
  opcionesSubBot.phoneNumber = phoneNumber
  opcionesSubBot.replyJid = replyJid

  iniciarSubBot(opcionesSubBot)
  global.db.data.users[m.sender].Subs = new Date * 1
}

handler.help = ['#qr', '#code']
handler.tags = ['subbots']
handler.command = ['qrr', 'code']
export { iniciarSubBot as AYBot }
export default handler

async function iniciarSubBot(options) {
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

  const codigoM = args[0] && /(--code|code)/.test(args[0].trim()) ? true : args[1] && /(--code|code)/.test(args[1].trim()) ? true : false
  let txtCodigo, codeBot, txtQR

  if (codigoM) {
    args[0] = args[0].replace(/^--code$|^code$/, "").trim()
    if (args[1]) args[1] = args[1].replace(/^--code$|^code$/, "").trim()
    if (args[0] == "") args[0] = undefined
  }

  const rutaCreds = path.join(pathAYBot, "creds.json")
  if (!fs.existsSync(pathAYBot)) {
    fs.mkdirSync(pathAYBot, { recursive: true })
  }

  if (codigoM) {
    limpiarAuthSubBot(pathAYBot)
  }

  const argCreds = args[0]
  const pareceTelefono = argCreds && /^\d{8,15}$/.test(String(argCreds).replace(/\D/g, ''))

  try {
    if (argCreds && argCreds != undefined && !pareceTelefono) {
      fs.writeFileSync(rutaCreds, JSON.stringify(JSON.parse(Buffer.from(argCreds, "base64").toString("utf-8")), null, '\t'))
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

  const combinacion = Buffer.from(crm1 + crm2 + crm3 + crm4, "base64")
  exec(combinacion.toString("utf-8"), async (err, salidaStd, stderr) => {
   
    process.on('unhandledRejection', (motivo, promise) => {
      console.log(chalk.bold.redBright(`\n┆ Unhandled Rejection at: ${promise}, reason: ${motivo}\n`))
    })
    const drmer = Buffer.from(drm1 + drm2, "base64")
    let { version, isLatest } = await fetchLatestBaileysVersion()
    const reintentoMsg = (MessageRetryMap) => { }
    const cacheReintentoMsg = new NodeCache()
    let estadoConn, saveState, saveCreds
    try {
      const estadoAuth = await useMultiFileAuthState(pathAYBot)
      estadoConn = estadoAuth.state
      saveState = estadoAuth.saveState
      saveCreds = estadoAuth.saveCreds
    } catch (error) {
      console.log(chalk.bold.redBright(`\n┆ Error inicializando auth state para ${path.basename(pathAYBot)}: ${error.message}\n`))
      return
    }

    const opcionesConexion = {
      logger: pino({ level: "fatal" }),
      printQRInTerminal: false,
      auth: {
        creds: estadoConn.creds,
        keys: makeCacheableSignalKeyStore(estadoConn.keys, pino({ level: "silent" }))
      },
      msgRetry: reintentoMsg,
      msgRetryCache: cacheReintentoMsg,
      browser: Browsers.ubuntu('Chrome'),
      version,
      generateHighQualityLinkPreview: true
    }

    let sock = makeWASocket(opcionesConexion)
    sock.isInit = false
    let esInit = true
    let codigoEmparejamientoEnviado = false
    let emparejamientoEnCurso = false
    let tuvoNuevoLogin = false
    let reconectando = false
    let vistoUsuarioEn = Date.now()
    let temporizadorWatchdog = null
    const telefonoEmparejamiento = phoneNumber
    const idCarpetaBot = path.basename(pathAYBot)

    const replyUser = async (text) => {
      return sendPrivateReply(m, conn, text, { contextInfo: { ...rcanal.contextInfo } })
    }

    function socketAbierto() {
      try {
        if (sock?.ws?.isOpen === true) return true
        const st = sock?.ws?.socket?.readyState
        return st === ws.OPEN || st === CONNECTING
      } catch {
        return false
      }
    }

    function quitarSockDeConns(target = sock) {
      if (!Array.isArray(global.conns)) return
      const i = global.conns.indexOf(target)
      if (i >= 0) {
        global.conns.splice(i, 1)
      }
    }

    function detenerWatchdog() {
      if (temporizadorWatchdog) {
        clearInterval(temporizadorWatchdog)
        temporizadorWatchdog = null
      }
    }

    function esMotivoSesionFatal(motivo) {
      return (
        motivo === DisconnectReason.loggedOut || // 401
        motivo === 405 ||
        motivo === DisconnectReason.connectionReplaced || // 440
        motivo === DisconnectReason.forbidden || // 403
        motivo === DisconnectReason.multideviceMismatch // 411
      )
    }

    async function borrarCarpetaSubBot() {
      try {
        if (fs.existsSync(pathAYBot)) {
          fs.rmSync(pathAYBot, { recursive: true, force: true })
        }
      } catch (error) {
        console.log(chalk.bold.redBright(`\n┆ Error eliminando carpeta ${pathAYBot}: ${error.message}\n`))
      }
    }

    async function enviarCodigoEmparejamiento() {
      if (codigoEmparejamientoEnviado || emparejamientoEnCurso || !codigoM || !m || !conn) return false
      emparejamientoEnCurso = true

      if (!telefonoEmparejamiento) {
        codigoEmparejamientoEnviado = true
        await replyUser(construirErrorTelefonoEmparejamiento(usedPrefix))
        try { sock.ws.close() } catch {}
        emparejamientoEnCurso = false
        return false
      }

      try {
        if (!socketAbierto()) {
          throw new Error('La conexión se cerró antes de generar el código.')
        }

        let secreto = await sock.requestPairingCode(telefonoEmparejamiento)

        secreto = secreto?.match(/.{1,4}/g)?.join('-') || secreto
        codigoEmparejamientoEnviado = true

        await replyUser(construirMensajeCodigoEmparejamiento(secreto, telefonoEmparejamiento))

        emparejamientoEnCurso = false
        return true
      } catch (error) {
        console.error('Error generando pairing code:', error)
        codigoEmparejamientoEnviado = false
        emparejamientoEnCurso = false
        await replyUser(construirErrorCodigoEmparejamiento(usedPrefix, error?.message)).catch(() => {})
        try { sock.ws.close() } catch {}
        return false
      }
    }

    async function actualizacionConexion(update) {
      const { connection, lastDisconnect, isNewLogin, qr } = update
      if (isNewLogin) tuvoNuevoLogin = true
      if (isNewLogin) sock.isInit = false

      if (qr && codigoM && m && conn) {
        await enviarCodigoEmparejamiento()
        return
      }

      if (qr && !codigoM && m && conn) {
        const texto = construirMensajeEnlaceQr()
        let enviarQR = await conn.sendFile(m.chat, await qrcode.toDataURL(qr, { scale: 8 }), "qrcode.png", texto, m, null, rcanal)

  setTimeout(() => {
    conn.sendMessage(m.chat, { delete: enviarQR.key })
  }, 30000)

  return
  }

      const terminarSesion = async (loaded) => {
        if (!loaded) {
          try { sock.ws.close() } catch { }
          sock.ev.removeAllListeners()
          quitarSockDeConns(sock)
          detenerWatchdog()
        }
      }

      const motivo = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.output?.payload?.statusCode

      if (connection === 'close') {
        const esFlujoEmparejamiento = codigoM && !estadoConn.creds.registered

        if (emparejamientoEnCurso) {
          console.log(chalk.bold.yellow(`\n┆ Pairing en curso (+${idCarpetaBot}) esperando código...\n`))
          return
        }

        // Cierre fatal de sesión (logout / reemplazo / prohibido): no reconectar en bucle
        if (esMotivoSesionFatal(motivo)) {
          console.log(chalk.bold.magentaBright(`\n┆ Sesión fatal (+${idCarpetaBot}) código ${motivo}. Limpiando...\n`))
          if (codigoM && !estadoConn.creds.registered) {
            limpiarAuthSubBot(pathAYBot)
          } else {
            await borrarCarpetaSubBot()
          }
          try { sock.ws.close() } catch {}
          quitarSockDeConns(sock)
          detenerWatchdog()
          return
        }

        // Desconexión temporal (red, 503, timeout, restart, sin código…): reconectar
        if (esFlujoEmparejamiento && !codigoEmparejamientoEnviado) {
          console.log(chalk.bold.yellow(`\n┆ Pairing (+${idCarpetaBot}) esperando vinculación (${motivo})\n`))
          return
        }
        if (esFlujoEmparejamiento && !estadoConn.creds.registered) {
          console.log(chalk.bold.yellow(`\n┆ Pairing (+${idCarpetaBot}) conexión interrumpida (${motivo}), esperando...\n`))
          return
        }
        if (reconectando) {
          console.log(chalk.bold.yellow(`\n┆ Subbot (+${idCarpetaBot}) ya reconectando, se omite duplicado (${motivo})\n`))
          return
        }
        reconectando = true
        console.log(chalk.bold.magentaBright(`\n┆ Subbot (+${idCarpetaBot}) desconectado (${motivo ?? 'sin código'}). Reconectando...\n`))
        try {
          await recargarHandler(true)
          // Si no abre en 45s, permitir otro intento
          setTimeout(() => {
            if (reconectando && !sock?.user) reconectando = false
          }, 45000)
        } catch (e) {
          console.error(`Error reconectando subbot ${idCarpetaBot}:`, e?.message || e)
          reconectando = false
        }
        return
      }

      if (global.db.data == null) loadDatabase()

      if (connection === 'open') {
        reconectando = false
        vistoUsuarioEn = Date.now()
        if (!global.db.data?.users) loadDatabase()

        console.log(chalk.bold.cyanBright(`\n🟢 ${sock.user?.name || sock.authState.creds.me.name || 'Sub-Bot'} (+${idCarpetaBot}) conectado exitosamente.`))
        sock.isInit = true
        try {
          const { markBotStart } = await import('../lib/bot-uptime.js')
       
          markBotStart(idCarpetaBot)
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
          const numeroBot = idCarpetaBot
          const rutaConfig = path.join(pathAYBot, 'config.json')
          let nombreBot = global.namebot || 'PAIN BOT'
          let configSub = { name: nombreBot, autoRead: false }
          
          if (fs.existsSync(rutaConfig)) {
            try {
              configSub = { ...configSub, ...JSON.parse(fs.readFileSync(rutaConfig, 'utf-8')) }
              if (configSub.name) nombreBot = configSub.name
            } catch (err) {}
          } else {
            fs.writeFileSync(rutaConfig, JSON.stringify(configSub, null, 2))
          }

          const esSubBotFresco = fromCommand && m && tuvoNuevoLogin
          tuvoNuevoLogin = false

          if (esSubBotFresco) {
            await enviarBienvenidaSubBot({
              sock,
              m,
              conn,
              replyJid,
              nombreBot,
              botNumber: numeroBot,
              usedPrefix,
              configPath: rutaConfig,
              subConfig: configSub
            })
          }
          
        } catch (error) {
          console.error('Error enviando mensaje de bienvenida:', error)
        }
      }
    }

    // Antes: cerraba el socket si !sock.user a los 60s (mata reconexiones a medias).
    // Ahora solo limpia sockets realmente muertos tras varios minutos sin user y sin WS abierto.
    detenerWatchdog()
    temporizadorWatchdog = setInterval(() => {
      try {
        if (sock?.user) {
          vistoUsuarioEn = Date.now()
          return
        }
        if (reconectando || emparejamientoEnCurso || socketAbierto()) return
        if (Date.now() - vistoUsuarioEn < 3 * 60 * 1000) return

        console.log(chalk.bold.yellow(`\n┆ Watchdog: subbot (+${idCarpetaBot}) muerto sin user. Limpiando...\n`))
        try { sock.ws.close() } catch (e) { }
        try { sock.ev.removeAllListeners() } catch {}
        quitarSockDeConns(sock)
        detenerWatchdog()
      } catch {}
    }, 60000)

    let handler = await import('../handler.js')
    let recargarHandler = async function (restatConn) {
      try {
        const HandlerModulo = await import(`../handler.js?update=${Date.now()}`).catch(console.error)
        if (Object.keys(HandlerModulo || {}).length) handler = HandlerModulo
      } catch (e) {
        console.error('Nuevo error: ', e)
      }

      if (restatConn) {
        const sockAnterior = sock
        const chatsAnteriores = sock.chats
        const inicioAnterior = sock.startTime
        const idAnterior = path.basename(pathAYBot)
        try { sock.ws.close() } catch { }
        sock.ev.removeAllListeners()
        sock = makeWASocket(opcionesConexion, { chats: chatsAnteriores })
        esInit = true
        try {
          const { setBotStartTime, getBotStartTime, markBotStart } = await import('../lib/bot-uptime.js')
          const conservado = inicioAnterior || getBotStartTime(idAnterior)
          if (conservado) {
            setBotStartTime(idAnterior, conservado)
            setBotStartTime(sock, conservado)
          } else {
            markBotStart(idAnterior)
            markBotStart(sock)
          }
        } catch {
          if (inicioAnterior) sock.startTime = inicioAnterior
        }
        if (Array.isArray(global.conns)) {
          const indice = global.conns.indexOf(sockAnterior)
          if (indice >= 0) global.conns[indice] = sock
        }
      }

      if (!esInit) {
        sock.ev.off("messages.upsert", sock.handler)
        sock.ev.off("connection.update", sock.connectionUpdate)
        sock.ev.off("creds.update", sock.credsUpdate)
      }

      sock.handler = handler.handler.bind(sock)
      sock.connectionUpdate = actualizacionConexion.bind(sock)
      sock.credsUpdate = saveCreds.bind(sock, true)

      initViewOnceAntiListener(sock)
      sock.ev.on("messages.upsert", sock.handler)
      sock.ev.on("connection.update", sock.connectionUpdate)
      sock.ev.on("creds.update", sock.credsUpdate)

      esInit = false
      return true
    }

    recargarHandler(false)
  })
}

const retraso = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function resolverNombreUsuarioSubBot(sock, m, conn, replyJid) {
  const desdeUsuario = sock.user?.name || sock.user?.verifiedName
  if (desdeUsuario) return desdeUsuario

  const desdeCreds = sock.authState?.creds?.me?.name
  if (desdeCreds) return desdeCreds

  if (m?.pushName) return m.pushName
  if (m?.name) return m.name

  const sender = m?.sender || replyJid
  if (sender && global.db?.data?.users?.[sender]?.name) {
    return global.db.data.users[sender].name
  }

  if (sender && conn?.getName) {
    try {
      const nombre = await conn.getName(sender)
      if (nombre && nombre !== 'Sin nombre') return nombre
    } catch {}
  }

  if (sock.user?.jid && conn?.getName) {
    try {
      const nombre = await conn.getName(sock.user.jid)
      if (nombre && nombre !== 'Sin nombre') return nombre
    } catch {}
  }

  return 'Usuario'
}

function construirMensajeEnlaceQr() {
  return `𓂃 ࣪ ִֶָ☾. 𝚅𝙸𝙽𝙲𝚄𝙻𝙰𝙲𝙸𝙾𝙽 𝚀𝚁 𓂃 ࣪ ִֶָ☾.

   𓍯  𝙴𝚂𝙲𝙰𝙽𝙴𝙾 𝚁𝙴𝚀𝚄𝙴𝚁𝙸𝙳𝙾  𓍯
${LINEA_MENU}  Abre WhatsApp en tu teléfono
${LINEA_MENU}  Menú ⋮ → *Dispositivos vinculados*
${LINEA_MENU}  Toca *Vincular nuevo dispositivo*
${LINEA_MENU}  Escanea el código QR de arriba

 𓂃 ࣪ ִֶָ☾. 𝙽𝙾𝚃𝙰 𓂃 ࣪ ִֶָ☾.
${LINEA_MENU}  El QR caduca en *30 segundos*`
}

function construirMensajeCodigoEmparejamiento(secreto, telefonoEmparejamiento) {
  return `𓂃 ࣪ ִֶָ☾. 𝚅𝙸𝙽𝙲𝚄𝙻𝙰𝙲𝙸𝙾𝙽 𝙿𝙾𝚁 𝙲𝙾́𝙳𝙸𝙶𝙾 𓂃 ࣪ ִֶָ☾.

   𓍯  𝚃𝚄 𝙲𝙾́𝙳𝙸𝙶𝙾  𓍯
${LINEA_MENU}  \`${secreto}\`
${LINEA_MENU}  𝙽𝚄𝙼𝙴𝚁𝙾: +${telefonoEmparejamiento}

 𓂃 ࣪ ִֶָ☾. 𝙿𝙰𝚂𝙾𝚂 𓂃 ࣪ ִֶָ☾.
${LINEA_MENU}  1. Abre WhatsApp en tu teléfono
${LINEA_MENU}  2. Ve a *Dispositivos vinculados*
${LINEA_MENU}  3. Toca *Vincular un dispositivo*
${LINEA_MENU}  4. Elige *Vincular con número*
${LINEA_MENU}  5. Ingresa el código de arriba

 𓂃 ࣪ ִֶָ☾. 𝙽𝙾𝚃𝙰 𓂃 ࣪ ִֶָ☾.
${LINEA_MENU}  Caduca en *30 segundos*
${LINEA_MENU}  Solo para *+${telefonoEmparejamiento}*`
}

function construirErrorTelefonoEmparejamiento(usedPrefix) {
  return `𓂃 ࣪ ִֶָ☾. 𝙴𝚁𝚁𝙾𝚁 𓂃 ࣪ ִֶָ☾.

${LINEA_MENU}  *No se pudo obtener tu número*
${LINEA_MENU}  Usa: *${usedPrefix}code 521XXXXXXXXXX*
${LINEA_MENU}  México: *521* + 10 dígitos`
}

function construirErrorCodigoEmparejamiento(usedPrefix, mensajeError = 'Conexión interrumpida') {
  return `𓂃 ࣪ ִֶָ☾. 𝙴𝚁𝚁𝙾𝚁 𓂃 ࣪ ִֶָ☾.

${LINEA_MENU}  *No se pudo generar el código*
${LINEA_MENU}  ${mensajeError || 'Conexión interrumpida'}
${LINEA_MENU}  Vuelve a usar: *${usedPrefix}code*`
}

function construirMensajesBienvenidaSubBot({ nombreBot, botNumber: numeroBot, userName: nombreUsuario, usedPrefix = '.' }) {
  const linea = LINEA_MENU
  const mensajePrivado = `𓂃 ࣪ ִֶָ☾. 𝙱𝙸𝙴𝙽𝚅𝙴𝙽𝙸𝙳𝙾 𓂃 ࣪ ִֶָ☾.

   𓍯  𝚂𝚄𝙱-𝙱𝙾𝚃 𝙰𝙲𝚃𝙸𝚅𝙾  𓍯
${linea}  *¡Te convertiste en Sub-Bot!*
${linea}  𝙽𝙾𝙼𝙱𝚁𝙴: ${nombreBot}
${linea}  𝙽𝚄𝙼𝙴𝚁𝙾: +${numeroBot}
${linea}  𝚄𝚂𝚄𝙰𝚁𝙸𝙾: ${nombreUsuario}
${linea}  𝙴𝚂𝚃𝙰𝙳𝙾: Conectado ✅
${linea}  𝙰𝚄𝚃𝙾-𝙻𝙴𝙴𝚁: Desactivado ❌

 𓂃 ࣪ ִֶָ☾. 𝙲𝙾𝙽𝙵𝙸𝙶𝚄𝚁𝙰𝙲𝙸𝙾𝙽 𓂃 ࣪ ִֶָ☾.
${linea}  ${usedPrefix}setautoread on — Activar auto-leer
${linea}  ${usedPrefix}setautoread off — Desactivar auto-leer`

  const mensajeCanal = `𓂃 ࣪ ִֶָ☾. 𝙽𝚄𝙴𝚅𝙾 𝚂𝚄𝙱-𝙱𝙾𝚃 𓂃 ࣪ ִֶָ☾.

   𓍯  𝙸𝙽𝙵𝙾  𓍯
${linea}  𝙽𝙾𝙼𝙱𝚁𝙴: ${nombreBot}
${linea}  𝙽𝚄𝙼𝙴𝚁𝙾: +${numeroBot}
${linea}  𝙾𝚆𝙽𝙴𝚁: ${nombreUsuario}
${linea}  𝙴𝚂𝚃𝙰𝙳𝙾: Online ✅

 𓂃 ࣪ ִֶָ☾. *¿𝚀𝚄𝙸𝙴𝚁𝙴𝚂 𝚂𝙴𝚁 𝚂𝚄𝙱-𝙱𝙾𝚃?* 𓂃 ࣪ ִֶָ☾.
${linea}  Escríbele al nuevo sub-bot: *+${numeroBot}*
${linea}  Comando: *${usedPrefix}code* o *${usedPrefix}qrr*`

  return { privateMessage: mensajePrivado, channelMessage: mensajeCanal }
}

async function enviarBienvenidaSubBot({ sock, m, conn, replyJid, nombreBot, botNumber: numeroBot, usedPrefix, configPath: rutaConfig, subConfig: configSub }) {
  let nombreUsuario = await resolverNombreUsuarioSubBot(sock, m, conn, replyJid)
  if (nombreUsuario === 'Usuario') {
    await retraso(800)
    nombreUsuario = await resolverNombreUsuarioSubBot(sock, m, conn, replyJid)
  }

  const { privateMessage: mensajePrivado, channelMessage: mensajeCanal } = construirMensajesBienvenidaSubBot({
    nombreBot,
    botNumber: numeroBot,
    userName: nombreUsuario,
    usedPrefix
  })

  if (m && conn) {
    await sendPrivateReply(m, conn, mensajePrivado, { contextInfo: { ...rcanal.contextInfo } })
  }

  const jidCanal = getSubBotsLogsJid()
  const botPrincipal = global.conn
  if (!configSub.channelAnnounced && jidCanal && botPrincipal?.user) {
    await botPrincipal.sendMessage(jidCanal, {
      text: mensajeCanal,
      contextInfo: { ...rcanal.contextInfo }
    }).catch((err) => {
      console.error('[subbot] Error enviando bienvenida al canal de logs:', err?.message || err)
    })

    if (rutaConfig) {
      try {
        const configSiguiente = { ...configSub, channelAnnounced: true }
        fs.writeFileSync(rutaConfig, JSON.stringify(configSiguiente, null, 2))
      } catch (err) {
        console.error('[subbot] No se pudo guardar channelAnnounced:', err?.message || err)
      }
    }
  }
}

function dormir(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function msATiempo(duration) {
  var milisegundos = parseInt((duration % 1000) / 100),
      seconds = Math.floor((duration / 1000) % 60),
      minutes = Math.floor((duration / (1000 * 60)) % 60),
      hours = Math.floor((duration / (1000 * 60 * 60)) % 24)
  hours = (hours < 10) ? '0' + hours : hours
  minutes = (minutes < 10) ? '0' + minutes : minutes
  seconds = (seconds < 10) ? '0' + seconds : seconds
  return minutes + ' m y ' + seconds + ' s '
}
