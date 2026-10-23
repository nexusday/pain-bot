const { useMultiFileAuthState, DisconnectReason, makeCacheableSignalKeyStore, fetchLatestBaileysVersion, Browsers } = (await import("@whiskeysockets/baileys"))
import qrcode from "qrcode"
import NodeCache from "node-cache"
import fs from "fs"
import path from "path"
import pino from "pino"
import chalk from "chalk"
import util from "util"
import * as ws from "ws"
import { makeWASocket } from "../lib/simple.js"
import { conSocketEstable, mantenerPrekeys, detenerPrekeys } from "../lib/socket-estable.js"
import { initViewOnceAntiListener } from "../lib/viewOnce.js"
import { resolvePhoneNumber, extractPhoneFromArgs, getPrivateReplyJid, sendPrivateReply } from "../lib/resolve-phone.js"
import { esModoIos } from '../lib/menu-modo.js'
import { getSubBotsLogsJid } from '../lib/newsletter-rcanal.js'
import { canRegisterSubBot, getSubBotSlotsInfo } from "../lib/max-subs.js"
import {
  ARCHIVO_REENLACE_PENDIENTE,
  finalizarVinculacion,
  limpiarMarcaReenlace,
  limpiarCredencialesSubBot,
  marcarVinculacionEnCurso,
  restaurarAjustesSesion,
  olvidarAjustesSesion,
  tieneAjustesGuardados
} from '../lib/subbot-recovery.js'
import { fileURLToPath } from "url"
import { tr } from '../lib/lang.js'
import {
  confirmSessionLease,
  releaseSessionLease,
  requestSessionLease
} from '../lib/process-isolation.js'


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

// No se usa un código fijo: Baileys genera uno aleatorio por intento. Un
// código idéntico para todos los usuarios es una señal clarísima de
// automatización/granja para WhatsApp y facilitaba que tumbaran las cuentas.
const SOCKET_CONEXION_MAX_MS = 60_000
const SOCKET_INACTIVO_MAX_MS = 90_000
const MAX_FALLOS_RECONEXION = 8
// Una conexión que aguanta menos de esto se considera inestable: el backoff
// no se reinicia, así el sub-bot deja de martillear a WhatsApp.
const CONEXION_ESTABLE_MIN_MS = 2 * 60_000
let versionBaileysCache = null
const iniciosSubBot = new Map()

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

