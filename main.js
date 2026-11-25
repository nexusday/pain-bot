import './lib/crash-guard.js'
import './lib/sesion-log.js'

process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '1'

const ERRORES_DESCIFRADO_TRANSITORIOS = [
  'Unsupported state or unable to authenticate data',
  'Failed to decrypt message with any known session',
  'Key used already or never filled',
  'Bad MAC',
]
let ultimoAvisoDescifrado = 0

process.on('unhandledRejection', (reason) => {
  const msg = reason?.message || String(reason || '')
  if (msg.includes('sharp') || msg.includes('android-arm64')) {
    console.error('[sharp] rechazo controlado (imagen):', msg.split('\n')[0])
    return
  }
  // Errores de descifrado de Baileys: el socket recibió frames que ya no
  // corresponden a su sesión (reconexión, sesión reemplazada o mensaje
  // reenviado). No son un fallo del bot y no deben llenar el log con stacks.
  if (ERRORES_DESCIFRADO_TRANSITORIOS.some((texto) => msg.includes(texto))) {
    const ahora = Date.now()
    if (ahora - ultimoAvisoDescifrado >= 60_000) {
      ultimoAvisoDescifrado = ahora
      console.warn(
        '[baileys] descifrado fallido (transitorio, se recupera solo):',
        msg.split('\n')[0]
      )
    }
    return
  }
  console.error('unhandledRejection', reason)
})

try {
  const listo = register(new URL('./lib/hot-loader.js', import.meta.url).href, {
    parentURL: import.meta.url,
  })
  if (listo && typeof listo.then === 'function') await listo
} catch (e) {
  console.error('No se pudo activar la recarga en vivo:', e?.message || e)
}

import { PROJECT_TMP, cleanupTmpFiles, startTmpCleanupInterval } from './lib/tmp-cleanup.js'
import './config.js'
import './lib/bot-uptime.js'
import { createRequire } from 'module'
import path, { join, resolve } from 'path'
import { register } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'url'
import { platform } from 'process'
import * as ws from 'ws'
import { readdirSync, statSync, unlinkSync, existsSync, readFileSync, writeFileSync, watch, mkdirSync } from 'fs'
import yargs from 'yargs'
import chalk from 'chalk'
import syntaxerror from 'syntax-error'
import { format } from 'util'
import pino from 'pino'
import { Boom } from '@hapi/boom'
import { makeWASocket, protoType, serialize } from './lib/simple.js'
import { conSocketEstable, mantenerPrekeys, detenerPrekeys } from './lib/socket-estable.js'
import { estadoMemoriaProceso } from './lib/mem-hygiene.js'
import {
  ARCHIVO_REENLACE_PENDIENTE,
  limpiarEmparejamientos,
  listarRequierenVincular,
  necesitaRevinculacion,
  purgarSesionesReenlace,
  purgarSesionReenlace,
  sesionEnEmparejamiento,
  sesionRequiereVincular,
  vinculacionEnCurso
} from './lib/subbot-recovery.js'
import { initViewOnceAntiListener } from './lib/viewOnce.js'
import { Low } from 'lowdb'
import { ArchivoSqliteCompartido } from './lib/db-sqlite.js'
import { readSubbotWorkerStatuses, removeSubbotWorkerStatus, writeSubbotWorkerStatus } from './lib/subbot-status.js'
import {
  iniciarMetricasWorker,
  obtenerActividadSocket,
  persistirMetrica,
  registrarMetricasWorker,
} from './lib/worker-metrics.js'
import { ordenarSesionesPorPrioridad } from './lib/subbot-priority.js'
import { confirmSessionLease, requestReconnectAll, requestReconnectOne, requestReloadAll } from './lib/process-isolation.js'
import { ejecutarEnContextoBot } from './lib/premium.js'
import lodash from 'lodash' 
import readline from 'readline'
import NodeCache from 'node-cache'
import qrcode from 'qrcode-terminal'
import { EventEmitter } from 'node:events'
import os from 'node:os'
import { acquireRuntimeLease } from './lib/runtime-lease.js'

const { proto } = (await import('@whiskeysockets/baileys')).default
const {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  makeCacheableSignalKeyStore,
} = await import('@whiskeysockets/baileys')

const PORT = process.env.PORT || process.env.SERVER_PORT || 3000
try {
  acquireRuntimeLease(
    path.resolve('storage'),
    process.env.PAIN_ROLE === 'subbot' ? 'subbot' : 'primary'
  )
} catch (error) {
  console.error(`[${process.env.PAIN_ROLE || 'primary'}] ${error.message}`)
  process.exit(1)
}

protoType()
serialize()

global.__filename = function filename(pathURL = import.meta.url, rmPrefix = platform !== 'win32') {
  return rmPrefix ? /file:\/\/\//.test(pathURL) ? fileURLToPath(pathURL) : pathURL : pathToFileURL(pathURL).toString();
};
global.__dirname = function dirname(pathURL) {
  return path.dirname(global.__filename(pathURL, true))
};
global.__require = function require(dir = import.meta.url) {
  return createRequire(dir)
}


global.ensureTmpDir = function() {
  return PROJECT_TMP
}

global.API = (name, path = '/', query = {}, apikeyqueryname) =>
  (name in global.APIs ? global.APIs[name] : name) +
  path +
  (query || apikeyqueryname
    ? '?' +
      new URLSearchParams(
        Object.entries({
          ...query,
          ...(apikeyqueryname ? { [apikeyqueryname]: global.APIKeys[name in global.APIs ? global.APIs[name] : name] } : {}),
        })
      )
    : '')

global.timestamp = { start: new Date() }

const __dirname = global.__dirname(import.meta.url)

global.opts = new Object(yargs(process.argv.slice(2)).exitProcess(false).parse())
global.prefix = new RegExp(
  '^[' +
    (opts['prefix'] || '‎z/#$%.\\-').replace(/[|\\{}()[\]^$+*?.\-\^]/g, '\\$&') +
    ']'
)

global.db = new Low(new ArchivoSqliteCompartido(
  'storage/databases/database.sqlite',
  'storage/databases/database.json',
  {
    persistConnections: true,
    // El refresh por comando del handler queda limitado a esta frecuencia;
    // la vista se mantiene fresca con el sync de fondo cada 5s.
    refreshMinIntervalMs: Number.parseInt(process.env.PAIN_DB_REFRESH_MS, 10) || 5000,
  }
))

global.DATABASE = global.db
global.loadDatabase = async function loadDatabase() {
  if (global.db.READ)
    return new Promise((resolve) =>
      setInterval(async function () {
        if (!global.db.READ) {
          clearInterval(this)
          resolve(global.db.data == null ? global.loadDatabase() : global.db.data)
        }
      }, 1 * 1000)
    )
  if (global.db.data !== null) return
  global.db.READ = true
  try {
    await global.db.read()
  } finally {
    global.db.READ = null
  }
  const normalizeModeMap = (value) =>
    value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  global.db.data = {
    users: {},
    chats: {},
    stats: {},
    msgs: {},
    sticker: {},
    settings: {},
    botGroups: {},
    modoSub: {},
    antiImg: {},
    antiVer: {},
    antiPalabra: global.db.data?.antiPalabra || {},
    bienvenidas: {},
    publicaciones: {},
    ...(global.db.data || {}),
    alquiler: global.db.data?.alquiler || {},
    alquilerNotify: global.db.data?.alquilerNotify || {},
    cmd18: global.db.data?.cmd18 || {},
    modoDescargas: normalizeModeMap(global.db.data?.modoDescargas),
    modoIA: normalizeModeMap(global.db.data?.modoIA),
    modoHot: normalizeModeMap(global.db.data?.modoHot),
    modoIlegal: normalizeModeMap(global.db.data?.modoIlegal),
    modoHuman: normalizeModeMap(global.db.data?.modoHuman),
    modoSad: normalizeModeMap(global.db.data?.modoSad),
    modoPsico: normalizeModeMap(global.db.data?.modoPsico),
    modoCustom: normalizeModeMap(global.db.data?.modoCustom),
    modoGames: normalizeModeMap(global.db.data?.modoGames),
    modoCustomCfg: global.db.data?.modoCustomCfg && typeof global.db.data.modoCustomCfg === 'object' && !Array.isArray(global.db.data.modoCustomCfg)
      ? global.db.data.modoCustomCfg
      : {},
    modoSub: global.db.data?.modoSub && typeof global.db.data.modoSub === 'object' && !Array.isArray(global.db.data.modoSub)
      ? global.db.data.modoSub
      : {},
    stickerBan: global.db.data?.stickerBan && typeof global.db.data.stickerBan === 'object' && !Array.isArray(global.db.data.stickerBan)
      ? global.db.data.stickerBan
      : {},
  }
  global.db.chain = lodash.chain(global.db.data) 
}

const isSubbotWorker = process.env.PAIN_ROLE === 'subbot'
const isManagedPrimary = process.env.PAIN_ROLE === 'primary'
global.processRole = isSubbotWorker ? 'subbot' : 'primary'
// Los sub-bots no deben quitarle CPU al bot principal.
if (isSubbotWorker) {
  try { os.setPriority(10) } catch {}
}

// Si el supervisor desaparece, este proceso no debe quedarse vivo: seguiría
// manteniendo sockets abiertos y gastando CPU, y cuando arranque el nuevo
// supervisor sus sesiones chocarían con las viejas (440 "replaced") en bucle.
if (typeof process.send === 'function') {
  process.on('disconnect', () => {
    console.error(
      `[${process.env.PAIN_ROLE || 'primary'}] Supervisor desconectado: ` +
      'cerrando para no dejar conexiones huérfanas.'
    )
    try {
      for (const socket of [global.conn, ...(global.conns || [])]) {
        if (!socket) continue
        try { socket.ev?.removeAllListeners?.() } catch {}
        try { socket.ws?.terminate?.() } catch {}
        try { socket.ws?.close?.() } catch {}
      }
    } catch {}
    setTimeout(() => process.exit(0), 1200).unref?.()
  })
}

