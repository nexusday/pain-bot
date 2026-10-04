import './lib/sesion-log.js'

process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '1'

process.on('unhandledRejection', (reason) => {
  const msg = reason?.message || String(reason || '')
  if (msg.includes('sharp') || msg.includes('android-arm64')) {
    console.error('[sharp] rechazo controlado (imagen):', msg.split('\n')[0])
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
import {
  ARCHIVO_REENLACE_PENDIENTE,
  limpiarCredencialesSubBot,
  sesionRequiereVincular,
  vinculacionEnCurso
} from './lib/subbot-recovery.js'
import { initViewOnceAntiListener } from './lib/viewOnce.js'
import { Low } from 'lowdb'
import { ArchivoSqliteCompartido } from './lib/db-sqlite.js'
import { removeSubbotWorkerStatus, writeSubbotWorkerStatus } from './lib/subbot-status.js'
import { confirmSessionLease } from './lib/process-isolation.js'
import lodash from 'lodash' 
import readline from 'readline'
import NodeCache from 'node-cache'
import qrcode from 'qrcode-terminal'
import { EventEmitter } from 'node:events'
import os from 'node:os'

const { proto } = (await import('@whiskeysockets/baileys')).default
const {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  makeCacheableSignalKeyStore,
} = await import('@whiskeysockets/baileys')

const PORT = process.env.PORT || process.env.SERVER_PORT || 3000

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

await global.loadDatabase()

const isSubbotWorker = process.env.PAIN_ROLE === 'subbot'
const isManagedPrimary = process.env.PAIN_ROLE === 'primary'
global.processRole = isSubbotWorker ? 'subbot' : 'primary'
// Los sub-bots no deben quitarle CPU al bot principal.
if (isSubbotWorker) {
  try { os.setPriority(10) } catch {}
}

if (isSubbotWorker || isManagedPrimary) {
  const syncDatabase = setInterval(() => {
    global.db.adapter.refresh(global.db.data).catch((error) => {
      console.error('[db] No se pudo actualizar la vista de otro proceso:', error?.message || error)
    })
  }, 5000)
  syncDatabase.unref?.()
}
global.authFile = 'sessions'
let state = null
let saveCreds = async () => {}
let connectionOptions = null
let conn

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
  const cacheReintentoPrincipal = new NodeCache({ stdTTL: 90, checkperiod: 120, useClones: false, maxKeys: 300 })

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

    let loginMethod = await question(
      chalk.green(
        '¿Cómo deseas iniciar sesión?\nEscribe "qr" para escanear el código QR o "code" para usar un código de 8 dígitos:\n'
      )
    )

    loginMethod = loginMethod.toLowerCase().trim()

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

  await handleLogin()
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
    // Guardado periódico espaciado: serializar la DB congela el event loop,
    // así que por defecto es cada 3 min (ajustable con PAIN_DB_SAVE_MS).
    const intervaloGuardado = Math.max(
      Number.parseInt(process.env.PAIN_DB_SAVE_MS, 10) || 180_000,
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

async function connectionUpdate(update) {
  const sock = this?.ev ? this : conn
  const { connection, lastDisconnect, isNewLogin } = update
  global.stopped = connection
  if (isNewLogin) sock.isInit = true

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
  global.conn.credsUpdate = saveCreds.bind(global.conn, true)

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
      return modulo.handler.call(sub, chatUpdate)
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
    if (filename in global.plugins) {
      if (existsSync(dir)) conn.logger.info(`Updated plugin - '${filename}'`)
      else {
        conn.logger.warn(`Deleted plugin - '${filename}'`)
        delete global.plugins[filename]
        global.pluginsEpoch = (global.pluginsEpoch || 0) + 1
        return
      }
    } else conn.logger.info(`New plugin - '${filename}'`)

    const err = syntaxerror(readFileSync(dir), filename, {
      sourceType: 'module',
      allowAwaitOutsideFunction: true,
    })
    if (err) conn.logger.error(`Syntax error while loading '${filename}':\n${format(err)}`)
    else {
      try {
        const module = await import(`${global.__filename(dir)}?update=${Date.now()}`)
        global.plugins[filename] = normalizePlugin(module.default || module)
      } catch (e) {
        conn.logger.error(`Error requiring plugin '${filename}':\n${format(e)}`)
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
      await filesInitEnCaliente()
      await global.reloadHandler(false)
      console.log(chalk.cyan(`Updated code - '${nombre}'`))
    } catch (e) {
      console.error('No se pudo recargar el código:', e?.message || e)
    }
  }, 400)
}

async function filesInitEnCaliente() {
  for (const filename of readdirSync(pluginFolder).filter(pluginFilter)) {
    const dir = global.__filename(join(pluginFolder, filename), true)
    if (!existsSync(dir)) {
      delete global.plugins[filename]
      continue
    }
    try {
      const module = await import(`${global.__filename(dir)}?update=${Date.now()}`)
      global.plugins[filename] = normalizePlugin(module.default || module)
    } catch (e) {
      conn.logger?.error?.(`Error recargando plugin ${filename}:`, e)
    }
  }
  global.plugins = Object.fromEntries(Object.entries(global.plugins).sort(([a], [b]) => a.localeCompare(b)))
  global.pluginsEpoch = (global.pluginsEpoch || 0) + 1
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
  const sesionesIniciando = new Map()
  const sesionesRetiradas = new Set()
  const iniciarSesion = (folder) => {
    if (sesionesRetiradas.has(folder)) return Promise.resolve('skipped')
    const existing = sesionesIniciando.get(folder)
    if (existing) return existing
    const botPath = join(serbotDir, folder)
    if (existsSync(join(botPath, ARCHIVO_REENLACE_PENDIENTE))) {
      try {
        limpiarCredencialesSubBot(botPath)
        console.warn(`Worker subbot: se omite ${folder}, requiere volver a vincular.`)
      } catch (error) {
        console.error(`Worker subbot: no se pudieron limpiar las credenciales de ${folder}:`, error?.message || error)
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
    writeSubbotWorkerStatus(__dirname, workerId, sessions.map((folder) => {
      const socket = socketsBySessionPath.get(join(serbotDir, folder))
      const readyState = socket?.ws?.socket?.readyState ?? socket?.ws?.readyState
      return {
        folder,
        number: socket?.phoneNumber || socket?.botNumber ||
          socket?.user?.jid || socket?.user?.id || folder,
        name: socket?.user?.name || socket?.authState?.creds?.me?.name || '',
        connected: Boolean(
          (socket?.user?.jid || socket?.user?.id) &&
          (socket?.ws?.isOpen === true || readyState === ws.OPEN)
        ),
        requiresRelink: existsSync(join(serbotDir, folder, '.needs-relink')),
      }
    }))
  }
  publishWorkerStatus()
  workerStatusInterval = setInterval(() => {
    try {
      publishWorkerStatus()
    } catch (error) {
      console.error(`Worker ${workerId}: no se pudo publicar el estado de sus sesiones:`, error?.message || error)
    }
  }, 10_000)
  workerStatusInterval.unref?.()
  process.on('message', async (message) => {
    if (message?.type === 'add-sessions' && Array.isArray(message.sessions)) {
      const added = [...new Set(message.sessions)].filter(folder =>
        typeof folder === 'string' && /^[a-zA-Z0-9_-]+$/.test(folder)
      )
      for (const folder of added) {
        sesionesRetiradas.delete(folder)
        if (!sessions.includes(folder)) sessions.push(folder)
      }
      await Promise.all(added.map(iniciarSesion))
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
  const batchSize = 1
  const retrasoInicial = Number.parseInt(process.env.PAIN_START_DELAY_MS, 10) || 0
  if (retrasoInicial > 0) await new Promise(resolve => setTimeout(resolve, retrasoInicial))
  const initialSessions = [...sessions]
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
      await new Promise(resolve => setTimeout(resolve, 3000))
    }
  }
  console.log(
    `Worker ${workerId} inició ${started}/${sessions.length} sesión(es); ` +
    `${skipped} omitida(s), ${failed} con error.`
  )
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
  global.db?.adapter?.close?.().catch((error) => {
    console.error('[db] No se pudieron cerrar las conexiones SQLite:', error?.message || error)
  })
  setTimeout(() => process.exit(0), 1500).unref?.()
}

process.once('SIGINT', () => cerrarConexionesDelProceso('SIGINT'))
process.once('SIGTERM', () => cerrarConexionesDelProceso('SIGTERM'))
process.on('message', (message) => {
  if (message?.type === 'shutdown') cerrarConexionesDelProceso('shutdown')
})


let reconexionSubBotsPromise = null

global.reconnectSubBots = async function() {
  if (isSubbotWorker || isManagedPrimary) {
    return { total: 0, omitidos: 0, conectados: 0, pendientes: 0, fallidos: 0 }
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
  const requierenVincular = sesionesSubBot.filter(folder =>
    sesionRequiereVincular(join(serbotDir, folder))
  ).length
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
  
 
  if (!isManagedPrimary && update.connection === 'open' && !global.subBotsReconnected) {
    global.subBotsReconnected = true
    console.log(chalk.cyan('\nBot principal conectado, iniciando reconexión de sub-bots...'))
    setTimeout(() => {
      global.reconnectSubBots().catch(console.error)
    }, 5000)
  }
}


if (!isSubbotWorker && !isManagedPrimary) setTimeout(() => {
  if (global.subBotsReconnected) return
  if (global.conn && global.conn.user) {
    global.subBotsReconnected = true
    console.log(chalk.cyan('\nIniciando reconexión automática de sub-bots..'))
    global.reconnectSubBots().catch(console.error)
  }
}, 10000)

if (!isSubbotWorker && !isManagedPrimary) setInterval(() => {
  if (!global.conn?.user) return
  global.reconnectSubBots().catch((error) => {
    console.error('[supervisor sub-bots] Error revisando sesiones:', error?.message || error)
  })
}, 60_000).unref?.()

const publicationTimers = new Map()
const publicationQueue = new Map()
