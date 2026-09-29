const { useMultiFileAuthState, DisconnectReason, makeCacheableSignalKeyStore, fetchLatestBaileysVersion, Browsers } = (await import("@whiskeysockets/baileys"))
import qrcode from "qrcode"
import NodeCache from "node-cache"
import fs from "fs"
import path from "path"
import pino from "pino"
import chalk from "chalk"
import util from "util"
import * as ws from "ws"
const { CONNECTING } = ws
import { makeWASocket } from "../lib/simple.js"
import { conSocketEstable } from "../lib/socket-estable.js"
import { initViewOnceAntiListener } from "../lib/viewOnce.js"
import { resolvePhoneNumber, extractPhoneFromArgs, getPrivateReplyJid, sendPrivateReply } from "../lib/resolve-phone.js"
import { esModoIos } from '../lib/menu-modo.js'
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

const CODIGO_EMPAREJAMIENTO = 'PAINBOTM'
let versionBaileysCache = null

async function obtenerVersionBaileys() {
  if (versionBaileysCache) return versionBaileysCache
  const { version } = await fetchLatestBaileysVersion()
  versionBaileysCache = version
  return version
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const opcionesSubBot = {}

if (!(global.conns instanceof Array)) global.conns = []

function variantesNumero(numero) {
  const d = String(numero || '').split('@')[0].split(':')[0].replace(/\D/g, '')
  const set = new Set()
  if (d.length < 8) return set
  set.add(d)
  if (d.startsWith('521') && d.length >= 12) set.add(`52${d.slice(3)}`)
  if (d.startsWith('52') && !d.startsWith('521') && d.length >= 11) set.add(`521${d.slice(2)}`)
  if (d.startsWith('549') && d.length >= 12) set.add(`54${d.slice(3)}`)
  if (d.startsWith('54') && !d.startsWith('549') && d.length >= 11) set.add(`549${d.slice(2)}`)
  return set
}

function numerosCoinciden(a, b) {
  const A = variantesNumero(a)
  if (!A.size) return false
  for (const n of variantesNumero(b)) if (A.has(n)) return true
  return false
}

function sesionDeNumero(numero) {
  if (!numero || String(numero).startsWith('tmp')) return null

  for (const c of global.conns || []) {
    const candidatos = [
      c?.phoneNumber,
      c?.botNumber,
      c?.user?.jid,
      c?.user?.id,
      c?.authState?.creds?.me?.id
    ]
    if (!candidatos.some(v => numerosCoinciden(numero, v))) continue
    const abierto = c?.ws?.isOpen === true || c?.ws?.socket?.readyState === 1
    if (c?.user && abierto) return 'activa'
    if (c?.user || c?.authState?.creds?.registered) return 'guardada'
  }

  const raiz = path.join(process.cwd(), global.bot || 'Serbot')
  if (!fs.existsSync(raiz)) return null
  for (const carpeta of fs.readdirSync(raiz)) {
    if (!numerosCoinciden(numero, carpeta)) continue
    const ruta = path.join(raiz, carpeta, 'creds.json')
    if (!fs.existsSync(ruta)) continue
    try {
      const creds = JSON.parse(fs.readFileSync(ruta, 'utf8'))
      if (creds?.registered) return 'guardada'
    } catch {}
  }
  return null
}

function avisarSesionExistente(conn, m, numero, tipo, usedPrefix = '.') {
  const titulo = tipo === 'activa' ? 'sesión activa' : 'sesión guardada'
  const estado = tipo === 'activa' ? 'ya está conectado' : 'ya está vinculada'
  const pref = usedPrefix || '.'
  return conn.sendMessage(m.chat, {
    text: `
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *${titulo}*
╰─ ✧  ✩
┊ \`+${numero}\`
┊ ${estado}
┊ no hace falta otro código
┊ desvincular  ·  \`${pref}delsession\`
╰─────────`.trim(),
    contextInfo: { ...rcanal.contextInfo }
  }, { quoted: m })
}

function limpiarAuthSubBot(pathAYBot) {
  if (!fs.existsSync(pathAYBot)) return
  const preservar = new Set([
    'config.json',
    'staff.json',
    'soporte.json'
  ])
  for (const entradaFs of fs.readdirSync(pathAYBot)) {
    if (preservar.has(entradaFs)) continue
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

  const pideQr = command === 'qr' || command === 'qrr'
  if (!phoneNumber && !pideQr) {
    const pistaLid = String(m.key?.participant || m.sender || '').split('@')[0]
    const ejemploMx = `${usedPrefix}code 5215551234567`
    const ejemploPe = `${usedPrefix}code 51901662987`

    return conn.sendMessage(m.chat, {
      text: `
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *no se detectó tu número*
╰─ ✧  ✩
┊ whatsapp envió un id interno
┊ \`${pistaLid}\`
┊ hace falta tu número con país
┊ \`${usedPrefix}code <número>\`
┊ \`${ejemploPe}\`  ·  perú
┊ \`${ejemploMx}\`  ·  méxico 521
┊ o  \`${usedPrefix}qr\`
╰─────────`.trim(),
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  if (phoneNumber) {
    const ya = sesionDeNumero(phoneNumber)
    if (ya) return avisarSesionExistente(conn, m, phoneNumber, ya, usedPrefix)
  }

  if (!phoneNumber) phoneNumber = `tmp${Date.now()}`

  const ranura = canRegisterSubBot(phoneNumber)
  if (!ranura.ok) {
    const informacion = getSubBotSlotsInfo(ws)
    return m.reply(`
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *sin plazas*
╰─ ✧  ✩
┊ en uso  ·  \`${informacion.registered}/${informacion.max}\`
┊ conectados  ·  \`${informacion.connected}\`
┊ \`${usedPrefix}maxsubs 0\`
╰─────────`.trim())
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
handler.command = ['qr', 'qrr', 'code']
export { iniciarSubBot as AYBot }
export default handler

async function iniciarSubBot(options) {
  let { pathAYBot, m, conn, args, usedPrefix, command, fromCommand = true, phoneNumber = null, replyJid = null } = options
  
 
  if (!fromCommand) {
    command = 'qr'
    args = []
    usedPrefix = '.'
  }
  
  if (command === 'code') {
    command = 'qr'
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

  if (fromCommand && fs.existsSync(rutaCreds)) {
    try {
      const previa = JSON.parse(fs.readFileSync(rutaCreds, 'utf8'))
      if (previa?.registered) {
        if (m && conn) await avisarSesionExistente(conn, m, path.basename(pathAYBot), 'guardada', usedPrefix)
        return
      }
    } catch {}
  }

  if (fromCommand) {
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
        text: `
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *vincular*
╰─ ✧  ✩
┊ \`${usedPrefix}code\`  ·  código
┊ \`${usedPrefix}qr\`  ·  qr
╰─────────`.trim(),
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }
    return
  }

  void (async () => {
    const version = await obtenerVersionBaileys()
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

    const opcionesConexion = conSocketEstable({
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
      markOnlineOnConnect: false,
      qrTimeout: 120_000,
    })

    let sock = makeWASocket(opcionesConexion)
    sock.isInit = false
    let esInit = true
    let codigoEmparejamientoEnviado = false
    let emparejamientoEnCurso = false
    let tuvoNuevoLogin = false
    let reconectando = false
    let qrYaEnviado = false
    let claveMensajeVinculo = null
    let temporizadorVinculo = null
    let vistoUsuarioEn = Date.now()
    let temporizadorWatchdog = null
    const telefonoEmparejamiento = phoneNumber
    const idCarpetaBot = path.basename(pathAYBot)

    const replyUser = async (text) => {
      return sendPrivateReply(m, conn, text, { contextInfo: { ...rcanal.contextInfo } })
    }

    async function borrarMensajeVinculo() {
      if (temporizadorVinculo) {
        clearTimeout(temporizadorVinculo)
        temporizadorVinculo = null
      }
      const clave = claveMensajeVinculo
      claveMensajeVinculo = null
      if (!clave || !conn) return
      await conn.sendMessage(m.chat, { delete: clave }).catch(() => {})
    }

    function programarBorradoVinculo(clave) {
      claveMensajeVinculo = clave || null
      if (temporizadorVinculo) clearTimeout(temporizadorVinculo)
      temporizadorVinculo = setTimeout(() => {
        borrarMensajeVinculo().catch(() => {})
      }, 60000)
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

        await new Promise((resolver) => setImmediate(resolver))
        let secreto = await sock.requestPairingCode(telefonoEmparejamiento, CODIGO_EMPAREJAMIENTO)

        secreto = secreto?.match(/.{1,4}/g)?.join('-') || secreto
        codigoEmparejamientoEnviado = true

        const textoCodigo = construirMensajeCodigoEmparejamiento(secreto, telefonoEmparejamiento)
        const jid = getPrivateReplyJid(m, conn)
        let enviado
        if (esModoIos(conn)) {
          enviado = await replyUser(textoCodigo)
        } else {
        try {
          enviado = await conn.sendMessageLia(jid, {
            text: textoCodigo,
            footer: 'copiar código',
            nativeFlow: [{ text: 'Copiar código', copy: secreto }],
            linkPreview: null
          }, { quoted: m, keepQuoted: true })
        } catch (errorBoton) {
          console.error('[code] No se pudo enviar el botón de copiar:', errorBoton?.message || errorBoton)
          enviado = await replyUser(textoCodigo)
        }
        }
        programarBorradoVinculo(enviado?.key)

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
        if (qrYaEnviado) return
        qrYaEnviado = true
        try {
          const buffer = await qrcode.toBuffer(qr, { scale: 8, margin: 2 })
          const enviado = await conn.sendMessage(m.chat, {
            image: buffer,
            caption: construirMensajeEnlaceQr(),
            contextInfo: { ...rcanal.contextInfo }
          }, { quoted: m })
          programarBorradoVinculo(enviado?.key)
        } catch (errorQr) {
          qrYaEnviado = false
          console.error('Error enviando QR:', errorQr?.message || errorQr)
          await conn.sendMessage(m.chat, {
            text: `[❌] No se pudo generar el QR.\n> Vuelve a usar *${usedPrefix}qr*`,
            contextInfo: { ...rcanal.contextInfo }
          }, { quoted: m }).catch(() => {})
        }
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

    
        if (esFlujoEmparejamiento && !estadoConn.creds.registered) {
          console.log(chalk.bold.yellow(`\n┆ Pairing (+${idCarpetaBot}) conexión interrumpida (${motivo ?? 'sin código'}). No se toca al resto.\n`))
          try { sock.ev.removeAllListeners() } catch {}
          detenerWatchdog()
          return
        }
        if (reconectando) {
          return
        }
        reconectando = true
        console.log(chalk.bold.magentaBright(`\n┆ Subbot (+${idCarpetaBot}) desconectado (${motivo ?? 'sin código'}). Reconectando...\n`))
        // Fuera del evento de conexión y sin recargar handler.js,
        // para que el principal y los demás subbots sigan respondiendo.
        setTimeout(() => {
          recargarHandler(true).catch((e) => {
            console.error(`Error reconectando subbot ${idCarpetaBot}:`, e?.message || e)
            reconectando = false
          })
        }, 3000)
        return
      }

      if (global.db.data == null) loadDatabase()

      if (connection === 'open') {
        reconectando = false
        vistoUsuarioEn = Date.now()
        await borrarMensajeVinculo().catch(() => {})
        if (!global.db.data?.users) loadDatabase()

        console.log(chalk.bold.cyanBright(`\n🟢 ${sock.user?.name || sock.authState.creds.me.name || 'Sub-Bot'} (+${idCarpetaBot}) conectado exitosamente.`))
        sock.isInit = true
        sock.phoneNumber = idCarpetaBot
        sock.botNumber = idCarpetaBot
        sock.pathAYBot = pathAYBot
        try {
          const { aplicarIdioma } = await import('../lib/lang.js')
          aplicarIdioma(sock)
        } catch {}
        try {
          const { markBotStart } = await import('../lib/bot-uptime.js')
       
          markBotStart(idCarpetaBot)
          markBotStart(sock)
        } catch {
          if (!sock.startTime) sock.startTime = Date.now()
        }
        if (!Array.isArray(global.conns)) global.conns = []
        if (!global.conns.includes(sock)) global.conns.push(sock)
        if (!sock.vistaUnicaLista) {
          sock.vistaUnicaLista = true
          initViewOnceAntiListener(sock)
        }
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
        setTimeout(() => {
          if (reconectando && !sock?.user) reconectando = false
        }, 45000)
      }

      if (!esInit) {
        sock.ev.off("messages.upsert", sock.handler)
        sock.ev.off("connection.update", sock.connectionUpdate)
        sock.ev.off("creds.update", sock.credsUpdate)
      }

      sock.handler = async function (chatUpdate) {
        if (!sock.authState?.creds?.registered) return
        return handler.handler.call(sock, chatUpdate)
      }
      sock.connectionUpdate = actualizacionConexion.bind(sock)
      sock.credsUpdate = saveCreds.bind(sock, true)

      if (sock.authState?.creds?.registered) initViewOnceAntiListener(sock)
      sock.ev.on("messages.upsert", sock.handler)
      sock.ev.on("connection.update", sock.connectionUpdate)
      sock.ev.on("creds.update", sock.credsUpdate)

      esInit = false
      return true
    }

    recargarHandler(false)
  })().catch((e) => {
    console.error('Error iniciando sub-bot:', e?.message || e)
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
  return `
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *vincular qr*
╰─ ✧  ✩
┊ abre whatsapp
┊ dispositivos vinculados
┊ vincular nuevo dispositivo
┊ escanea el qr
┊ caduca  ·  \`60s\`
╰─────────`.trim()
}

function construirMensajeCodigoEmparejamiento(secreto, telefonoEmparejamiento) {
  return `
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *tu código de vinculación*
╰─ ✧  ✩
┊ código  ·  \`${secreto}\`
┊ escríbelo tal cual en whatsapp
┊ número  ·  \`+${telefonoEmparejamiento}\`
┊ 1. abre whatsapp en tu teléfono
┊ 2. entra a *dispositivos vinculados*
┊ 3. toca *vincular un dispositivo*
┊ 4. elige *vincular con número de teléfono*
┊ 5. escribe este código: \`${secreto}\`
┊ caduca  ·  \`60s\`
╰─────────`.trim()
}

function construirErrorTelefonoEmparejamiento(usedPrefix) {
  return `
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *no se obtuvo el número*
╰─ ✧  ✩
┊ \`${usedPrefix}code 521XXXXXXXXXX\`
┊ méxico  ·  \`521 + 10 dígitos\`
╰─────────`.trim()
}

function construirErrorCodigoEmparejamiento(usedPrefix, mensajeError = 'conexión interrumpida') {
  return `
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *no se generó el código*
╰─ ✧  ✩
┊ \`${mensajeError || 'conexión interrumpida'}\`
┊ \`${usedPrefix}code\`
╰─────────`.trim()
}

function construirMensajesBienvenidaSubBot({ nombreBot, botNumber: numeroBot, userName: nombreUsuario, usedPrefix = '.' }) {
  const mensajePrivado = `
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *ya te vinculaste* - *${nombreBot}*
╰─ ✧  ✩
┊ tu sub-bot quedó conectado
┊ nombre  ·  \`${nombreBot}\`
┊ número  ·  \`+${numeroBot}\`
┊ usuario  ·  \`${nombreUsuario}\`
┊ puedes configurarlo así
┊ \`${usedPrefix}setbotname <nombre>\`
┊ \`${usedPrefix}setbotimg\`  ·  responde una imagen
┊ \`${usedPrefix}setautoread on/off\`
┊ \`${usedPrefix}setlen es/in/pt\`  ·  idioma
┊ \`${usedPrefix}setmenu ios/android\`  ·  menú
┊ \`${usedPrefix}menu\`
╰─────────`.trim()

  const mensajeCanal = `
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *${nombreBot}*
╰─ ✧  ✩
┊ número  ·  \`+${numeroBot}\`
┊ owner  ·  \`${nombreUsuario}\`
┊ estado  ·  \`online\`
┊ \`${usedPrefix}code\`  ·  \`${usedPrefix}qr\`
╰─────────`.trim()

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
    await conn.sendMessage(m.chat, {
      text: mensajePrivado,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m }).catch((err) => {
      console.error('[subbot] Error enviando bienvenida en el chat:', err?.message || err)
    })
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