// El panel web arranca PRIMERO: la web tiene que estar disponible aunque el
// bot todavía esté emparejando (o sin principal vinculado). Solo el proceso
// principal supervisa un proceso HTTP separado; ningún socket público corre
// en el event loop que atiende WhatsApp.
// Si el puerto está ocupado, el bot sigue funcionando igual (el error se
// registra y no se propaga).
if (!isSubbotWorker && global.webPanel?.enabled !== false && process.env.PAIN_WEB_ENABLED !== '0') {
  try {
    const modulo = await import('./lib/webpanel/isolated.js')
    global.webPanelStart = modulo.startIsolatedWebPanel
    global.webPanelHandle = await modulo.startIsolatedWebPanel()
  } catch (error) {
    console.error('[webpanel] No se pudo iniciar el panel:', error?.message || error)
  }
}

await global.loadDatabase()

if (isSubbotWorker || isManagedPrimary) {
  // El trabajo real (claims, comandos) usa transacciones directas; esta vista
  // solo se refresca para lecturas. En workers se espacia más para bajar
  // contención de SQLite y CPU con cientos de sesiones.
  const intervaloRefresh = Number.parseInt(process.env.PAIN_DB_REFRESH_MS, 10) ||
    (isSubbotWorker ? 8000 : 5000)
  const syncDatabase = setInterval(() => {
    global.db.adapter.refresh(global.db.data).catch((error) => {
      console.error('[db] No se pudo actualizar la vista de otro proceso:', error?.message || error)
    })
  }, intervaloRefresh)
  syncDatabase.unref?.()
}

// Un reinicio del proceso principal no puede tener vinculaciones web vivas:
// limpia marcas .pairing huérfanas para que el supervisor no ignore esas
// sesiones para siempre.
if (!isSubbotWorker) {
  try {
    const obsoletas = limpiarEmparejamientos(resolve(__dirname, global.bot || 'Serbot'))
    if (obsoletas > 0) {
      console.log(`[webpanel] Marcas .pairing obsoletas eliminadas: ${obsoletas}`)
    }
  } catch (error) {
    console.error('[webpanel] No se pudieron limpiar marcas .pairing:', error?.message || error)
  }
}

global.authFile = 'sessions'
let state = null
let saveCreds = async () => {}
let connectionOptions = null
let conn
// Caché de reintentos del socket principal (se comparte al recrearlo).
let cacheReintentoPrincipal = null

// Guardado de credenciales del principal. Si el panel desvinculó el número,
// las credenciales viejas no deben volver a escribirse a disco.
async function guardarCredencialesPrincipales(...args) {
  if (global.__painBloquearCreds) {
    try {
      const { borrarCredencialesPrincipales } = await import('./lib/main-session.js')
      borrarCredencialesPrincipales()
    } catch {}
    return
  }
  return saveCreds(...args)
}

let workerStatusInterval = null
if (!isSubbotWorker) {
  const authState = await useMultiFileAuthState(global.authFile)
  state = authState.state
  saveCreds = authState.saveCreds
}

const logger = pino({
  timestamp: () => `,"time":"${new Date().toJSON()}"`,
}).child({ class: 'client' })
logger.level = 'fatal'

if (!isSubbotWorker) {
  const { version } = await fetchLatestBaileysVersion()
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const question = (texto) => new Promise((resolver) => rl.question(texto, resolver))
  cacheReintentoPrincipal = new NodeCache({ stdTTL: 90, checkperiod: 120, useClones: false, maxKeys: 300 })

  connectionOptions = conSocketEstable({
    version,
    logger,
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    browser: Browsers.ubuntu('Chrome'),
    markOnlineOnConnect: true,
    appStateMacVerification: { patch: false, snapshot: false },
    msgRetryCache: cacheReintentoPrincipal,
  })

  global.conn = makeWASocket(connectionOptions)
  conn = global.conn
  global.mainBotJid = null

  async function handleLogin() {
    if (conn.authState.creds.registered) {
      console.log(chalk.green('Sesión ya está registrada.'))
      rl.close()
      return
    }

    let loginMethod = ''
    try {
      loginMethod = await question(
        chalk.green(
          '¿Cómo deseas iniciar sesión?\nEscribe "qr" para escanear el código QR o "code" para usar un código de 8 dígitos:\n'
        )
      )
    } catch {
      return
    }

    loginMethod = loginMethod.toLowerCase().trim()

    // El panel pudo vincular el principal mientras se esperaba en consola.
    if (conn.authState.creds.registered) {
      console.log(chalk.green('Sesión ya está registrada.'))
      rl.close()
      return
    }

    if (loginMethod === 'code') {
      let phoneNumber = await question(chalk.blue('Ingresa el número de WhatsApp donde estará el bot (incluye código país, ej: 521XXXXXXXXXX):\n'))
      phoneNumber = phoneNumber.replace(/\D/g, '').replace(/^0+/, '')
      if (phoneNumber.startsWith('521') && phoneNumber.length >= 12 && phoneNumber.length <= 13) {
        // El prefijo mexicano ya incluye el dígito adicional.
      } else if (phoneNumber.startsWith('52') && !phoneNumber.startsWith('521') && phoneNumber.length === 12) {
        phoneNumber = `521${phoneNumber.slice(2)}`
      }

      if (typeof conn.requestPairingCode === 'function') {
        try {
          if (conn.ws.readyState === ws.OPEN) {
            let code = await conn.requestPairingCode(phoneNumber)
            code = code?.match(/.{1,4}/g)?.join('-') || code
            console.log(chalk.cyan('Tu código de emparejamiento es:', code))
          } else {
            console.log(chalk.red('La conexión no está abierta. Intenta nuevamente.'))
          }
        } catch (error) {
          console.log(chalk.red('Error al solicitar código de emparejamiento:'), error.message || error)
        }
      } else {
        console.log(chalk.red('Tu versión de Baileys no soporta emparejamiento por código.'))
      }
    } else {
      console.log(chalk.yellow('Generando código QR, escanéalo con tu WhatsApp...'))
      conn.ev.on('connection.update', ({ qr }) => {
        if (qr) qrcode.generate(qr, { small: true })
      })
    }
    rl.close()
  }

  const panelActivo = global.webPanel?.enabled !== false && process.env.PAIN_WEB_ENABLED !== '0'
  if (panelActivo) {
    // Con el panel activo ya no hace falta vincular desde la consola: el
    // principal se empareja desde la web y el panel nunca se corta. La
    // consola se queda libre para el resto de comandos.
    rl.close()
    const urlPanel = global.webPanelHandle?.config?.publicUrl || 'la URL del panel'
    console.log(chalk.cyan(`El bot principal se vincula desde el panel web: ${urlPanel}`))
    if (!conn.authState.creds.registered) {
      console.log(chalk.yellow('Todavía no hay número vinculado: entra al panel y genera el código de 8 dígitos.'))
    }
  } else {
    await handleLogin()
  }
} else {
  const eventBus = new EventEmitter()
  const facade = {
    ev: eventBus,
    user: {},
    _painPlaceholder: true,
    logger,
    decodeJid: (jid) => global.conns?.[0]?.decodeJid?.(jid) || jid || '',
    reply: (...args) => {
      const socket = global.conns?.find((item) => item?.reply)
      return socket ? socket.reply(...args) : Promise.reject(new Error('No hay sub-bots conectados en este worker'))
    },
    sendMessage: (...args) => {
      const socket = global.conns?.find((item) => item?.sendMessage)
      return socket ? socket.sendMessage(...args) : Promise.reject(new Error('No hay sub-bots conectados en este worker'))
    },
  }
  global.conn = new Proxy(facade, {
    get(target, property, receiver) {
      if (Reflect.has(target, property)) return Reflect.get(target, property, receiver)
      const socket = global.conns?.[0]
      const value = socket?.[property]
      return typeof value === 'function' ? value.bind(socket) : value
    }
  })
  conn = global.conn
}

if (!isSubbotWorker) {
  conn.isInit = false
  conn.well = false
}

if (!opts['test']) {
  if (global.db) {
    let escribiendoDb = false
    const guardarDb = async () => {
      if (escribiendoDb || !global.db.data) return
      escribiendoDb = true
      try {
        await global.db.write()
        if (opts['autocleartmp']) {
          cleanupTmpFiles({ maxAgeMs: 3 * 60 * 1000 })
        }
      } catch (error) {
        console.error('[db] No se pudieron guardar los cambios de la base compartida:', error?.message || error)
      } finally {
        escribiendoDb = false
      }
    }
    const workerId = process.env.PAIN_WORKER_ID || 'primary'
    let phase = 2166136261
    for (const character of workerId) {
      phase ^= character.charCodeAt(0)
      phase = Math.imul(phase, 16777619)
    }
    // Guardado periódico espaciado: serializar la DB congela el event loop.
    // Con DB de ~38 MB el escaneo completo pesa; 60s es el equilibrio
    // (ajustable con PAIN_DB_SAVE_MS, mínimo 30s).
    const intervaloGuardado = Math.max(
      Number.parseInt(process.env.PAIN_DB_SAVE_MS, 10) || 60_000,
      30_000
    )
    const initialDelay = (phase >>> 0) % intervaloGuardado
    const firstSave = setTimeout(() => {
      void guardarDb()
      const interval = setInterval(() => void guardarDb(), intervaloGuardado)
      interval.unref?.()
    }, initialDelay)
    firstSave.unref?.()
  }
}

