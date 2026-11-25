import './lib/crash-guard.js'
import { esErrorDeRedBenigno, resumenError } from './lib/network-errors.js'
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
  if (esErrorDeRedBenigno(reason)) return
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
import { startDiskHygiene } from './lib/disk-hygiene.js'
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
import { removeSubbotWorkerStatus, writeSubbotWorkerStatusAsync } from './lib/subbot-status.js'
import {
  iniciarMetricasWorker,
  obtenerActividadSocket,
  persistirMetrica,
  registrarMetricasWorker,
} from './lib/worker-metrics.js'
import { ordenarSesionesPorPrioridad } from './lib/subbot-priority.js'
import { snapshotSesiones, resumenSesiones, obtenerSesion } from './lib/session-registry.js'
import { ejecutarEnContextoBot } from './lib/premium.js'
import lodash from 'lodash' 
import readline from 'readline'
import NodeCache from 'node-cache'
import qrcode from 'qrcode-terminal'
import { EventEmitter } from 'node:events'
import { acquireSingleInstance } from './lib/single-instance.js'

const { proto } = (await import('@whiskeysockets/baileys')).default
const {
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
} = await import('@whiskeysockets/baileys')
import { useMemoryAuthState, flushAuthStores, estadisticasAuthStores, olvidarAuthStore } from './lib/auth-store.js'

const PORT = process.env.PORT || process.env.SERVER_PORT || 3000
const ROL_PAIN = process.env.PAIN_ROLE || ''
// El supervisor ya garantiza una única instancia del bot. El candado solo se
// adquiere en arranque manual (sin supervisor), donde de verdad hace falta.
let liberarInstanciaPrincipal = null
if (!ROL_PAIN) {
  try {
    liberarInstanciaPrincipal = acquireSingleInstance(path.resolve('storage'), 'primary')
  } catch (error) {
    console.error(`[primary] ${error.message}`)
    process.exit(1)
  }
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
    singleWriter: true,
    // El refresh por comando del handler queda limitado a esta frecuencia;
    // la vista se mantiene fresca con el sync de fondo cada 5s.
    refreshMinIntervalMs: Number.parseInt(process.env.PAIN_DB_REFRESH_MS, 10) || 5000,
  }
))

global.DATABASE = global.db
// El adaptador guarda solo lo que cambió. Estos atajos permiten a los plugins
// pedir un guardado diferido (sin bloquear la respuesta) en vez de esperar a
// que termine un volcado completo.
global.db.flushSoon = () => global.db.adapter?.flushSoon?.() ?? Promise.resolve()
global.db.writeCompleto = () => global.db.adapter?.writeCompleto?.(global.db.data) ?? global.db.write()
global.db.markDirty = (coleccion, id) => global.db.adapter?.marcarEntidad?.(coleccion, id)
global.db.estadisticasPersistencia = () => global.db.adapter?.estadisticas ?? null
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
  global.db.adapter?.vincularDatos?.(global.db.data)
}

const isSubbotWorker = false
const isManagedPrimary = true
// Un solo proceso: plugins una vez y todos los sub-bots en el mismo event loop.
// Las ramas del supervisor clásico (`PAIN_SINGLE_PROCESS=0`) se eliminaron.
const isSingleBotProcess = true
global.__painSingleProcess = true
global.processRole = 'primary'
// Los sub-bots no deben quitarle CPU al bot principal.
// (En el proceso único todos comparten prioridad; se conserva por si se
// reutiliza el módulo en un futuro modo por carriles.)

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
  // En proceso unico no hay otra instancia escribiendo la base: refrescar
  // cada 15 s solo anade latencia a los comandos.
  if (!isSingleBotProcess) {
    const intervaloRefresh = Number.parseInt(process.env.PAIN_DB_REFRESH_MS, 10) ||
      (isSingleBotProcess ? 15000 : isSubbotWorker ? 8000 : 5000)
    const syncDatabase = setInterval(() => {
      global.db.adapter.refresh(global.db.data).catch((error) => {
        console.error('[db] No se pudo actualizar la vista de otro proceso:', error?.message || error)
      })
    }, intervaloRefresh)
    syncDatabase.unref?.()
  }
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
      await olvidarAuthStore(global.authFile).catch(() => {})
    } catch {}
    return
  }
  return saveCreds(...args)
}