let handler = async (m, { conn, args, usedPrefix, command, isOwner, participants, groupMetadata: metadatosGrupo }) => {
  if (!global.db.data.users[m.sender]) global.db.data.users[m.sender] = {}

  // Con el panel web activo los sub-bots se crean desde la web: aquí solo se
  // indica dónde hacerlo (la consola/chat deja de ser el punto de vinculación).
  const { panelWebActivo, urlPublicaPanel } = await import('../lib/webpanel-url.js')
  if (panelWebActivo()) {
    const url = urlPublicaPanel()
    const pref = usedPrefix || '.'
    return conn.sendMessage(m.chat, {
      text: `
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *los sub-bots ahora se crean desde la web*
╰─ ✧  ✩
┊ entra al panel y vincula tu número en segundos
┊ \`${url}\`
┊ \`${pref}code\`  ·  \`${pref}qr\`
┊ ya no hace falta pasar el código por aquí
╰─────────`.trim(),
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  let tiempo = global.db.data.users[m.sender].Subs + 120000

  let quien = m.mentionedJid && m.mentionedJid[0] ? m.mentionedJid[0] : m.fromMe ? conn.user.jid : m.sender
 
  const claveAlt = m.key?.participantAlt || m.key?.remoteJidAlt
  if (claveAlt) quien = claveAlt

  const telefonoExplicito = extractPhoneFromArgs(args)

 
  const metadataLocal = metadatosGrupo || conn.chats?.[m.chat]?.metadata
  const participantesGrupo = participants?.length
    ? participants
    : metadataLocal?.participants || []

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
  if (process.env.PAIN_ROLE === 'primary') {
    const leaseGranted = await requestSessionLease(id)
    if (!leaseGranted) {
      return conn.reply(m.chat, 'No se pudo reservar esta sesión para vincularla sin conexiones duplicadas. Intenta de nuevo.', m)
    }
    opcionesSubBot.supervisorHandoff = true
  }
  opcionesSubBot.phoneNumber = phoneNumber
  opcionesSubBot.replyJid = replyJid

  iniciarSubBot(opcionesSubBot).catch((error) => {
    console.error('Error iniciando sub-bot solicitado:', error?.message || error)
  })
  global.db.data.users[m.sender].Subs = new Date * 1
}

handler.help = ['#qr', '#code']
handler.tags = ['subbots']
handler.command = ['qr', 'qrr', 'code']
export {
  iniciarSubBot as AYBot,
  construirMensajesBienvenidaSubBot as buildWelcomeMessages,
  enviarSaludoPropioSubBot as sendOwnWelcomeMessage
}
export default handler

export async function retirarSesionDeWorker(pathAYBot, { handoff = false } = {}) {
  const clave = path.resolve(pathAYBot)
  const intento = iniciosSubBot.get(clave)
  if (intento) {
    if (handoff) await intento.ceder?.()
    else intento.cancelar?.()
    return
  }
  const socket = global.conns?.find((item) =>
    item?.pathAYBot && path.resolve(item.pathAYBot) === clave
  )
  if (!socket) return
  if (handoff) await socket.cederSesionPain?.()
  else await socket.cerrarSesionPain?.()
}

async function iniciarSubBot(options) {
  let {
    pathAYBot,
    m,
    conn,
    args,
    usedPrefix,
    command,
    fromCommand = true,
    phoneNumber = null,
    replyJid = null,
    supervisorHandoff = false,
    esperarConexion = false,
    timeoutConexionMs = 60_000,
    // Vinculación desde el panel web: no hay mensaje/conn de WhatsApp que
    // responder; el código se entrega por callback y el panel lo muestra.
    pairingOnly = false,
    onPairingCode = null,
    forzarRevinculacion = false,
    // Nombre del usuario del panel que pidió la vinculación (para el
    // mensaje de bienvenida que el sub-bot se envía a sí mismo).
    usuarioPanel = ''
  } = options

  const claveInicio = path.resolve(pathAYBot)
  const inicioExistente = iniciosSubBot.get(claveInicio)
  if (inicioExistente) {
    return esperarConexion ? inicioExistente.conectado : inicioExistente.iniciado
  }
  
 
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
  const rutaMarcaReenlace = path.join(pathAYBot, ARCHIVO_REENLACE_PENDIENTE)
  const raizReenlace = path.dirname(pathAYBot)
  const carpetaReenlace = path.basename(pathAYBot)
  // Re-vinculación de una sesión conocida: hay marca o quedaron ajustes
  // conservados en el registro (la carpeta ya fue archivada).
  const reenlaceEnCurso = fromCommand && (
    fs.existsSync(rutaMarcaReenlace) || tieneAjustesGuardados(raizReenlace, carpetaReenlace)
  )
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

  if (fromCommand && fs.existsSync(rutaCreds) && !forzarRevinculacion) {
    try {
      const previa = JSON.parse(fs.readFileSync(rutaCreds, 'utf8'))
      if (previa?.registered && !fs.existsSync(path.join(pathAYBot, ARCHIVO_REENLACE_PENDIENTE))) {
        if (m && conn) await avisarSesionExistente(conn, m, path.basename(pathAYBot), 'guardada', usedPrefix)
        // Ya está vinculada: un registro viejo de ajustes es basura, se olvida.
        try { olvidarAjustesSesion(pathAYBot, raizReenlace) } catch {}
        if (supervisorHandoff) releaseSessionLease(path.basename(pathAYBot))
        return
      }
    } catch {}
  }

  if (fromCommand) {
    limpiarCredencialesSubBot(pathAYBot, raizReenlace)
    // Si la sesión había quedado archivada, recupera config/staff/soporte.
    try {
      if (restaurarAjustesSesion(pathAYBot, raizReenlace)) {
        console.log(chalk.gray(`┆ Ajustes restaurados para +${carpetaReenlace} (config/staff/soporte).`))
      }
    } catch (error) {
      console.error(`No se pudieron restaurar los ajustes de ${carpetaReenlace}:`, error?.message || error)
    }
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

  if (reenlaceEnCurso) marcarVinculacionEnCurso(pathAYBot)

  let resolverConexion
  let rechazarConexion
  const promesaConexion = new Promise((resolve, reject) => {
    resolverConexion = resolve
    rechazarConexion = reject
  })
  promesaConexion.catch(() => {})

  const intento = {
    conectado: promesaConexion,
    iniciado: null,
    sock: null,
    cancelado: false,
    temporizador: null,
    cancelar: null,
    limpiarAuxiliares: null
  }
  iniciosSubBot.set(claveInicio, intento)

  function terminarIntento(error = null, socket = null) {
    if (intento.temporizador) clearTimeout(intento.temporizador)
    intento.temporizador = null
    if (reenlaceEnCurso) finalizarVinculacion(pathAYBot)
    if (iniciosSubBot.get(claveInicio) === intento) iniciosSubBot.delete(claveInicio)
    if (error) rechazarConexion(error)
    else resolverConexion(socket)
  }

  intento.ceder = async () => {
    intento.cancelado = true
    intento.limpiarAuxiliares?.()
    const socket = intento.sock
    if (socket) {
      socket._painSupervisorHandoff = true
      socket._ignorarCierre = true
      socket.ev?.removeAllListeners?.()
      try { socket.ws?.close?.() } catch {}
      if (Array.isArray(global.conns)) {
        global.conns = global.conns.filter((conexion) => conexion !== socket)
      }
    }
    terminarIntento(null)
  }

  intento.cancelar = () => {
    intento.cancelado = true
    intento.limpiarAuxiliares?.()
    const socket = intento.sock
    if (socket) {
      socket._ignorarCierre = true
      socket.ev?.removeAllListeners?.()
      try { socket.ws?.close?.() } catch {}
      if (Array.isArray(global.conns)) {
        global.conns = global.conns.filter((conexion) => conexion !== socket)
      }
    }
    terminarIntento(new Error(`Tiempo agotado conectando sub-bot ${path.basename(pathAYBot)}`))
  }

  if (esperarConexion) {
    intento.temporizador = setTimeout(intento.cancelar, Math.max(1_000, timeoutConexionMs))
    intento.temporizador.unref?.()
  }

  intento.iniciado = (async () => {
    const version = await obtenerVersionBaileys()
    if (intento.cancelado) return false
    const reintentoMsg = (MessageRetryMap) => { }
    const cacheReintentoMsg = new NodeCache({ stdTTL: 90, checkperiod: 120, useClones: false, maxKeys: 300 })
    let estadoConn, saveState, saveCreds
    try {
      const estadoAuth = await useMultiFileAuthState(pathAYBot)
      estadoConn = estadoAuth.state
      saveState = estadoAuth.saveState
      saveCreds = estadoAuth.saveCreds
    } catch (error) {
      console.log(chalk.bold.redBright(`\n┆ Error inicializando auth state para ${path.basename(pathAYBot)}: ${error.message}\n`))
      throw error
    }
    if (intento.cancelado) return false

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
      // Baileys corta con 408 si pasan keepAlive+5s sin datos; 10s cortaba a todos en cada pausa del hilo.
      keepAliveIntervalMs: 30_000,
      qrTimeout: 120_000,
    })

    let sock = makeWASocket(opcionesConexion)
    intento.sock = sock
    sock.phoneNumber = path.basename(pathAYBot)
    sock.botNumber = path.basename(pathAYBot)
    sock.pathAYBot = pathAYBot
    let inicioSocketEn = Date.now()
    let firmaCanalesResuelta = null
    let resolucionCanalesPendiente = null
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
    let temporizadorReconexion = null
    let reemplazosConsecutivos = 0
    let fallosConsecutivos = 0
    // Momento en el que se abrió la conexión actual: sirve para saber si la
    // sesión anterior fue estable (si no, el backoff sigue creciendo).
    let conectadoEstableEn = 0
    // Racha de cierres 500 (badSession) sin un 'open' entre ellos. WhatsApp
    // cierra con stream-error 500 cuando la sesión murió en el teléfono
    // (dispositivo desvinculado), así que una racha confirma sesión muerta.
    // No se borra al primer 500: un 500 aislado puede ser un error
    // transitorio del servidor y borrar creds sería irreversible.
    let fallos500Seguidos = 0
    const telefonoEmparejamiento = phoneNumber
    const idCarpetaBot = path.basename(pathAYBot)

    const replyUser = async (text) => {
      if (!m || !conn) return null
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

    function firmaConfigCanales() {
      return JSON.stringify({
        canales: global.ch || {},
        canal: global.canal || '',
        canalName: global.canalName || '',
        idCanal: global.idcanal || '',
        nombreCanal: global.namecanal || '',
        inviteCanal: global._canalInvitePending || '',
        logs: global.logssubbots || '',
        logsName: global.logssubbotsName || '',
        idLogs: global.idlogssubbots || '',
        nombreLogs: global.namelogssubbots || '',
        inviteLogs: global._logssubbotsInvitePending || ''
      })
    }

    async function resolverCanalesSiHaceFalta(socket) {
      const firmaActual = firmaConfigCanales()
      if (firmaCanalesResuelta === firmaActual) return
      if (resolucionCanalesPendiente) return resolucionCanalesPendiente

      resolucionCanalesPendiente = (async () => {
        try {
          const { resolveCanalConfig } = await import('../lib/newsletter-rcanal.js')
          await resolveCanalConfig(socket)
          firmaCanalesResuelta = firmaConfigCanales()
        } catch (err) {
          console.error('[canal] Error al resolver config del sub-bot:', err?.message || err)
        } finally {
          resolucionCanalesPendiente = null
        }
      })()

      return resolucionCanalesPendiente
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
        return st === ws.OPEN
      } catch {
        return false
      }
    }

    function socketAutenticado() {
      return socketAbierto() && Boolean(sock?.user?.id || sock?.user?.jid)
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
    intento.limpiarAuxiliares = () => {
      if (temporizadorVinculo) {
        clearTimeout(temporizadorVinculo)
        temporizadorVinculo = null
      }
      if (temporizadorReconexion) {
        clearTimeout(temporizadorReconexion)
        temporizadorReconexion = null
      }
      detenerWatchdog()
    }

    function esMotivoSesionFatal(motivo) {
      return (
        motivo === DisconnectReason.loggedOut || // 401
        motivo === 405 ||
        motivo === DisconnectReason.forbidden || // 403
        motivo === DisconnectReason.multideviceMismatch // 411
      )
    }

    async function enviarCodigoEmparejamiento() {
      if (codigoEmparejamientoEnviado || emparejamientoEnCurso || !codigoM) return false
      if (!pairingOnly && (!m || !conn)) return false
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
        // Sin segundo argumento: Baileys crea un código aleatorio distinto
        // para cada vinculación (bytesToCrockford(randomBytes(5))).
        let secreto = await sock.requestPairingCode(telefonoEmparejamiento)

        secreto = secreto?.match(/.{1,4}/g)?.join('-') || secreto
        codigoEmparejamientoEnviado = true

        // Panel web: entregar el código al llamador y no enviar nada por
        // WhatsApp. El socket sigue vivo esperando a que el usuario lo meta
        // en su teléfono.
        if (pairingOnly) {
          emparejamientoEnCurso = false
          try {
            await onPairingCode?.(secreto)
          } catch (error) {
            console.error('[pairing] No se pudo entregar el código al panel:', error?.message || error)
          }
          return true
        }

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

      if (qr && codigoM && (pairingOnly || (m && conn))) {
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
      let detalleDesconexion = String(
        lastDisconnect?.error?.message ||
        lastDisconnect?.error?.output?.payload?.message ||
        ''
      ).slice(0, 240)
      try {
        const datosFallo = lastDisconnect?.error?.data
        if (datosFallo && typeof datosFallo === 'object') {
          const textoDatos = JSON.stringify(datosFallo).slice(0, 120)
          if (textoDatos && textoDatos !== '{}') {
            detalleDesconexion = `${detalleDesconexion} ${textoDatos}`.trim().slice(0, 240)
          }
        }
      } catch {}

      if (connection === 'close') {
        detenerPrekeys(sock)
        if (sock._painLeaseHandoff) {
          intento.limpiarAuxiliares?.()
          quitarSockDeConns(sock)
          confirmSessionLease(idCarpetaBot)
          return
        }
        if (sock._painDeletingSession) {
          intento.limpiarAuxiliares?.()
          return
        }
        if (sock._painSupervisorHandoff) {
          detenerWatchdog()
          if (temporizadorReconexion) clearTimeout(temporizadorReconexion)
          if (Array.isArray(global.conns)) global.conns = global.conns.filter((item) => item !== sock)
          sock.ev.removeAllListeners()
          releaseSessionLease(idCarpetaBot)
          return
        }
        const esFlujoEmparejamiento = codigoM && !estadoConn.creds.registered

        if (emparejamientoEnCurso) {
          console.log(chalk.bold.yellow(`\n┆ Pairing en curso (+${idCarpetaBot}) esperando código...\n`))
          return
        }

        // Racha 500: WhatsApp cierra con stream-error 500 (badSession) cuando
        // la sesión murió en el teléfono. 3 seguidos sin 'open' = sesión
        // muerta confirmada; un 500 aislado se trata como transitorio.
        if (motivo === DisconnectReason.badSession) fallos500Seguidos++
        const sesionMuertaConfirmada = esMotivoSesionFatal(motivo) ||
          (motivo === DisconnectReason.badSession && fallos500Seguidos >= 3)

        if (esMotivoSesionFatal(motivo) && !estadoConn.creds.registered) {
          terminarIntento(new Error(`Emparejamiento de sub-bot ${idCarpetaBot} interrumpido`))
          console.log(chalk.bold.yellow(
            `\n┆ Emparejamiento de (+${idCarpetaBot}) interrumpido antes de registrar la sesión; ` +
            `no se marca como una sesión que requiera volver a vincular.\n`
          ))
          try { sock.ws.close() } catch {}
          quitarSockDeConns(sock)
          detenerWatchdog()
          return
        }

        if (sesionMuertaConfirmada) {
          terminarIntento(new Error(`Sesión de sub-bot ${idCarpetaBot} cerrada con código ${motivo ?? 'desconocido'}`))
          let marcaCreada = false
          try {
            fs.writeFileSync(
              path.join(pathAYBot, ARCHIVO_REENLACE_PENDIENTE),
              JSON.stringify({ reason: motivo ?? null, markedAt: new Date().toISOString() }, null, 2)
            )
            marcaCreada = true
          } catch (error) {
            console.error(`No se pudo marcar el subbot ${idCarpetaBot} para volver a vincular:`, error?.message || error)
          }
          if (marcaCreada) {
            try {
              limpiarCredencialesSubBot(pathAYBot)
            } catch (error) {
              console.error(`No se pudieron limpiar las credenciales de ${idCarpetaBot}:`, error?.message || error)
            }
          }
          console.log(chalk.bold.magentaBright(
            `\n┆ Sesión (+${idCarpetaBot}) rechazada por WhatsApp (código ${motivo ?? 'desconocido'}). ` +
            `${detalleDesconexion ? `Motivo: ${detalleDesconexion}. ` : ''}` +
            `Se archivará; sus ajustes quedan guardados y vuelve a vincularla con /code o /qr.\n`
          ))
          try { sock.ws.close() } catch {}
          quitarSockDeConns(sock)
          detenerWatchdog()
          return
        }

    
        if (esFlujoEmparejamiento && !estadoConn.creds.registered) {
          terminarIntento(new Error(`Emparejamiento de sub-bot ${idCarpetaBot} interrumpido`))
          console.log(chalk.bold.yellow(`\n┆ Pairing (+${idCarpetaBot}) conexión interrumpida (${motivo ?? 'sin código'}). No se toca al resto.\n`))
          try { sock.ev.removeAllListeners() } catch {}
          detenerWatchdog()
          return
        }
        if (sock._ignorarCierre || cierrePropio) {
          cierrePropio = false
          return
        }
        programarReconexion(motivo, detalleDesconexion)
        return
      }

      if (global.db.data == null) loadDatabase()

      if (connection === 'open') {
        try {
          limpiarMarcaReenlace(pathAYBot)
          // El vínculo ya se recuperó: los ajustes conservados ya no hacen falta.
          olvidarAjustesSesion(pathAYBot, path.dirname(pathAYBot))
        } catch (error) {
          console.error(`No se pudo limpiar la marca de reconexión de ${idCarpetaBot}:`, error?.message || error)
        }
        if (temporizadorReconexion) {
          clearTimeout(temporizadorReconexion)
          temporizadorReconexion = null
        }
        reconectando = false
        // Solo se limpian los contadores si la conexión anterior aguantó lo
        // suficiente. Si WhatsApp corta la sesión a los pocos segundos, el
        // backoff debe seguir creciendo: si no, el sub-bot reintenta cada
        // 5-20 s para siempre y el CPU se queda por las nubes.
        const duracionPrevia = conectadoEstableEn ? Date.now() - conectadoEstableEn : Infinity
        conectadoEstableEn = Date.now()
        if (duracionPrevia > CONEXION_ESTABLE_MIN_MS) {
          reemplazosConsecutivos = 0
          fallosConsecutivos = 0
        }
        fallos500Seguidos = 0
        vistoUsuarioEn = Date.now()
        await borrarMensajeVinculo().catch(() => {})
        if (intento.cancelado) return
        if (!global.db.data?.users) loadDatabase()

        console.log(chalk.bold.cyanBright(`\n🟢 ${sock.user?.name || sock.authState.creds.me.name || 'Sub-Bot'} (+${idCarpetaBot}) conectado exitosamente.`))
        mantenerPrekeys(sock)
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
        terminarIntento(null, sock)
        if (!sock.vistaUnicaLista) {
          sock.vistaUnicaLista = true
          initViewOnceAntiListener(sock)
        }
        await resolverCanalesSiHaceFalta(sock)
        
       
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

          const nuevoLogin = tuvoNuevoLogin
          const esSubBotFresco = fromCommand && m && nuevoLogin
          const esVinculacionDesdePanel = pairingOnly && nuevoLogin
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
          } else if (esVinculacionDesdePanel) {
            // Vinculado desde el panel web: el sub-bot se escribe a SÍ MISMO
            // (como /subme) con las instrucciones de uso.
            await enviarSaludoPropioSubBot({
              sock,
              nombreBot,
              botNumber: numeroBot,
              userName: opcionesSubBot.usuarioPanel || '',
              usedPrefix
            })
          }

          if (supervisorHandoff && !sock._painSupervisorHandoff) {
            sock._painSupervisorHandoff = true
            sock._ignorarCierre = true
            detenerWatchdog()
            if (temporizadorReconexion) clearTimeout(temporizadorReconexion)
            detenerPrekeys(sock)
            try { sock.ws.close() } catch (error) {
              console.error(`No se pudo ceder la sesión ${idCarpetaBot} al supervisor:`, error?.message || error)
            }
          }
          
        } catch (error) {
          console.error('Error enviando mensaje de bienvenida:', error)
        }
      }
    }

    // El reenganche se arma más abajo, cuando ya existe recargarHandler.
    detenerWatchdog()

    let cierrePropio = false
    let handler = await import('../handler.js')
    if (intento.cancelado) return false
    let recargarHandler = async function (restatConn) {
      if (restatConn) {
        const sockAnterior = sock
        const chatsAnteriores = sock.chats
        const inicioAnterior = sock.startTime
        const idAnterior = path.basename(pathAYBot)
        detenerPrekeys(sockAnterior)
        cierrePropio = true
        reconectando = true
        vistoUsuarioEn = Date.now()
        try { sock.ws.close() } catch { }
        sock.ev.removeAllListeners()
        sock = makeWASocket(opcionesConexion, { chats: chatsAnteriores })
        cierrePropio = false
        intento.sock = sock
        sock.phoneNumber = idCarpetaBot
        sock.botNumber = idCarpetaBot
        sock.pathAYBot = pathAYBot
        inicioSocketEn = Date.now()
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
          if (!temporizadorReconexion && !socketAutenticado()) reconectando = false
        }, 20000)
      }

      if (!esInit) {
        sock.ev.off("messages.upsert", sock.handler)
        sock.ev.off("connection.update", sock.connectionUpdate)
        sock.ev.off("creds.update", sock.credsUpdate)
      }

      sock.handler = async function (chatUpdate) {
        if (!sock.authState?.creds?.registered) return
        const modulo = global.handlerModule
        if (!modulo?.handler) return
        return modulo.handler.call(sock, chatUpdate)
      }
      sock.connectionUpdate = actualizacionConexion.bind(sock)
      sock.credsUpdate = saveCreds.bind(sock, true)

      if (sock.authState?.creds?.registered) initViewOnceAntiListener(sock)
      sock.ev.on("messages.upsert", sock.handler)
      sock.ev.on("connection.update", sock.connectionUpdate)
      sock.ev.on("creds.update", sock.credsUpdate)

      sock.reconectarPain = () => {
        if (reconectando) return Promise.resolve(false)
        return recargarHandler(true)
      }
      sock.cerrarSesionPain = async () => {
        sock._painDeletingSession = true
        sock._ignorarCierre = true
        reconectando = true
        intento.cancelado = true
        intento.limpiarAuxiliares?.()
        detenerPrekeys(sock)
        try {
          await sock.logout?.()
        } finally {
          intento.limpiarAuxiliares?.()
          sock.ev.removeAllListeners()
          try { sock.ws?.close?.() } catch {}
          quitarSockDeConns(sock)
        }
      }
      sock.cederSesionPain = async () => {
        sock._painLeaseHandoff = true
        sock._painSupervisorHandoff = true
        sock._ignorarCierre = true
        reconectando = true
        intento.cancelado = true
        intento.limpiarAuxiliares?.()
        detenerPrekeys(sock)
        sock.ev.removeAllListeners()
        try { sock.ws?.close?.() } catch {}
        quitarSockDeConns(sock)
      }

      esInit = false
      return true
    }

    function programarReconexion(motivo, detalle = '') {
      if (temporizadorReconexion) return
      reconectando = true
      const dispersarMs = (Number(String(idCarpetaBot).slice(-2)) % 30) * 1000
      const esReemplazo = motivo === DisconnectReason.connectionReplaced
      if (!esReemplazo && fallosConsecutivos >= MAX_FALLOS_RECONEXION) {
        console.log(chalk.bold.yellow(
          `\n┆ Subbot (+${idCarpetaBot}) sigue sin conectar tras ${MAX_FALLOS_RECONEXION} intentos ` +
          `(último código ${motivo ?? 'sin código'}). Se reintenta en 2 min con backoff largo; usa /rebot para forzarlo.\n`
        ))
        fallosConsecutivos = 0
        reemplazosConsecutivos = 0
        const colaLarga = 2 * 60_000 + dispersarMs
        if (!temporizadorReconexion) {
          reconectando = true
          temporizadorReconexion = setTimeout(() => {
            temporizadorReconexion = null
            recargarHandler(true).catch((error) => {
              console.error(`Error reconectando subbot ${idCarpetaBot}:`, error?.message || error)
              reconectando = false
            })
          }, colaLarga)
          temporizadorReconexion.unref?.()
        }
        return
      }
      const esReinicio = motivo === DisconnectReason.restartRequired
      // 428 (WhatsApp cerró la conexión): con 150+ sub-bots en el mismo servidor
      // es normal que rechace alguna. Con backoff corto se formaba un bucle
      // (cada sub-bot reconectaba a los 5-20 s y el CPU se disparaba), así que
      // aquí se espera bastante más entre reintentos.
      const esCerradoPorServidor = motivo === DisconnectReason.connectionClosed
      // Tope 90s (antes 5min): con 150 subbots, un tope de 5min + 30s de
      // dispersión dejaba colas de 327s y parecían muertos. 440 (reemplazo)
      // conserva backoff largo para no pelear entre duplicados. 515 es un
      // reinicio pedido por el servidor: reintento casi inmediato.
      const cola = esReinicio
        ? 3000 + Math.min(dispersarMs, 5000)
        : esReemplazo
          ? Math.min(60_000 * (2 ** Math.min(reemplazosConsecutivos, 4)), 15 * 60_000) + dispersarMs
          : esCerradoPorServidor
            ? Math.min(20_000 * (2 ** Math.min(fallosConsecutivos, 4)), 5 * 60_000) + dispersarMs
            : Math.min(5000 * (2 ** Math.min(fallosConsecutivos, 5)), 90_000) + dispersarMs
      if (esReemplazo) reemplazosConsecutivos++
      else fallosConsecutivos++
      console.log(chalk.bold.magentaBright(
        `\n┆ Subbot (+${idCarpetaBot}) desconectado (${motivo ?? 'sin código'}). ` +
        `${detalle ? `Motivo: ${detalle}. ` : ''}` +
        `${esReemplazo ? 'Reemplazo detectado; ' : ''}reconectando en ${Math.round(cola / 1000)}s...\n`
      ))
      temporizadorReconexion = setTimeout(() => {
        temporizadorReconexion = null
        recargarHandler(true).catch((error) => {
          console.error(`Error reconectando subbot ${idCarpetaBot}:`, error?.message || error)
          reconectando = false
        })
      }, cola)
    }

    detenerWatchdog()
    temporizadorWatchdog = setInterval(() => {
      try {
        const ahora = Date.now()
        if (socketAutenticado()) {
          vistoUsuarioEn = ahora
          reconectando = false
          return
        }
        if (sock._ignorarCierre || emparejamientoEnCurso || reconectando) return
        if (!sock.authState?.creds?.registered) return
        const estadoSocket = sock?.ws?.socket?.readyState ?? sock?.ws?.readyState
        const socketCerrado = estadoSocket === ws.CLOSED || estadoSocket === ws.CLOSING
        const conexionAtascada = !sock?.user?.id && !sock?.user?.jid &&
          ahora - inicioSocketEn >= SOCKET_CONEXION_MAX_MS
        const conexionPerdida = socketCerrado || (estadoSocket !== ws.CONNECTING &&
          ahora - vistoUsuarioEn >= SOCKET_INACTIVO_MAX_MS
        )
        if (!conexionAtascada && !conexionPerdida) return

        reconectando = true
        vistoUsuarioEn = ahora
        console.log(chalk.bold.yellow(
          `\n┆ Subbot (+${idCarpetaBot}) ${conexionAtascada ? 'atascado conectando' : 'sin conexión'} (estado ${estadoSocket ?? 'desconocido'}). Reconectando...\n`
        ))
        recargarHandler(true).catch((e) => {
          console.error(`Error reconectando subbot ${idCarpetaBot}:`, e?.message || e)
          reconectando = false
        })
      } catch (error) {
        console.error(`Error en watchdog del subbot ${idCarpetaBot}:`, error?.message || error)
      }
    }, 15000)

    recargarHandler(false)
    return true
  })().catch((e) => {
    terminarIntento(e)
    console.error('Error iniciando sub-bot:', e?.message || e)
    return false
  })

  return esperarConexion ? intento.conectado : intento.iniciado
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

function construirMensajesBienvenidaSubBot({ conn, nombreBot, botNumber: numeroBot, userName: nombreUsuario, usedPrefix = '.' }) {
  const mensajePrivado = `
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *${tr(conn, 'ya te vinculaste', 'you are linked', 'você se vinculou')}* - *${nombreBot}*
╰─ ✧  ✩
┊ ${tr(conn, 'tu sub-bot quedó conectado', 'your sub-bot is connected', 'seu sub-bot ficou conectado')}
┊ ${tr(conn, 'nombre', 'name', 'nome')}  ·  \`${nombreBot}\`
┊ ${tr(conn, 'número', 'number', 'número')}  ·  \`+${numeroBot}\`
┊ ${tr(conn, 'usuario', 'user', 'usuário')}  ·  \`${nombreUsuario}\`
┊ ${tr(conn, 'tu sub-bot no responde en la comunidad oficial', 'your sub-bot does not reply in the official community', 'seu sub-bot não responde na comunidade oficial')}
┊ ${tr(conn, 'úsalo en grupos que no sean el oficial', 'use it in groups that are not the official one', 'use-o em grupos que não sejam o oficial')}
┊ ${tr(conn, 'en el grupo', 'in the group', 'no grupo')}  ·  \`${usedPrefix}bot on\`
┊ \`${usedPrefix}setbotname <${tr(conn, 'nombre', 'name', 'nome')}>\`
┊ \`${usedPrefix}setbotimg\`  ·  ${tr(conn, 'responde una imagen', 'reply to an image', 'responda uma imagem')}
┊ \`${usedPrefix}setautoread on/off\`
┊ \`${usedPrefix}antipv on/off\`
┊ \`${usedPrefix}setlen es/in/pt\`  ·  ${tr(conn, 'idioma', 'language', 'idioma')}
┊ \`${usedPrefix}setmenu ios/android\`  ·  ${tr(conn, 'menú', 'menu', 'menu')}
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

/**
 * El sub-bot se escribe a SÍ MISMO el mensaje de bienvenida (su chat
 * "mensajes para ti mismo"), igual que hace /subme. Se usa cuando la
 * vinculación viene del panel web.
 */
async function enviarSaludoPropioSubBot({ sock, nombreBot, botNumber: numeroBot, userName, usedPrefix = '.' }) {
  try {
    const { jidPropioSubBot } = await import('../lib/subme-broadcast.js')
    const { privateMessage } = construirMensajesBienvenidaSubBot({
      conn: sock,
      nombreBot,
      botNumber: numeroBot,
      userName: userName || 'Usuario',
      usedPrefix
    })
    const destino = jidPropioSubBot(sock)
    if (!destino) return
    await sock.sendMessage(destino, { text: privateMessage })
    console.log(`[subbot] Mensaje de vinculación enviado a (+${numeroBot}) por su propio chat.`)
  } catch (error) {
    console.error('[subbot] Error enviando el mensaje de vinculación:', error?.message || error)
  }
}

async function enviarBienvenidaSubBot({ sock, m, conn, replyJid, nombreBot, botNumber: numeroBot, usedPrefix, configPath: rutaConfig, subConfig: configSub }) {
  let nombreUsuario = await resolverNombreUsuarioSubBot(sock, m, conn, replyJid)
  if (nombreUsuario === 'Usuario') {
    await retraso(800)
    nombreUsuario = await resolverNombreUsuarioSubBot(sock, m, conn, replyJid)
  }

  const { privateMessage: mensajePrivado, channelMessage: mensajeCanal } = construirMensajesBienvenidaSubBot({
    conn,
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