let temporizadorPresencia = null

function mantenerPresenciaPrincipal(sock) {
  if (temporizadorPresencia) clearInterval(temporizadorPresencia)
  const avisar = () => {
    sock.sendPresenceUpdate?.('available').catch(() => {})
  }
  avisar()
  temporizadorPresencia = setInterval(avisar, 3 * 60 * 60 * 1000)
}

if (!isSubbotWorker) startTmpCleanupInterval({ verbose: true })

let reconectandoPrincipal = false
let sinSocketDesde = 0

function socketPrincipalAbierto(sock) {
  try {
    if (!sock) return false
    if (sock.ws?.isOpen === true) return true
    const estado = sock.ws?.socket?.readyState ?? sock.ws?.readyState
    return estado === 1
  } catch {
    return false
  }
}

function vigilarSocketPrincipal() {
  const sock = global.conn
  if (!sock?.authState?.creds?.registered) return
  if (socketPrincipalAbierto(sock)) {
    sinSocketDesde = 0
    return
  }
  if (!sinSocketDesde) sinSocketDesde = Date.now()
  if (Date.now() - sinSocketDesde < 3 * 60_000) return
  if (reconectandoPrincipal) return
  sinSocketDesde = Date.now()
  reconectandoPrincipal = true
  console.log('El principal se quedó sin conexión. Reconectando...')
  global.reloadHandler?.(true)?.catch?.((e) => {
    console.error('Error reconectando el principal:', e?.message || e)
  })
}

if (!isSubbotWorker) setInterval(vigilarSocketPrincipal, 15_000).unref?.()

// Lotería: solo el principal marca el ritmo (aperturas por hora y cierres).
// Los anuncios los intenta él; si no es miembro del grupo el cierre lo
// resuelve igual (dinero a salvo) y el anuncio lo hace el bot presente
// vía maybeCerrarSorteo en el handler.
if (!isSubbotWorker) {
  const tickLoteria = () => {
    import('./lib/loteria.js').then(({ tickLoteria }) => {
      try {
        void tickLoteria(global.conn)
      } catch {}
    }).catch(() => {})
  }
  const primerTickLoteria = setTimeout(tickLoteria, 20_000)
  primerTickLoteria.unref?.()
  const cadaTickLoteria = setInterval(tickLoteria, 30_000)
  cadaTickLoteria.unref?.()
}
// Higiene de memoria del principal cada 60s (workers la hacen en su tick).
if (!isSubbotWorker) {
  const higienePrincipal = setInterval(() => {
    import('./lib/mem-hygiene.js').then(({ higieneMemoriaProceso }) => {
      try {
        higieneMemoriaProceso()
      } catch {}
    }).catch(() => {})
  }, 60_000)
  higienePrincipal.unref?.()
}

// Avisa al supervisor cuando el bot principal queda vinculado: hasta ese
// momento los workers de sub-bots se quedan en espera y no reconectan nada.
let principalVinculadoAvisado = false
/** Motivo por el que el principal se quedó sin sesión (lo ve el panel). */
function marcarPrincipalCaido(motivo) {
  global.__painPrincipalCaido = { motivo: String(motivo || ''), en: Date.now() }
}

function avisarPrincipalVinculado() {
  if (isSubbotWorker || principalVinculadoAvisado) return
  const socket = global.conn
  if (!socket?.authState?.creds?.registered) return
  principalVinculadoAvisado = true
  global.__painPrincipalCaido = null
  try {
    if (typeof process.send === 'function') process.send({ type: 'primary-linked' })
  } catch {}
}

function avisarPrincipalDesvinculado() {
  if (isSubbotWorker) return
  principalVinculadoAvisado = false
  try {
    if (typeof process.send === 'function') process.send({ type: 'primary-unlinked' })
  } catch {}
}

if (!isSubbotWorker) {
  const revisarVinculacion = setInterval(avisarPrincipalVinculado, 2000)
  revisarVinculacion.unref?.()
}

async function connectionUpdate(update) {
  const sock = this?.ev ? this : conn
  const { connection, lastDisconnect, isNewLogin } = update
  global.stopped = connection
  if (isNewLogin) sock.isInit = true

  avisarPrincipalVinculado()

  if (global.db.data == null) await loadDatabase()

  if (connection === 'open') {
    reconectandoPrincipal = false
    console.log(chalk.yellow('Conectado correctamente.'))
    global.mainBotJid = sock.user?.jid?.split('@')[0] || sock.user?.id?.split('@')[0]
    try {
      const numeroPrincipal = String(global.mainBotJid || '').split(':')[0].replace(/\D/g, '')
      if (numeroPrincipal) {
        mkdirSync(join(__dirname, 'storage', 'process-status'), { recursive: true })
        writeFileSync(join(__dirname, 'storage', 'process-status', 'main-bot.txt'), numeroPrincipal)
      }
    } catch {}
    try {
      const { markBotStart } = await import('./lib/bot-uptime.js')
      markBotStart(sock)
    } catch {
      if (!sock.startTime) sock.startTime = Date.now()
    }
    try {
      const { aplicarIdioma } = await import('./lib/lang.js')
      aplicarIdioma(sock)
    } catch {}
    try {
      const { resolveCanalConfig } = await import('./lib/newsletter-rcanal.js')
      await resolveCanalConfig(sock)
    } catch (err) {
      console.error('[canal] Error al resolver config:', err?.message || err)
    }
    mantenerPresenciaPrincipal(sock)
    mantenerPrekeys(sock)
    return
  }

  if (connection !== 'close') return
  detenerPrekeys(sock)

  const reason = new Boom(lastDisconnect?.error)?.output?.statusCode
    || lastDisconnect?.error?.output?.statusCode
    || lastDisconnect?.error?.output?.payload?.statusCode

  if (reason === 405) {
    if (existsSync('./sessions/creds.json')) unlinkSync('./sessions/creds.json')
    console.log(
      chalk.bold.redBright(
        `Conexión reemplazada, por favor espera un momento. Reiniciando...\nSi aparecen errores, vuelve a iniciar con: npm start`
      )
    )
    if (typeof process.send === 'function') process.send('reset')
    else process.exit(1)
    return
  }

  const noReconectar = new Set([
    DisconnectReason.badSession,
    DisconnectReason.connectionReplaced,
    DisconnectReason.loggedOut,
    DisconnectReason.forbidden,
    DisconnectReason.multideviceMismatch
  ])

  if (noReconectar.has(reason)) {
    sock.logger?.error?.(`Sesión del principal cerrada (${reason}). No se reconecta sola.`)
    if (reason === DisconnectReason.loggedOut) avisarPrincipalDesvinculado()
    // 403 (WhatsApp cerró la sesión) o cierre de sesión: ese dispositivo ya
    // no vale en el teléfono. Se borran las credenciales y se levanta un
    // socket limpio para que el panel pueda volver a vincular el número SIN
    // reiniciar el proceso: la web y los sub-bots siguen funcionando.
    if (reason === DisconnectReason.forbidden || reason === DisconnectReason.loggedOut) {
      marcarPrincipalCaido(reason)
      try {
        await global.reiniciarPrincipalLimpio?.({ timeoutMs: 30_000 })
        console.log(
          chalk.yellow(
            'El bot principal quedó desvinculado. Vínculalo de nuevo desde el panel web.'
          )
        )
      } catch (error) {
        console.error('No se pudo recrear el socket del principal:', error?.message || error)
      }
    }
    return
  }

  if (reconectandoPrincipal) return
  reconectandoPrincipal = true
  sock.logger?.warn?.(`Conexión perdida (${reason ?? 'sin código'}). Reconectando el principal...`)

  setTimeout(() => {
    reconectandoPrincipal = false
    global.reloadHandler(true).catch((e) => {
      console.error('Error reconectando el principal:', e?.message || e)
      reconectandoPrincipal = false
    })
  }, 4000)
}

process.on('uncaughtException', (error) => {
  console.error('Error no capturado; el supervisor reiniciará el proceso:', error)
  process.exit(1)
})