let workerStatusInterval = null
if (!isSubbotWorker) {
  const authState = await useMemoryAuthState(global.authFile)
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
    getMessageSocket: () => global.conn,
    version,
    logger,
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: state.keys,
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
        const inicioGuardado = Date.now()
        await global.db.write()
        const demoraGuardado = Date.now() - inicioGuardado
        if (demoraGuardado > 750) {
          console.warn(`[db] guardado lento: ${demoraGuardado} ms`)
        }
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
    // Guardado periódico: el adaptador solo escribe lo que cambió, así que un
    // volcado cada minuto es barato. El escaneo completo de seguridad lo hace
    // el propio adaptador cada 15 min (PAIN_DB_FULL_SCAN_MS).
    const intervaloGuardado = Math.max(
      Number.parseInt(
        isSingleBotProcess
          ? (process.env.PAIN_SINGLE_DB_SAVE_MS || '60000')
          : process.env.PAIN_DB_SAVE_MS,
        10
      ) || (isSingleBotProcess ? 60_000 : 60_000),
      30_000
    )
    // Commit ligero: guarda los cambios pequeños (modos, ajustes) sin esperar
    // al volcado periódico ni bloquear ninguna respuesta.
    const intervaloCommit = Math.min(
      Math.max(Number.parseInt(process.env.PAIN_DB_COMMIT_MS, 10) || 5000, 1000),
      intervaloGuardado
    )
    const commit = setInterval(() => {
      if (escribiendoDb || !global.db.data) return
      void global.db.flushSoon?.()
    }, intervaloCommit)
    commit.unref?.()
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

if (!isSubbotWorker) startTmpCleanupInterval({ verbose: true, intervalMs: 2 * 60_000 })
if (!isSubbotWorker) startDiskHygiene()

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
// Higiene de memoria del principal cada 60s (en modo único la hace el gestor
// de sub-bots, que ya recorre todos los sockets).
if (!isSubbotWorker && !isSingleBotProcess) {
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
      try {
        // Cada mensaje se atiende dentro del contexto de SU sub-bot: la moneda,
        // el canal y los textos del menú premium no se mezclan entre sub-bots
        // que comparten este proceso.
        return await ejecutarEnContextoBot(sub, () => modulo.handler.call(sub, chatUpdate))
      } catch (error) {
        console.error('[subbot] error procesando mensaje:', error?.message || error)
      }
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
  await olvidarAuthStore(global.authFile).catch(() => {})

  const authState = await useMemoryAuthState(global.authFile)
  state = authState.state
  saveCreds = authState.saveCreds

  const { version } = await fetchLatestBaileysVersion()
  connectionOptions = conSocketEstable({
    getMessageSocket: () => global.conn,
    version,
    logger,
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: state.keys,
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
 * Recarga en caliente del único proceso (handler + plugins indicados).
 */
global.pedirRecargaWorkers = async function pedirRecargaWorkers(plugins = []) {
  try {
    const resumen = await global.recargarEnCaliente?.({ plugins })
    return { dispatched: 1, workers: 1, resumen, motivo: null }
  } catch (error) {
    console.error('[hot] No se pudo recargar el proceso único:', error?.message || error)
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

// Plugins cuya compilación inicial cuesta segundos (jsdom, internals de
// Baileys). Se registran como stubs y se importan la primera vez que se usan.
const PLUGINS_PEREZOSOS = new Map([
  ['hentai.js', {
    command: ['hentai', 'hent', 'hentaisearch'],
    tags: ['nsfw'],
    help: ['hentai <búsqueda | url>']
  }],
  ['sticker-stickerly.js', {
    command: ['stickerly', 'spack', 'stickly'],
    tags: ['stickers'],
    help: ['stickerly <texto>']
  }]
])

function crearPluginPerezoso(filename, def) {
  const ruta = global.__filename(join(pluginFolder, filename))
  return {
    command: def.command,
    tags: def.tags,
    help: def.help,
    handler: async function (m, extra) {
      const module = await import(ruta)
      const real = module.default || module
      const fn = typeof real === 'function' ? real : real.handler
      if (typeof fn !== 'function') throw new Error(`Plugin ${filename} sin handler`)
      return fn.call(this, m, extra)
    }
  }
}

async function filesInit() {
  const nombres = readdirSync(pluginFolder).filter(pluginFilter)
  // Importar 255 plugins de uno en uno tardaba 40-60 s en el VPS. Los módulos
  // son independientes: se importan en paralelo y se registran al final para
  // conservar el orden de los archivos.
  const concurrencia = Math.min(
    Math.max(Number.parseInt(process.env.PAIN_PLUGIN_IMPORT_CONCURRENCY, 10) || 12, 1),
    16
  )
  const resultados = new Array(nombres.length)
  const cola = nombres.map((filename, indice) => ({ filename, indice }))
  const trabajador = async () => {
    while (cola.length) {
      const { filename, indice } = cola.shift()
      const inicio = Date.now()
      try {
        const definicion = PLUGINS_PEREZOSOS.get(filename)
        if (definicion) {
          resultados[indice] = crearPluginPerezoso(filename, definicion)
          continue
        }
        const file = global.__filename(join(pluginFolder, filename))
        const module = await import(file)
        resultados[indice] = normalizePlugin(module.default || module)
        const demora = Date.now() - inicio
        if (isSingleBotProcess && demora > 5000) {
          console.log(`[boot] plugin muy lento: ${filename} (${demora} ms)`)
        }
      } catch (e) {
        const log = conn?.logger || global.conn?.logger || console
        log.error?.(`Error cargando plugin ${filename}:`, e)
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrencia, cola.length) }, trabajador)
  )
  for (let indice = 0; indice < nombres.length; indice++) {
    if (resultados[indice]) global.plugins[nombres[indice]] = resultados[indice]
  }
}

/**
 * Carga de plugins. En el proceso único no hay nada que serializar: se
 * importan en paralelo con el límite de `filesInit`.
 */
async function cargarPluginsConTurno() {
  await filesInit()
}

function finalizarCargaPlugins() {
  global.pluginsEpoch = (global.pluginsEpoch || 0) + 1
  try {
    const desde = Number(global.__painBootAt) || Date.now()
    console.log(
      `[boot] ${process.env.PAIN_ROLE || 'primary'} (${process.env.PAIN_WORKER_ID || '-'}) ` +
      `${Object.keys(global.plugins).length} plugins en ${Date.now() - desde} ms`
    )
  } catch {}
}

// En los workers la carga va en segundo plano: las sesiones deben empezar a
// conectar YA. Antes el proceso se pasaba 60-80 s compilando plugins y durante
// ese tiempo ni siquiera intentaba un handshake; con 283 sesiones eso se veía
// como "no reconecta ninguna". El handler espera a que termine antes de
// procesar el primer mensaje.
let promesaPlugins
if (isSubbotWorker) {
  promesaPlugins = cargarPluginsConTurno()
    .then(finalizarCargaPlugins)
    .catch((error) => {
      console.error('[boot] No se pudieron cargar los plugins:', error?.message || error)
    })
} else {
  promesaPlugins = cargarPluginsConTurno().then(finalizarCargaPlugins)
}
global.__painPluginsListos = promesaPlugins
if (!isSubbotWorker && !isSingleBotProcess) await promesaPlugins

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
  global.conns = []
  // Se arranca sin bloquear el resto del arranque (panel, tick de lotería).
  await iniciarGestorSubBots()
}

/** Sesiones listas para conectar (mismo criterio que el supervisor). */
function listarSesionesListas(serbotDir) {
  try {
    if (!existsSync(serbotDir)) return []
    return readdirSync(serbotDir).filter((folder) => {
      if (!/^[a-zA-Z0-9_-]+$/.test(folder)) return false
      try {
        const botPath = join(serbotDir, folder)
        if (!statSync(botPath).isDirectory()) return false
        const rutaCreds = join(botPath, 'creds.json')
        if (!existsSync(rutaCreds)) return false
        // Una carpeta con creds.json pero registered:false es un intento de
        // vinculación inconcluso: no debe ocupar un slot de handshake.
        try {
          const creds = JSON.parse(readFileSync(rutaCreds, 'utf8'))
          if (creds?.registered !== true) return false
        } catch {
          return false
        }
        if (existsSync(join(botPath, ARCHIVO_REENLACE_PENDIENTE))) return false
        return !sesionEnEmparejamiento(botPath)
      } catch {
        return false
      }
    })
  } catch {
    return []
  }
}

async function iniciarGestorSubBots() {
  if (!Array.isArray(global.conns)) global.conns = []
  const serbotModule = await import('./plugins/serbot-serbot.js')
  const serbotDir = resolve(__dirname, global.bot || 'Serbot')
  const sesionesEnDisco = listarSesionesListas(serbotDir)
  try {
    const totalCarpetas = contarSesionesEnDisco(serbotDir).todas.length
    console.log(
      `[subbots] ${sesionesEnDisco.length} sesión(es) con credenciales registradas ` +
      `de ${totalCarpetas} carpeta(s) con creds.json.`
    )
    if (sesionesEnDisco.length < totalCarpetas) {
      console.log(
        `[subbots] ${totalCarpetas - sesionesEnDisco.length} carpeta(s) sin registrar ` +
        '(registered:false) se omiten; requieren volver a vincular desde el panel.'
      )
    }
  } catch {}
  let sessions = [...new Set(sesionesEnDisco)].filter(folder =>
    typeof folder === 'string' && /^[a-zA-Z0-9_-]+$/.test(folder)
  )
  const workerId = 'primary'
  iniciarMetricasWorker()
  const sesionesIniciando = new Map()
  let muestrasMetricas = 0
  const socketDeSesion = (folder) => {
    const botPath = resolve(serbotDir, folder)
    return (global.conns || []).find((item) =>
      item?.pathAYBot && resolve(item.pathAYBot) === botPath
    ) || null
  }
  const sesionAbierta = (folder) => {
    const socket = socketDeSesion(folder)
    if (!socket?.user) return false
    const readyState = socket?.ws?.socket?.readyState ?? socket?.ws?.readyState
    return socket?.ws?.isOpen === true || readyState === ws.OPEN
  }
  const iniciarSesion = (folder) => {
    const existing = sesionesIniciando.get(folder)
    if (existing) return existing
    if (sesionAbierta(folder)) return Promise.resolve('skipped')
    const estado = serbotModule.estadoSesionSubBot?.(join(serbotDir, folder))
    if (estado?.intento || estado?.backoff) return Promise.resolve('skipped')
    const botPath = join(serbotDir, folder)
    if (sesionEnEmparejamiento(botPath)) {
      console.warn(`Subbots: se omite ${folder}, se está vinculando desde el panel web.`)
      return Promise.resolve('skipped')
    }
    if (existsSync(join(botPath, ARCHIVO_REENLACE_PENDIENTE))) {
      // No se archiva ni se borra: se conserva la carpeta para que el panel
      // pueda revincularla. Solo se omite su conexión automática.
      console.warn(`Subbots: ${folder} requiere volver a vincular; se conserva en disco y no se conecta.`)
      return Promise.resolve('skipped')
    }
    if (!existsSync(join(botPath, 'creds.json'))) {
      console.warn(`Subbots: se omite ${folder}, no tiene creds.json.`)
      return Promise.resolve('skipped')
    }
    try {
      const creds = JSON.parse(readFileSync(join(botPath, 'creds.json'), 'utf8'))
      if (creds?.registered !== true) {
        // Vinculación inconclusa o sesión archivada: no ocupa handshake.
        return Promise.resolve('skipped')
      }
    } catch {
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
  let estadoMemoriaCache = { datos: null, at: 0 }
  const publishWorkerStatus = () => {
    const inicioEstado = Date.now()
    const metricas = registrarMetricasWorkerEnseguro()
    muestrasMetricas++
    // Recorrer chats/metadata de cientos de sockets es caro: se hace cada
    // 2 minutos y se reutiliza la última muestra. Las sesiones salen del
    // registro en memoria, sin leer ficheros.
    if (!estadoMemoriaCache.datos || Date.now() - estadoMemoriaCache.at >= 120_000) {
      estadoMemoriaCache = { datos: estadoMemoriaProceso(), at: Date.now() }
    }
    const estado = estadoMemoriaCache.datos
    const msEstado = Date.now() - inicioEstado
    if (metricas && muestrasMetricas > 2) {
      const lag = Number(metricas.lagP99Ms) || 0
      if (lag > 250) {
        console.warn(
          `[salud] event loop lento: p99=${lag}ms, cpu=${metricas.cpuUsoPercent}%, ` +
          `rss=${estado.memoria?.rssMB || '?'} MB`
        )
      }
    }
    const inicioWrite = Date.now()
    writeSubbotWorkerStatusAsync(__dirname, 'primary', snapshotSesiones().map((sesion) => ({
      ...sesion,
      actividad: obtenerActividadSocket(obtenerSesion(sesion.folder)?.conn, { reset: true })
    })), {
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
      metricas,
      resumen: resumenSesiones(),
      persistencia: global.db?.estadisticasPersistencia?.() || null,
      auth: estadisticasAuthStores(),
    }).then(() => {
      const msWrite = Date.now() - inicioWrite
      if (msWrite > 700) {
        console.warn(`[salud] estado en disco lento: ${msWrite} ms`)
      }
    }).catch((error) => {
      console.error('[estado] No se pudo escribir el estado:', error?.message || error)
    })
    if (msEstado > 500) {
      console.warn(`[salud] calcular estado lento: ${msEstado} ms`)
    }
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
  const intervaloEstadoMs = 30_000
  workerStatusInterval = setInterval(() => {
    try {
      publishWorkerStatus()
    } catch (error) {
      console.error(`Worker ${workerId}: no se pudo publicar el estado de sus sesiones:`, error?.message || error)
    }
    // Historial liviano: una línea por minuto en storage/metrics/
    if (ticksEstado % 2 === 1) {
      persistirMetricaEnseguro(workerId, __dirname)
    }
    // Higiene de memoria cada 2 min (4 ticks de 30 s).
    if (++ticksEstado % 4 === 0) {
      import('./lib/mem-hygiene.js').then(({ higieneMemoriaProceso }) => {
        try {
          const inicioHigiene = Date.now()
          higieneMemoriaProceso()
          const msHigiene = Date.now() - inicioHigiene
          if (msHigiene > 500) {
            console.warn(`[salud] higiene de memoria lenta: ${msHigiene} ms`)
          }
        } catch {}
      }).catch(() => {})
      try { purgarReenlacesPendientes(serbotDir) } catch {}
    }
  }, intervaloEstadoMs)
  workerStatusInterval.unref?.()
  const pausaEntreLotesMs = Number.parseInt(process.env.PAIN_START_GAP_MS, 10) || 100
  const concurrenciaArranque = Math.min(
    Math.max(Number.parseInt(process.env.PAIN_START_CONCURRENCY, 10) || 8, 1),
    16
  )
  const initialSessions = ordenarSesionesPorPrioridad(serbotDir, [...sessions])
  const arrancarTodas = async () => {
    const cola = [...initialSessions]
    let iniciadas = 0
    let intentos = 0
    const trabajador = async () => {
      while (cola.length) {
        const folder = cola.shift()
        const resultado = await iniciarSesion(folder)
        intentos++
        if (resultado === 'started') iniciadas++
        if (intentos % 25 === 0) {
          console.log(
            `[subbots] arranque: ${intentos}/${initialSessions.length} intentadas, ` +
            `${iniciadas} socket(s) creados, ${cola.length} pendientes.`
          )
        }
        if (pausaEntreLotesMs > 0) {
          await new Promise((resolver) => setTimeout(resolver, pausaEntreLotesMs))
        }
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(concurrenciaArranque, cola.length) }, trabajador)
    )
    console.log(
      `Subbots (proceso único) iniciaron ${iniciadas}/${initialSessions.length} ` +
      `sesión(es) con concurrencia ${concurrenciaArranque}.`
    )
  }

  const esperarAbierta = async (folder, timeoutMs = 50_000) => {
    const limite = Date.now() + Math.max(5_000, Number(timeoutMs) || 0)
    while (Date.now() < limite) {
      if (sesionAbierta(folder)) return true
      await new Promise((resolver) => setTimeout(resolver, 1000))
    }
    return false
  }

  const reconectarUnaLocal = async (folder) => {
    if (!/^[a-zA-Z0-9_-]+$/.test(String(folder || ''))) {
      return { ok: false, reason: 'invalid' }
    }
    const botPath = join(serbotDir, folder)
    if (sesionEnEmparejamiento(botPath)) return { ok: false, reason: 'pairing' }
    if (!existsSync(join(botPath, 'creds.json'))) return { ok: false, reason: 'no-creds' }
    if (necesitaRevinculacion(serbotDir, folder) || sesionRequiereVincular(botPath)) {
      return { ok: false, reason: 'needs-relink' }
    }
    try {
      const creds = JSON.parse(readFileSync(join(botPath, 'creds.json'), 'utf8'))
      if (creds?.registered !== true) return { ok: false, reason: 'needs-relink' }
    } catch {
      return { ok: false, reason: 'no-creds' }
    }
    if (sesionAbierta(folder)) return { ok: true, already: true }
    const estado = serbotModule.estadoSesionSubBot?.(botPath)
    if (estado?.intento) {
      return { ok: true, already: true, pending: true }
    }
    // /rebot fuerza: retira un socket viejo/colgado y vuelve a empezar.
    try { await serbotModule.retirarSesionDeWorker(botPath, { handoff: false }) } catch {}
    const resultado = await iniciarSesion(folder)
    if (resultado === 'failed' || resultado === 'skipped') {
      return { ok: false, reason: resultado }
    }
    const abierta = await esperarAbierta(folder)
    return { ok: abierta, reason: abierta ? null : 'timeout' }
  }

  let reconexionLocalPromise = null
  const reconectarTodasLocal = async () => {
    if (reconexionLocalPromise) return reconexionLocalPromise
    reconexionLocalPromise = (async () => {
      const lista = ordenarSesionesPorPrioridad(serbotDir, listarSesionesListas(serbotDir))
      const pendientes = []
      let omitidos = 0
      for (const folder of lista) {
        if (sesionAbierta(folder)) { omitidos++; continue }
        const estado = serbotModule.estadoSesionSubBot?.(join(serbotDir, folder))
        if (estado?.intento || estado?.backoff) { omitidos++; continue }
        pendientes.push(folder)
      }
      const cola = [...pendientes]
      let conectados = 0
      const trabajador = async () => {
        while (cola.length) {
          const folder = cola.shift()
          const resultado = await iniciarSesion(folder)
          if (resultado === 'started' && await esperarAbierta(folder, 45_000)) conectados++
        }
      }
      await Promise.all(
        Array.from(
          {
            length: Math.min(
              Math.max(Number(process.env.PAIN_START_CONCURRENCY) || 6, 1),
              12,
              cola.length
            ),
          },
          trabajador
        )
      )
      return {
        total: lista.length,
        omitidos,
        conectados,
        pendientes: Math.max(0, pendientes.length - conectados),
        fallidos: 0,
        requierenVincular: listarRequierenVincular(serbotDir).length,
      }
    })()
    try {
      return await reconexionLocalPromise
    } finally {
      reconexionLocalPromise = null
    }
  }

  global.subBotsReconnected = true
  global.__painReconnectOne = reconectarUnaLocal
  global.__painReconnectAll = reconectarTodasLocal
  // Alta de sesiones vinculadas desde el panel y limpieza de sockets de
  // carpetas que ya no existen. El aviso llega por fs.watch (el panel corre en
  // otro proceso y escribe en Serbot/); el intervalo de 5 min es solo la red
  // de seguridad. Antes se leía y parseaba cada creds.json cada 30 s.
  let arranqueInicialHecho = false
  const nuevasPendientes = []
  let drenandoNuevas = false
  const drenarNuevas = async () => {
    if (drenandoNuevas) return
    drenandoNuevas = true
    try {
      while (nuevasPendientes.length) {
        const folder = nuevasPendientes.shift()
        await iniciarSesion(folder)
        if (pausaEntreLotesMs > 0) {
          await new Promise((resolver) => setTimeout(resolver, pausaEntreLotesMs))
        }
      }
    } finally {
      drenandoNuevas = false
    }
  }
  const escanearSesiones = () => {
    let disco = []
    try { disco = listarSesionesListas(serbotDir) } catch { return }
    const enDisco = new Set(disco)
    for (const folder of disco) {
      if (sessions.includes(folder)) continue
      sessions.push(folder)
      // En el arranque inicial manda `arrancarTodas` para las sesiones ya
      // conocidas; las que aparezcan durante esos 3 s se encolan aquí y se
      // arrancan en cuanto termina, sin oleada.
      nuevasPendientes.push(folder)
    }
    for (const folder of [...sessions]) {
      if (enDisco.has(folder)) continue
      const botPath = join(serbotDir, folder)
      // Una vinculación en curso (panel) no debe cancelarse por el escaneo.
      if (sesionEnEmparejamiento(botPath)) continue
      sessions = sessions.filter((item) => item !== folder)
      void serbotModule.retirarSesionDeWorker(botPath, { handoff: false })
    }
    if (arranqueInicialHecho) void drenarNuevas()
  }
  let escaneoTimer = null
  const agendarEscaneo = () => {
    if (escaneoTimer) return
    escaneoTimer = setTimeout(() => {
      escaneoTimer = null
      escanearSesiones()
    }, 1500)
    escaneoTimer.unref?.()
  }
  escanearSesiones()
  try {
    // Solo el nivel raíz: las carpetas nuevas/borradas. Un watch recursivo
    // emitiría un evento por cada escritura del diario de auth (miles por
    // minuto) y costaría más que el escaneo que sustituye.
    const vigilante = watch(serbotDir, { recursive: false }, (_evento, archivo) => {
      if (!archivo) return agendarEscaneo()
      agendarEscaneo()
    })
    vigilante.on?.('error', () => {})
  } catch {}
  const escaneo = setInterval(escanearSesiones, 300_000)
  escaneo.unref?.()
  // Dar unos segundos al principal para que abra su socket antes de la
  // oleada de sub-bots. El arranque corre en segundo plano.
  const retrasoArranque = Math.max(
    Number.parseInt(process.env.PAIN_SUBBOT_START_DELAY_MS, 10) || 3000,
    0
  )
  setTimeout(() => {
    void arrancarTodas()
      .catch((error) => {
        console.error('[subbots] Error en el arranque:', error?.message || error)
      })
      .finally(() => {
        arranqueInicialHecho = true
        void drenarNuevas()
      })
  }, retrasoArranque).unref?.()
  try { purgarReenlacesPendientes(serbotDir) } catch {}
}

function cerrarConexionesDelProceso(signal) {
  console.log(`Proceso ${process.env.PAIN_WORKER_ID || 'primary'} cerrando por ${signal}.`)
  if (isSubbotWorker || isSingleBotProcess) {
    if (workerStatusInterval) clearInterval(workerStatusInterval)
    removeSubbotWorkerStatus(
      __dirname,
      isSubbotWorker ? (process.env.PAIN_WORKER_ID || 'subbot') : 'primary'
    )
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
  const salir = () => {
    try { liberarInstanciaPrincipal?.() } catch {}
    process.exit(0)
  }
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
        flushAuthStores({ cerrar: true }),
        new Promise((resolve) => setTimeout(resolve, 4000)),
      ])
    } catch (error) {
      console.error('[auth] No se pudieron volcar las sesiones:', error?.message || error)
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
let ultimoAvisoReenlace = 0
function purgarReenlacesPendientes(serbotDir) {
  // Por defecto NUNCA se borra/archiva una carpeta marcada: se conserva para
  // que el panel pueda revincularla. El archivado automático era lo que hacía
  // desaparecer sesiones cuando WhatsApp devolvía 401 en masa.
  if (process.env.PAIN_AUTO_ARCHIVE_RELINK !== '1') {
    try {
      const pendientes = listarRequierenVincular(serbotDir)
      if (pendientes.length && Date.now() - ultimoAvisoReenlace > 60_000) {
        ultimoAvisoReenlace = Date.now()
        console.warn(
          `[reenlace] ${pendientes.length} sesión(es) requieren volver a vincular; ` +
          'se conservan en disco y no se conectan.'
        )
      }
    } catch {}
    return
  }
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

/** Reconciliación manual pedida desde el panel o por /rebot. */
global.reconnectSubBotsManaged = async function() {
  if (typeof global.__painReconnectAll !== 'function') {
    return { total: 0, omitidos: 0, conectados: 0, pendientes: 0, fallidos: 0, requierenVincular: 0 }
  }
  return global.__painReconnectAll()
}

global.reconnectSubBotOneManaged = async function(folder) {
  if (typeof global.__painReconnectOne !== 'function') return { ok: false, reason: 'no-manager' }
  return global.__painReconnectOne(String(folder || '').replace(/\D/g, ''))
}

global.reconnectSubBots = async function() {
  return global.reconnectSubBotsManaged()
}

const publicationTimers = new Map()
const publicationQueue = new Map()