let isInit = true
let handler = await import('./handler.js')
global.handlerModule = handler
global.reloadHandler = async function (restartConn) {
  if (!restartConn) {
    try {
      const Handler = await import(`./handler.js?update=${Date.now()}`).catch(console.error)
      if (Handler && Object.keys(Handler).length) {
        handler = Handler
        global.handlerModule = Handler
      }
    } catch (e) {
      console.error(e)
    }
  }

  if (isSubbotWorker) return true

  if (restartConn) {
    detenerPrekeys(global.conn)
    if (temporizadorPresencia) {
      clearInterval(temporizadorPresencia)
      temporizadorPresencia = null
    }
    try {
      if (global.conn.ws) global.conn.ws.close()
    } catch {}
    try { global.conn.ev.removeAllListeners() } catch {}

    const preservedStartTime = global.conn.startTime
    let preservedBotId = ''
    try {
      preservedBotId = String(global.conn.user?.jid || '').split('@')[0].replace(/\D/g, '')
    } catch {}

    global.conn = makeWASocket(connectionOptions)
    conn = global.conn

    if (preservedStartTime) {
      global.conn.startTime = preservedStartTime
    }
    try {
      const { setBotStartTime, getBotStartTime, markBotStart } = await import('./lib/bot-uptime.js')
      const kept = preservedStartTime || (preservedBotId && getBotStartTime(preservedBotId))
      if (kept) {
        setBotStartTime(global.conn, kept)
        if (preservedBotId) setBotStartTime(preservedBotId, kept)
      } else {
        markBotStart(global.conn)
      }
    } catch {}

    isInit = true
    setTimeout(() => {
      if (!socketPrincipalAbierto(global.conn)) reconectandoPrincipal = false
    }, 20000)
  }

  if (!isInit) {
    global.conn.ev.off('messages.upsert', global.conn.handler)
    global.conn.ev.off('connection.update', global.conn.connectionUpdate)
    global.conn.ev.off('creds.update', global.conn.credsUpdate)
  }

  global.conn.handler = handler.handler.bind(global.conn)
  global.conn.connectionUpdate = connectionUpdate.bind(global.conn)
  global.conn.credsUpdate = guardarCredencialesPrincipales

  initViewOnceAntiListener(global.conn)
  global.conn.ev.on('messages.upsert', global.conn.handler)
  global.conn.ev.on('connection.update', global.conn.connectionUpdate)
  global.conn.ev.on('creds.update', global.conn.credsUpdate)

  for (const sub of global.conns || []) {
    if (!sub?.ev) continue
    const fn = async (chatUpdate) => {
      if (!sub.authState?.creds?.registered) return
      const modulo = global.handlerModule
      if (!modulo?.handler) return
      // Cada mensaje se atiende dentro del contexto de SU sub-bot: la moneda,
      // el canal y los textos del menú premium no se mezclan entre sub-bots
      // que comparten este proceso.
      return ejecutarEnContextoBot(sub, () => modulo.handler.call(sub, chatUpdate))
    }
    const handlersAnteriores = new Set([sub.handler, sub._upsertVivo])
    for (const handlerAnterior of handlersAnteriores) {
      if (typeof handlerAnterior !== 'function') continue
      try { sub.ev.off('messages.upsert', handlerAnterior) } catch {}
    }
    sub._upsertVivo = fn
    sub.handler = fn
    sub.ev.on('messages.upsert', fn)
  }

  isInit = false
  return true
}

/**
 * Crea un socket principal NUEVO y sin credenciales, para re-vincular el
 * número desde el panel sin reiniciar el proceso. Así el panel web (y los
 * usuarios que están dentro) no se cortan ni un segundo: solo se cambia la
 * sesión de WhatsApp del principal.
 */
global.reiniciarPrincipalLimpio = async function reiniciarPrincipalLimpio({ timeoutMs = 45_000 } = {}) {
  if (isSubbotWorker) throw new Error('El bot principal no vive en este proceso.')

  // 1. El socket viejo se aparta (sin listeners: no debe reconectarse solo).
  try { global.conn?.ev?.removeAllListeners?.() } catch {}
  try { global.conn?.ws?.close?.() } catch {}
  try { global.conn?.end?.(undefined) } catch {}
  global.mainBotJid = null

  // 2. Credenciales nuevas (se borran las viejas).
  const { borrarCredencialesPrincipales } = await import('./lib/main-session.js')
  borrarCredencialesPrincipales()
  global.__painBloquearCreds = false

  const authState = await useMultiFileAuthState(global.authFile)
  state = authState.state
  saveCreds = authState.saveCreds

  const { version } = await fetchLatestBaileysVersion()
  connectionOptions = conSocketEstable({
    version,
    logger,
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    browser: Browsers.ubuntu('Chrome'),
    markOnlineOnConnect: true,
    appStateMacVerification: { patch: false, snapshot: false },
    msgRetryCache: cacheReintentoPrincipal,
  })

  global.conn = makeWASocket(connectionOptions)
  conn = global.conn
  global.conn.isInit = false
  global.conn.well = false

  global.conn.handler = handler.handler.bind(global.conn)
  global.conn.connectionUpdate = connectionUpdate.bind(global.conn)
  global.conn.credsUpdate = guardarCredencialesPrincipales
  initViewOnceAntiListener(global.conn)
  global.conn.ev.on('messages.upsert', global.conn.handler)
  global.conn.ev.on('connection.update', global.conn.connectionUpdate)
  global.conn.ev.on('creds.update', global.conn.credsUpdate)

  isInit = true
  principalVinculadoAvisado = false

  // 3. Se espera a que el socket quede listo para pedir el código.
  const limite = Date.now() + Math.max(5_000, Number(timeoutMs) || 0)
  while (Date.now() < limite) {
    if (socketPrincipalAbierto(global.conn)) return global.conn
    await new Promise((resolver) => setTimeout(resolver, 250))
  }
  return global.conn
}

/**
 * Recarga el panel web con el código actual SIN reiniciar el proceso:
 * cierra el servidor HTTP y lo vuelve a levantar con el código nuevo.
 * Las sesiones de WhatsApp de los sub-bots no se tocan.
 */
global.reiniciarPanelWeb = async function reiniciarPanelWeb() {
  if (global.webPanelHandle?.isolated) {
    try { return await global.webPanelHandle.restart() } catch (error) {
      console.error('[webpanel] No se pudo recargar el proceso web:', error?.message || error)
      return false
    }
  }
  const anterior = global.webPanelHandle
  const arranqueAnterior = global.webPanelStart
  let arranqueNuevo = null

  // 1. Validar el código nuevo ANTES de cerrar nada. Si hay un error de
  // sintaxis o un import roto, el panel actual sigue funcionando.
  try {
    globalThis.__HOT_EPOCH = Date.now()
    const modulo = await import('./lib/webpanel/server.js')
    arranqueNuevo = modulo.startWebPanel
    if (typeof arranqueNuevo !== 'function') throw new Error('startWebPanel no está disponible')
  } catch (error) {
    console.error('[webpanel] El código nuevo no se pudo cargar; se mantiene el panel anterior:', error?.message || error)
    return false
  }

  const arrancarConReintentos = async (fn) => {
    let ultimoError = null
    for (let intento = 0; intento < 6; intento++) {
      try {
        const handle = await fn()
        if (handle) return handle
        ultimoError = new Error('El panel no quedó escuchando.')
      } catch (error) {
        ultimoError = error
      }
      // El puerto puede tardar unos milisegundos en liberarse del todo.
      await new Promise((resolver) => setTimeout(resolver, 350 + intento * 150))
    }
    throw ultimoError || new Error('No se pudo arrancar el panel.')
  }

  // 2. Cerrar el panel viejo y levantar el nuevo.
  try {
    await anterior?.close?.()
  } catch (error) {
    console.error('[webpanel] No se pudo cerrar el panel anterior:', error?.message || error)
  }
  global.webPanelHandle = null

  try {
    global.webPanelHandle = await arrancarConReintentos(arranqueNuevo)
    const cfg = global.webPanelHandle?.config
    if (!cfg) throw new Error('El panel nuevo no devolvió configuración.')
    const host = cfg.host === '0.0.0.0' || cfg.host === '::' ? '127.0.0.1' : cfg.host
    const salud = await fetch(`http://${host}:${cfg.port}/healthz`, {
      signal: AbortSignal.timeout?.(5000),
    })
    if (!salud.ok) throw new Error(`Health check falló (${salud.status}).`)
    global.webPanelStart = arranqueNuevo
    console.log('[webpanel] Panel recargado con el código nuevo (sin reiniciar el proceso).')
    return true
  } catch (error) {
    console.error('[webpanel] El panel nuevo falló; se intenta restaurar el anterior:', error?.message || error)
    try { await global.webPanelHandle?.close?.() } catch {}
    global.webPanelHandle = null
    if (typeof arranqueAnterior === 'function') {
      try {
        global.webPanelHandle = await arrancarConReintentos(arranqueAnterior)
        global.webPanelStart = arranqueAnterior
        console.warn('[webpanel] Se restauró el panel anterior.')
      } catch (restoreError) {
        console.error('[webpanel] Tampoco se pudo restaurar el panel anterior:', restoreError?.message || restoreError)
      }
    }
    return false
  }
}

/**
 * Recarga en caliente el handler, los módulos de lib/ y los plugins
 * indicados, sin reiniciar el proceso.
 */
global.recargarEnCaliente = async function recargarEnCaliente({ plugins = [] } = {}) {
  const resumen = { handler: false, plugins: [] }

  // Epoch nuevo: handler.js y lib/*.js se reimportan frescos.
  globalThis.__HOT_EPOCH = Date.now()
  try {
    await global.reloadHandler?.(false)
    resumen.handler = true
  } catch (error) {
    console.error('[hot] No se pudo recargar el handler:', error?.message || error)
  }

  for (const archivo of plugins) {
    try {
      await global.reload?.(null, archivo)
      resumen.plugins.push(archivo)
    } catch (error) {
      console.error(`[hot] No se pudo recargar el plugin ${archivo}:`, error?.message || error)
    }
  }

  return resumen
}

/**
 * Pide a los workers de sub-bots que recarguen su codigo en caliente.
 * Sin esto, una actualizacion solo llegaba al proceso principal y los
 * sub-bots seguian con el codigo viejo hasta reiniciar.
 */
global.pedirRecargaWorkers = async function pedirRecargaWorkers(plugins = []) {
  if (isSubbotWorker) return { dispatched: 0, workers: 0, motivo: 'worker' }
  if (typeof requestReloadAll !== 'function') return { dispatched: 0, workers: 0, motivo: 'sin-ipc' }
  try {
    const ack = await requestReloadAll({ plugins })
    if (!ack) return { dispatched: 0, workers: 0, motivo: 'sin-respuesta' }
    return { dispatched: ack.dispatched ? 1 : 0, workers: ack.workers || 0, motivo: null }
  } catch (error) {
    console.error('[hot] No se pudo pedir la recarga a los workers:', error?.message || error)
    return { dispatched: 0, workers: 0, motivo: error?.message || 'error' }
  }
}

const pluginFolder = join(__dirname, 'plugins')
const pluginFilter = (filename) => /\.js$/.test(filename)

function normalizePlugin(plugin) {
  if (typeof plugin === 'function') {
    return {
      handler: plugin,
      command: plugin.command || [],
      tags: plugin.tags || [],
      help: plugin.help || [],
      all: plugin.all,
      before: plugin.before,
      customPrefix: plugin.customPrefix,
      disabled: false,
    }
  }
  if (plugin.command && typeof plugin.command === 'string') {
    plugin.command = [plugin.command]
  }
  return plugin
}

global.plugins = {}

async function filesInit() {
  for (const filename of readdirSync(pluginFolder).filter(pluginFilter)) {
    try {
      const file = global.__filename(join(pluginFolder, filename))
      const module = await import(file)
      global.plugins[filename] = normalizePlugin(module.default || module)
    } catch (e) {
      conn.logger.error(`Error cargando plugin ${filename}:`, e)
      delete global.plugins[filename]
    }
  }
}
await filesInit()
global.pluginsEpoch = (global.pluginsEpoch || 0) + 1

global.reload = async (_ev, filename) => {
  if (pluginFilter(filename)) {
    const dir = global.__filename(join(pluginFolder, filename), true)
    // En los workers de sub-bots no hay socket principal: conn es undefined.
    const log = conn?.logger || global.conn?.logger || console
    if (filename in global.plugins) {
      if (existsSync(dir)) log.info?.(`Updated plugin - '${filename}'`)
      else {
        log.warn?.(`Deleted plugin - '${filename}'`)
        delete global.plugins[filename]
        global.pluginsEpoch = (global.pluginsEpoch || 0) + 1
        return
      }
    } else log.info?.(`New plugin - '${filename}'`)

    const err = syntaxerror(readFileSync(dir), filename, {
      sourceType: 'module',
      allowAwaitOutsideFunction: true,
    })
    if (err) log.error?.(`Syntax error while loading '${filename}':\n${format(err)}`)
    else {
      try {
        const module = await import(`${global.__filename(dir)}?update=${Date.now()}`)
        global.plugins[filename] = normalizePlugin(module.default || module)
      } catch (e) {
        log.error?.(`Error requiring plugin '${filename}':\n${format(e)}`)
      } finally {
        global.plugins = Object.fromEntries(Object.entries(global.plugins).sort(([a], [b]) => a.localeCompare(b)))
        global.pluginsEpoch = (global.pluginsEpoch || 0) + 1
      }
    }
  }
}
Object.freeze(global.reload)

watch(pluginFolder, global.reload)

function agendarRecargaCodigo(nombre) {
  clearTimeout(agendarRecargaCodigo._espera)
  agendarRecargaCodigo._espera = setTimeout(async () => {
    try {
      globalThis.__HOT_EPOCH = Date.now()
      // handler.js y TODO el árbol lib/ se reimporta fresco con el epoch nuevo:
      // el gráfico de importación del handler ya incluye los módulos de lib/.
      // Los plugins NO se reimportan en bloque aquí (una copia viva por módulo
      // por cada cambio llenaba el heap); cada plugin toma el código nuevo
      // cuando su propio archivo cambia o al reconectar/reiniciar el worker.
      // El panel web se recarga en su propio arranque: valida el código nuevo
      // primero y si falla conserva el panel anterior, sin cortar WhatsApp.
      // Solo el proceso principal hospeda la web; los workers la ignoran.
      if (nombre.startsWith('lib/webpanel/')) {
        if (isSubbotWorker) return
        if (typeof global.reiniciarPanelWeb === 'function') {
          const ok = await global.reiniciarPanelWeb()
          if (ok) console.log(chalk.cyan(`[hot] ${nombre}: panel recargado sin cortar WhatsApp.`))
          else console.log(chalk.yellow(`[hot] ${nombre}: el panel conservó el código anterior (error en el código nuevo).`))
        }
        return
      }
      if (nombre === 'handler.js') {
        await global.reloadHandler(false)
        console.log(chalk.cyan(`Updated code - '${nombre}'`))
        return
      }
      // Cambio bajo lib/: se aplica al handler SIN reiniciar el proceso.
      await global.reloadHandler(false)
      console.log(chalk.cyan(
        `[hot] ${nombre}: código nuevo aplicado al handler y a los sub-bots ` +
        '(los mensajes siguientes ya usan el código nuevo). ' +
        'Para cambios profundos de arranque (main/index/config) sí hace falta reiniciar.'
      ))
    } catch (e) {
      console.error('No se pudo recargar el código:', e?.message || e)
    }
  }, 400)
}

watch(join(__dirname, 'handler.js'), () => agendarRecargaCodigo('handler.js'))
watch(join(__dirname, 'lib'), { recursive: true }, (_evento, filename) => {
  if (!filename || !String(filename).endsWith('.js')) return
  agendarRecargaCodigo(join('lib', filename).replace(/\\/g, '/'))
})

if (!isSubbotWorker) {
  await global.reloadHandler()
} else {
  global.conns = []
  const assignedSessions = JSON.parse(process.env.PAIN_SESSIONS_JSON || '[]')
  if (!Array.isArray(assignedSessions)) throw new Error('La asignación de sub-bots no es válida')
  const serbotModule = await import('./plugins/serbot-serbot.js')
  const serbotDir = resolve(__dirname, global.bot || 'Serbot')
  let sessions = [...new Set(assignedSessions)].filter(folder =>
    typeof folder === 'string' && /^[a-zA-Z0-9_-]+$/.test(folder)
  )
  const workerId = process.env.PAIN_WORKER_ID || 'subbot'
  iniciarMetricasWorker()
  const sesionesIniciando = new Map()
  const sesionesRetiradas = new Set()
  const iniciarSesion = (folder) => {
    if (sesionesRetiradas.has(folder)) return Promise.resolve('skipped')
    const existing = sesionesIniciando.get(folder)
    if (existing) return existing
    const botPath = join(serbotDir, folder)
    if (sesionEnEmparejamiento(botPath)) {
      console.warn(`Worker subbot: se omite ${folder}, se está vinculando desde el panel web.`)
      return Promise.resolve('skipped')
    }
    if (existsSync(join(botPath, ARCHIVO_REENLACE_PENDIENTE))) {
      try {
        purgarSesionReenlace(botPath, serbotDir)
        console.warn(`Worker subbot: se archivó ${folder} (requiere volver a vincular); ajustes conservados.`)
        if (typeof process.send === 'function') {
          try { process.send({ type: 'remove-session', session: folder }, () => {}) } catch {}
        }
      } catch (error) {
        console.error(`Worker subbot: no se pudo archivar ${folder}:`, error?.message || error)
      }
      return Promise.resolve('skipped')
    }
    if (!existsSync(join(botPath, 'creds.json'))) {
      console.warn(`Worker subbot: se omite ${folder}, no tiene creds.json.`)
      return Promise.resolve('skipped')
    }
    const promise = serbotModule.AYBot({
      pathAYBot: botPath,
      m: null,
      conn: global.conn,
      args: [],
      usedPrefix: '.',
      command: 'qr',
      fromCommand: false,
      esperarConexion: false
    }).then((started) => {
      if (!started) {
        console.error(`Worker subbot: no se pudo iniciar la sesión ${folder}.`)
        return 'failed'
      }
      return 'started'
    }).catch((error) => {
      console.error(`Worker subbot: error iniciando ${folder}:`, error?.message || error)
      return 'failed'
    }).finally(() => sesionesIniciando.delete(folder))
    sesionesIniciando.set(folder, promise)
    return promise
  }
  const publishWorkerStatus = () => {
    const socketsBySessionPath = new Map()
    for (const socket of global.conns) {
      if (socket?.pathAYBot) socketsBySessionPath.set(resolve(socket.pathAYBot), socket)
    }
    const estado = estadoMemoriaProceso()
    writeSubbotWorkerStatus(__dirname, workerId, sessions.map((folder) => {
      const socket = socketsBySessionPath.get(join(serbotDir, folder))
      const readyState = socket?.ws?.socket?.readyState ?? socket?.ws?.readyState
      return {
        folder,
        number: socket?.phoneNumber || socket?.botNumber ||
          socket?.user?.jid || socket?.user?.id || folder,
        name: socket?.user?.name || socket?.authState?.creds?.me?.name || '',
        // Identidad completa (PN + LID) para que otros procesos puedan saber
        // si este sub-bot está en un grupo concreto.
        jid: socket?.user?.jid || socket?.user?.id || '',
        lid: socket?.user?.lid || '',
        connected: Boolean(
          (socket?.user?.jid || socket?.user?.id) &&
          (socket?.ws?.isOpen === true || readyState === ws.OPEN)
        ),
        requiresRelink: existsSync(join(serbotDir, folder, '.needs-relink')),
        actividad: obtenerActividadSocket(socket, { reset: true }),
      }
    }), {
      memoria: estado.memoria,
      recursos: {
        sockets: estado.sockets,
        chats: estado.chats,
        mensajes: estado.mensajes,
        metadata: estado.metadata,
        participantes: estado.participantes,
        cacheMensajes: estado.cacheMensajes,
        modoAhorro: estado.modoAhorro,
      },
      // Métricas operacionales: lag del event loop (ms), CPU %, mensajería y
      // reconexiones de esta ventana. Las usa el supervisor para balancear
      // por carga real; el panel puede mostrarlas tal cual.
      metricas: registrarMetricasWorkerEnseguro(),
    })
  }
  function registrarMetricasWorkerEnseguro() {
    try { return registrarMetricasWorker() } catch { return null }
  }
  async function persistirMetricaEnseguro(id, raiz) {
    try {
      const muestra = registrarMetricasWorker()
      if (muestra) await persistirMetrica(id, raiz, muestra)
    } catch {}
  }
  publishWorkerStatus()
  let ticksEstado = 0
  // 15 s: sigue muy por debajo del umbral de estado obsoleto (60 s) y reduce
  // un tercio el JSON/escritura de estado con cientos de sesiones.
  workerStatusInterval = setInterval(() => {
    try {
      publishWorkerStatus()
    } catch (error) {
      console.error(`Worker ${workerId}: no se pudo publicar el estado de sus sesiones:`, error?.message || error)
    }
    // Historial liviano: una línea por minuto en storage/metrics/
    if (ticksEstado % 4 === 3) {
      persistirMetricaEnseguro(workerId, __dirname)
    }
    // Higiene de memoria cada ~30s (2 ticks de 15s).
    if (++ticksEstado % 2 === 0) {
      import('./lib/mem-hygiene.js').then(({ higieneMemoriaProceso }) => {
        try {
          higieneMemoriaProceso()
        } catch {}
      }).catch(() => {})
      // Archiva sesiones rechazadas: evita que se acumulen carpetas muertas.
      try { purgarReenlacesPendientes(serbotDir) } catch {}
    }
  }, 10_000)
  workerStatusInterval.unref?.()
  process.on('message', async (message) => {
    if (message?.type === 'reload-worker') {
      // Actualización en caliente del worker: se reimportan handler + plugins
      // sin reiniciar el proceso (las sesiones siguen conectadas).
      const plugins = Array.isArray(message.plugins)
        ? message.plugins.filter((p) => typeof p === 'string')
        : []
      let resumen = { handler: false, plugins: [] }
      let error = null
      try {
        resumen = (await global.recargarEnCaliente?.({ plugins })) || resumen
      } catch (e) {
        error = e?.message || String(e)
      }
      try {
        process.send({
          type: 'reload-worker-result',
          requestId: message.requestId,
          resumen,
          error
        }, () => {})
      } catch {}
      return
    }
    if (message?.type === 'send-private' && typeof message.text === 'string') {
      // /subme: cada sub-bot de este worker se escribe a sí mismo el mensaje.
      const { enviarMensajeASuPropioChat } = await import('./lib/subme-broadcast.js')
      const sockets = (global.conns || []).filter(Boolean)
      const resultado = await enviarMensajeASuPropioChat(message.text, sockets)
      try {
        process.send({
          type: 'send-private-result',
          requestId: message.requestId,
          enviados: resultado.enviados,
          fallidos: resultado.fallidos,
        }, () => {})
      } catch {}
      return
    }
    if (message?.type === 'reconnect-sessions' && Array.isArray(message.sessions)) {
      const wanted = [...new Set(message.sessions)].filter(folder =>
        typeof folder === 'string' && /^[a-zA-Z0-9_-]+$/.test(folder)
      )
      if (!wanted.length) return
      for (const folder of wanted) {
        sesionesRetiradas.delete(folder)
        if (!sessions.includes(folder)) sessions.push(folder)
      }
      const socketAbiertoAqui = (folder) => {
        const digits = String(folder).replace(/\D/g, '')
        return (global.conns || []).some((c) => {
          const tieneUsuario = Boolean(c?.user?.id || c?.user?.jid)
          const abierto = c?.ws?.isOpen === true ||
            (c?.ws?.socket?.readyState ?? c?.ws?.readyState) === ws.OPEN
          if (!tieneUsuario || !abierto) return false
          const jidDigits = String(c?.phoneNumber || c?.botNumber || c?.user?.jid || c?.user?.id || '')
            .split('@')[0].split(':')[0].replace(/\D/g, '')
          const pathDigits = c?.pathAYBot
            ? String(c.pathAYBot).split(/[\\/]/).pop().replace(/\D/g, '')
            : ''
          return jidDigits === digits || pathDigits === digits
        })
      }
      for (const folder of wanted) {
        if (socketAbiertoAqui(folder)) continue
        try {
          await serbotModule.retirarSesionDeWorker(join(serbotDir, folder), { handoff: false })
        } catch {}
        sesionesRetiradas.delete(folder)
        await iniciarSesion(folder)
      }
      try {
        publishWorkerStatus()
      } catch (error) {
        console.error(`Worker ${workerId}: no se pudo actualizar el estado tras reconectar:`, error?.message || error)
      }
      return
    }
    if (message?.type === 'add-sessions' && Array.isArray(message.sessions)) {
      const added = ordenarSesionesPorPrioridad(serbotDir, [...new Set(message.sessions)].filter(folder =>
        typeof folder === 'string' && /^[a-zA-Z0-9_-]+$/.test(folder)
      ))
      for (const folder of added) {
        sesionesRetiradas.delete(folder)
        if (!sessions.includes(folder)) sessions.push(folder)
      }
      // No abrir todas las sesiones añadidas en paralelo: una oleada de
      // handshakes deja sin respuesta los keepalives de sockets ya vivos y
      // provoca una cascada de 408. Se conserva el orden premium/FIFO.
      for (let i = 0; i < added.length; i++) {
        await iniciarSesion(added[i])
        if (i + 1 < added.length && pausaEntreLotesMs > 0) {
          await new Promise(resolve => setTimeout(resolve, pausaEntreLotesMs))
        }
      }
      try {
        publishWorkerStatus()
      } catch (error) {
        console.error(`Worker ${workerId}: no se pudo actualizar el estado tras añadir sesiones:`, error?.message || error)
      }
      return
    }
    if (message?.type !== 'remove-sessions' || !Array.isArray(message.sessions)) return
    const removed = new Set(message.sessions.filter(folder =>
      typeof folder === 'string' && /^[a-zA-Z0-9_-]+$/.test(folder)
    ))
    if (!removed.size) return
    for (const folder of removed) sesionesRetiradas.add(folder)
    const cierres = [...removed].map((folder) =>
      serbotModule.retirarSesionDeWorker(
        join(serbotDir, folder),
        { handoff: message.handoff === true }
      )
    )
    sessions = sessions.filter(folder => !removed.has(folder))
    await Promise.all(cierres)
    try {
      publishWorkerStatus()
    } catch (error) {
      console.error(`Worker ${workerId}: no se pudo actualizar el estado tras eliminar sesiones:`, error?.message || error)
    }
    for (const folder of removed) confirmSessionLease(folder)
  })
  const batchSize = Math.max(Number.parseInt(process.env.PAIN_SUBBOT_BATCH, 10) || 1, 1)
  const retrasoInicial = Number.parseInt(process.env.PAIN_START_DELAY_MS, 10) || 0
  const pausaEntreLotesMs = Number.parseInt(process.env.PAIN_SUBBOT_BATCH_DELAY_MS, 10) || 5000
  if (retrasoInicial > 0) await new Promise(resolve => setTimeout(resolve, retrasoInicial))
  // Premium primero en el arranque: con cientos de sesiones, los sub-bots de
  // pago quedan en línea antes que el resto (mismo criterio en la cola de
  // reconexiones, así escala sin depender de una cantidad fija).
  const initialSessions = ordenarSesionesPorPrioridad(serbotDir, [...sessions])
  let started = 0
  let skipped = 0
  let failed = 0
  for (let i = 0; i < initialSessions.length; i += batchSize) {
    const batch = initialSessions.slice(i, i + batchSize)
    const results = await Promise.all(batch.map(async (folder) => {
      return iniciarSesion(folder)
    }))
    started += results.filter(result => result === 'started').length
    skipped += results.filter(result => result === 'skipped').length
    failed += results.filter(result => result === 'failed').length
    if (i + batchSize < initialSessions.length) {
      await new Promise(resolve => setTimeout(resolve, pausaEntreLotesMs))
    }
  }
  console.log(
    `Worker ${workerId} inició ${started}/${sessions.length} sesión(es); ` +
    `${skipped} omitida(s), ${failed} con error.`
  )
  try { purgarReenlacesPendientes(serbotDir) } catch {}
}

function cerrarConexionesDelProceso(signal) {
  console.log(`Proceso ${process.env.PAIN_WORKER_ID || 'primary'} cerrando por ${signal}.`)
  if (isSubbotWorker) {
    if (workerStatusInterval) clearInterval(workerStatusInterval)
    removeSubbotWorkerStatus(__dirname, process.env.PAIN_WORKER_ID || 'subbot')
  }
  const sockets = new Set([global.conn, ...(global.conns || [])])
  for (const socket of sockets) {
    if (!socket) continue
    try { detenerPrekeys(socket) } catch {}
    try { socket.ev?.removeAllListeners?.() } catch {}
    try { socket.ws?.close?.() } catch {}
  }
  // Volcado final: antes se cerraba sin guardar y se perdía hasta 3 min
  // de cambios en memoria (comisiones, msgs, etc.). El supervisor da 10s.
  const salir = () => process.exit(0)
  const volcadoFinal = (async () => {
    try {
      await Promise.race([
        global.db?.write?.() ?? Promise.resolve(),
        new Promise((resolve) => setTimeout(resolve, 8000)),
      ])
    } catch (error) {
      console.error('[db] No se pudo volcar antes de salir:', error?.message || error)
    }
    try {
      await global.db?.adapter?.close?.()
    } catch (error) {
      console.error('[db] No se pudieron cerrar las conexiones SQLite:', error?.message || error)
    }
    try {
      await Promise.race([
        global.webPanelHandle?.close?.() ?? Promise.resolve(),
        new Promise((resolve) => setTimeout(resolve, 2500)),
      ])
    } catch (error) {
      console.error('[webpanel] No se pudo cerrar el panel:', error?.message || error)
    }
  })()
  volcadoFinal.then(salir, salir)
  setTimeout(salir, 9500).unref?.()
}

process.once('SIGINT', () => cerrarConexionesDelProceso('SIGINT'))
process.once('SIGTERM', () => cerrarConexionesDelProceso('SIGTERM'))
process.on('message', (message) => {
  if (message?.type === 'shutdown') cerrarConexionesDelProceso('shutdown')
})

// Compactación del WAL: con 6 procesos escribiendo sin parar el checkpoint
// pasivo nunca completa y el WAL crece (lecturas cada vez más lentas).
// Solo el principal lo hace, cada 10 min (PAIN_DB_CHECKPOINT_MS, 0 = off).
if (!isSubbotWorker) {
  const intervaloCheckpoint = Number.parseInt(process.env.PAIN_DB_CHECKPOINT_MS, 10)
  const cadaCheckpointMs = Number.isInteger(intervaloCheckpoint) ? intervaloCheckpoint : 600_000
  if (cadaCheckpointMs > 0) {
    const compactarWal = async () => {
      try {
        const adapter = global.db?.adapter
        if (!adapter?.checkpointWal) return
        for (const objetivo of [adapter.filename, adapter.claimsFilename].filter(Boolean)) {
          try {
            const res = await adapter.checkpointWal(objetivo)
            if (res && Number(res.busy) !== 0) {
              console.warn(`[db] Checkpoint ocupado en ${objetivo}: ${res.log ?? '?'} frames pendientes.`)
            }
          } catch (error) {
            console.error(`[db] No se pudo compactar ${objetivo}:`, error?.message || error)
          }
        }
      } catch (error) {
        console.error('[db] Error compactando WAL:', error?.message || error)
      }
    }
    const primerCheckpoint = setTimeout(() => void compactarWal(), 120_000)
    primerCheckpoint.unref?.()
    const cadaCheckpoint = setInterval(() => void compactarWal(), Math.max(cadaCheckpointMs, 60_000))
    cadaCheckpoint.unref?.()
  }
}


let reconexionSubBotsPromise = null

// Archiva (conserva ajustes + borra carpeta) las sesiones marcadas para volver
// a vincular, avisando al supervisor para que las suelte sin reiniciar workers.
function purgarReenlacesPendientes(serbotDir) {
  let purgadas = []
  try {
    purgadas = purgarSesionesReenlace(serbotDir)
  } catch (error) {
    console.error('[reenlace] No se pudieron archivar sesiones para revincular:', error?.message || error)
    return
  }
  for (const folder of purgadas) {
    console.log(chalk.cyan(
      `Sesión +${folder} archivada (requiere revincular); ajustes conservados para restaurarlos al volver a vincular.`
    ))
    if (typeof process.send === 'function') {
      try { process.send({ type: 'remove-session', session: folder }, () => {}) } catch {}
    }
  }
}

function contarSesionesEnDisco(serbotDir) {
  try {
    if (!existsSync(serbotDir)) return { todas: [], revisables: [], requierenVincular: 0 }
    const todas = readdirSync(serbotDir).filter((folder) => {
      try {
        const folderPath = join(serbotDir, folder)
        return statSync(folderPath).isDirectory() &&
          existsSync(join(folderPath, 'creds.json')) &&
          !sesionEnEmparejamiento(folderPath)
      } catch {
        return false
      }
    })
    // Cubre marcas presentes y sesiones ya archivadas (solo registro).
    let requierenVincular = 0
    try {
      requierenVincular = listarRequierenVincular(serbotDir).length
    } catch {}
    const revisables = todas.filter((folder) =>
      !sesionRequiereVincular(join(serbotDir, folder)) &&
      !vinculacionEnCurso(join(serbotDir, folder))
    )
    return { todas, revisables, requierenVincular }
  } catch {
    return { todas: [], revisables: [], requierenVincular: 0 }
  }
}

function contarConectadosManaged() {
  const vistos = new Set()
  try {
    for (const worker of readSubbotWorkerStatuses(__dirname)) {
      for (const s of worker.sessions || []) {
        if (s?.connected) vistos.add(String(s.folder))
      }
    }
  } catch {}
  for (const c of global.conns || []) {
    try {
      const tieneUsuario = Boolean(c?.user?.id || c?.user?.jid)
      const abierto = c?.ws?.isOpen === true ||
        (c?.ws?.socket?.readyState ?? c?.ws?.readyState) === ws.OPEN
      if (!tieneUsuario || !abierto) continue
      const folder = c?.pathAYBot ? String(c.pathAYBot).split(/[\\/]/).pop() : ''
      if (folder) vistos.add(folder)
    } catch {}
  }
  return vistos
}

global.reconnectSubBotsManaged = async function() {
  if (reconexionSubBotsPromise) return reconexionSubBotsPromise
  reconexionSubBotsPromise = (async () => {
    const serbotDir = global.bot || './Serbot'
    const { todas, revisables, requierenVincular } = contarSesionesEnDisco(serbotDir)
    if (!todas.length) {
      console.log(chalk.yellow('No se encontraron sub-bots para reconectar'))
      return { total: 0, omitidos: 0, conectados: 0, pendientes: 0, fallidos: 0, requierenVincular: 0 }
    }
    const antes = contarConectadosManaged()
    const porReconectar = revisables.filter((f) => !antes.has(String(f)))
    console.log(chalk.cyan(
      `\nSesiones registradas: ${todas.length}; ya conectadas: ${antes.size}; ` +
      `por reconectar: ${porReconectar.length}; requieren vincular: ${requierenVincular}.`
    ))
    if (!porReconectar.length) {
      return {
        total: todas.length,
        omitidos: antes.size,
        conectados: 0,
        pendientes: 0,
        fallidos: 0,
        requierenVincular
      }
    }
    let ack = null
    try {
      ack = await requestReconnectAll()
    } catch (error) {
      console.error('[rebot all] No se pudo pedir reconexión a los workers:', error?.message || error)
    }
    if (!ack?.dispatched) {
      return {
        total: todas.length,
        omitidos: antes.size,
        conectados: 0,
        pendientes: porReconectar.length,
        fallidos: 0,
        requierenVincular
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 15_000))
    const despues = contarConectadosManaged()
    let conectados = 0
    for (const f of porReconectar) {
      if (despues.has(String(f)) && !antes.has(String(f))) conectados++
    }
    const omitidos = [...despues].filter((f) => antes.has(String(f))).length || antes.size
    const pendientes = Math.max(0, porReconectar.length - conectados)
    console.log(chalk.cyan(
      `\nRevisión terminada: ${conectados} reconectados, ${omitidos} ya activos, ` +
      `${pendientes} pendientes y ${requierenVincular} requieren vincular.`
    ))
    return {
      total: todas.length,
      omitidos,
      conectados,
      pendientes,
      fallidos: 0,
      requierenVincular
    }
  })()
  try {
    return await reconexionSubBotsPromise
  } finally {
    reconexionSubBotsPromise = null
  }
}

global.reconnectSubBotOneManaged = async function(folder) {
  const clean = String(folder || '').replace(/\D/g, '')
  if (!clean) return { ok: false, reason: 'invalid' }
  const serbotDir = global.bot || './Serbot'
  const raiz = join(serbotDir, clean)
  let realFolder = clean
  try {
    if (existsSync(serbotDir)) {
      for (const name of readdirSync(serbotDir)) {
        if (String(name).replace(/\D/g, '') === clean) {
          realFolder = name
          break
        }
      }
    }
  } catch {}
  if (sesionEnEmparejamiento(join(serbotDir, realFolder))) {
    return { ok: false, reason: 'pairing' }
  }
  if (necesitaRevinculacion(serbotDir, realFolder) || sesionRequiereVincular(join(serbotDir, realFolder))) {
    return { ok: false, reason: 'needs-relink' }
  }
  const antes = contarConectadosManaged()
  if (antes.has(String(realFolder))) return { ok: true, already: true }
  const ack = await requestReconnectOne(realFolder)
  if (!ack?.dispatched) return { ok: false, reason: 'no-worker' }
  const limite = Date.now() + 50_000
  while (Date.now() < limite) {
    await new Promise((r) => setTimeout(r, 1000))
    if (contarConectadosManaged().has(String(realFolder))) return { ok: true }
  }
  return { ok: false, reason: 'timeout' }
}

global.reconnectSubBots = async function() {
  if (isSubbotWorker) {
    return { total: 0, omitidos: 0, conectados: 0, pendientes: 0, fallidos: 0 }
  }
  if (isManagedPrimary) {
    return global.reconnectSubBotsManaged()
  }
  if (reconexionSubBotsPromise) return reconexionSubBotsPromise

  reconexionSubBotsPromise = (async () => {
  if (!global.conns || !Array.isArray(global.conns)) {
    global.conns = []
  }

  const serbotDir = global.bot || './Serbot'
  if (!existsSync(serbotDir)) {
    console.log(chalk.yellow('No se encontró la carpeta Serbot'))
    return { total: 0, omitidos: 0, conectados: 0, pendientes: 0, fallidos: 0 }
  }

  const sesionesSubBot = readdirSync(serbotDir).filter(folder => {
    try {
      const folderPath = join(serbotDir, folder)
      return statSync(folderPath).isDirectory() && existsSync(join(folderPath, 'creds.json'))
    } catch (error) {
      console.error(`No se pudo revisar la sesión ${folder}:`, error?.message || error)
      return false
    }
  })
  const enSesiones = new Set(sesionesSubBot)
  let requierenVincular = sesionesSubBot.filter(folder =>
    sesionRequiereVincular(join(serbotDir, folder))
  ).length
  try {
    for (const folder of readdirSync(serbotDir)) {
      if (enSesiones.has(folder)) continue
      try {
        const folderPath = join(serbotDir, folder)
        if (!statSync(folderPath).isDirectory()) continue
        if (existsSync(join(folderPath, 'creds.json'))) continue
        if (sesionRequiereVincular(folderPath)) requierenVincular++
      } catch {}
    }
  } catch {}
  const sesionesRevisables = sesionesSubBot.filter(folder =>
    !sesionRequiereVincular(join(serbotDir, folder)) &&
    !vinculacionEnCurso(join(serbotDir, folder))
  )

  if (sesionesSubBot.length === 0) {
    console.log(chalk.yellow('No se encontraron sub-bots para reconectar'))
    return { total: 0, omitidos: 0, conectados: 0, pendientes: 0, fallidos: 0, requierenVincular: 0 }
  }

  if (requierenVincular) {
    console.warn(`${requierenVincular} sub-bot(s) tienen una sesión rechazada y requieren volver a vincularse.`)
  }

  if (sesionesRevisables.length === 0) {
    return {
      total: sesionesSubBot.length,
      omitidos: 0,
      conectados: 0,
      pendientes: 0,
      fallidos: 0,
      requierenVincular
    }
  }

  const serbotModule = await import('./plugins/serbot-serbot.js')
  const CONCURRENCIA_MAXIMA = 5
  const PAUSA_ENTRE_INTENTOS_MS = 1500
  let siguiente = 0
  let conectados = 0
  let pendientes = 0
  let fallidos = 0

  const socketSubBotAbierto = (c) => {
    try {
      const tieneUsuario = Boolean(c?.user?.id || c?.user?.jid)
      const socketAbierto = c.ws?.isOpen === true || c.ws?.socket?.readyState === ws.OPEN
      return tieneUsuario && socketAbierto
    } catch {
      return false
    }
  }

  const socketDeCarpetaAbierto = (folder) => {
    const folderDigits = String(folder).replace(/\D/g, '')
    return global.conns.some(c => {
      if (!socketSubBotAbierto(c)) return false
      const jidDigits = String(c?.phoneNumber || c?.botNumber || c?.user?.jid || c?.user?.id || '')
        .split('@')[0].split(':')[0].replace(/\D/g, '')
      const pathDigits = c?.pathAYBot
        ? String(c.pathAYBot).split(/[\\/]/).pop().replace(/\D/g, '')
        : ''
      return jidDigits === folderDigits || pathDigits === folderDigits
    })
  }

  const socketDeCarpeta = (folder) => {
    const folderDigits = String(folder).replace(/\D/g, '')
    return global.conns.find(c => {
      const jidDigits = String(c?.phoneNumber || c?.botNumber || c?.user?.jid || c?.user?.id || '')
        .split('@')[0].split(':')[0].replace(/\D/g, '')
      const pathDigits = c?.pathAYBot
        ? String(c.pathAYBot).split(/[\\/]/).pop().replace(/\D/g, '')
        : ''
      return jidDigits === folderDigits || pathDigits === folderDigits
    })
  }

  const esperarSocketAbierto = async (folder, timeoutMs = 60_000) => {
    const vence = Date.now() + timeoutMs
    while (Date.now() < vence) {
      if (socketDeCarpetaAbierto(folder)) return true
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    return socketDeCarpetaAbierto(folder)
  }

  let omitidos = sesionesRevisables.filter(socketDeCarpetaAbierto).length
  const subBotFolders = sesionesRevisables.filter(folder => !socketDeCarpetaAbierto(folder))
  console.log(chalk.cyan(
    `\nSesiones registradas: ${sesionesSubBot.length}; ya conectadas: ${omitidos}; ` +
    `por reconectar: ${subBotFolders.length}; requieren vincular: ${requierenVincular}.`
  ))

  if (subBotFolders.length === 0) {
    return {
      total: sesionesSubBot.length,
      omitidos,
      conectados: 0,
      pendientes: 0,
      fallidos: 0,
      requierenVincular
    }
  }

  async function conectarUno(folder) {
    const botPath = join(serbotDir, folder)
    if (socketDeCarpetaAbierto(folder)) {
      omitidos++
      return
    }

    const intentosMaximos = 3
    const socketExistente = socketDeCarpeta(folder)
    if (socketExistente) {
      for (let intento = 1; intento <= intentosMaximos; intento++) {
        if (socketDeCarpetaAbierto(folder)) {
          omitidos++
          return
        }

        const socketActual = socketDeCarpeta(folder)
        if (!socketActual || typeof socketActual.reconectarPain !== 'function') {
          console.warn(`Sub-bot ${folder} no tiene reconectador disponible; se evita crear una conexión duplicada.`)
          pendientes++
          return
        }

        try {
          const inicio = await socketActual.reconectarPain()
          if (inicio === false) {
            pendientes++
            return
          }
          if (await esperarSocketAbierto(folder)) {
            conectados++
            return
          }
          console.error(`Intento ${intento}/${intentosMaximos}: tiempo agotado esperando el socket existente ${folder}`)
        } catch (error) {
          console.error(`Intento ${intento}/${intentosMaximos} reconectando socket existente ${folder}:`, error?.message || error)
        }

        if (intento < intentosMaximos) {
          await new Promise(resolve => setTimeout(resolve, 5000 * intento))
        }
      }
      fallidos++
      return
    }

    for (let intento = 1; intento <= intentosMaximos; intento++) {
      if (!existsSync(join(botPath, 'creds.json'))) {
        console.log(chalk.yellow(`Sesión sin credenciales, se omite ${folder}`))
        fallidos++
        return
      }
      try {
        if (!serbotModule.AYBot) throw new Error('AYBot no está disponible')
        const resultado = await serbotModule.AYBot({
          pathAYBot: botPath,
          m: null,
          conn: global.conn,
          args: [],
          usedPrefix: '.',
          command: 'qr',
          fromCommand: false,
          esperarConexion: true,
          timeoutConexionMs: 60_000
        })
        if (resultado && await esperarSocketAbierto(folder, 1000)) {
          console.log(chalk.green(`Sub-bot ${folder} conectado`))
          conectados++
          return
        }
        throw new Error(`No se confirmó el socket abierto para ${folder}`)
      } catch (error) {
        console.error(`Intento ${intento}/${intentosMaximos} fallido para ${folder}:`, error?.message || error)
        if (intento < intentosMaximos && existsSync(join(botPath, 'creds.json'))) {
          await new Promise(resolve => setTimeout(resolve, 5000 * intento))
        }
      }
    }
    fallidos++
  }

  async function trabajador() {
    while (siguiente < subBotFolders.length) {
      const folder = subBotFolders[siguiente++]
      await conectarUno(folder)
      if (siguiente < subBotFolders.length) {
        await new Promise(resolve => setTimeout(resolve, PAUSA_ENTRE_INTENTOS_MS))
      }
    }
  }

  console.log(chalk.cyan(
    `Reconectando hasta ${Math.min(CONCURRENCIA_MAXIMA, subBotFolders.length)} sub-bots a la vez.`
  ))
  await Promise.all(
    Array.from(
      { length: Math.min(CONCURRENCIA_MAXIMA, subBotFolders.length) },
      () => trabajador()
    )
  )
  console.log(chalk.cyan(
    `\nRevisión terminada: ${conectados} reconectados, ${omitidos} ya activos, ` +
    `${pendientes} en reconexión automática y ${fallidos} fallidos.`
  ))
  return {
    total: sesionesSubBot.length,
    omitidos,
    conectados,
    pendientes,
    fallidos,
    requierenVincular
  }
  })()

  try {
    return await reconexionSubBotsPromise
  } finally {
    reconexionSubBotsPromise = null
  }
}


const originalConnectionUpdate = connectionUpdate
connectionUpdate = async function(update) {
  await originalConnectionUpdate.call(this, update)
  
 
  // Los sub-bots solo se reconectan con el principal YA vinculado: durante el
  // emparejamiento (cuando pides el código de 8 dígitos) no deben arrancar.
  const principalVinculado = Boolean(global.conn?.authState?.creds?.registered)
  if (!isManagedPrimary && update.connection === 'open' && principalVinculado && !global.subBotsReconnected) {
    global.subBotsReconnected = true
    console.log(chalk.cyan('\nBot principal vinculado, iniciando reconexión de sub-bots...'))
    setTimeout(() => {
      global.reconnectSubBots().catch(console.error)
    }, 5000)
  }
}


if (!isSubbotWorker && !isManagedPrimary) setTimeout(() => {
  if (global.subBotsReconnected) return
  if (global.conn?.authState?.creds?.registered) {
    global.subBotsReconnected = true
    console.log(chalk.cyan('\nIniciando reconexión automática de sub-bots..'))
    global.reconnectSubBots().catch(console.error)
  }
}, 10000)

if (!isSubbotWorker && !isManagedPrimary) setInterval(() => {
  if (!global.conn?.authState?.creds?.registered) return
  global.reconnectSubBots().catch((error) => {
    console.error('[supervisor sub-bots] Error revisando sesiones:', error?.message || error)
  })
}, 60_000).unref?.()

// Archivado periódico de sesiones rechazadas desde el principal, por si alguna
// quedó sin worker asignado que la procese.
if (!isSubbotWorker) {
  const serbotDirSweep = resolve(__dirname, global.bot || 'Serbot')
  const barrerReenlaces = () => {
    try {
      purgarReenlacesPendientes(serbotDirSweep)
    } catch (error) {
      console.error('[reenlace] No se pudo archivar sesiones:', error?.message || error)
    }
  }
  setTimeout(barrerReenlaces, 20_000).unref?.()
  setInterval(barrerReenlaces, 60_000).unref?.()
}

const publicationTimers = new Map()
const publicationQueue = new Map()
