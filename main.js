process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '1'

import './config.js'
import { createRequire } from 'module'
import path, { join } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { platform } from 'process'
import * as ws from 'ws'
import { readdirSync, statSync, unlinkSync, existsSync, readFileSync, watch, mkdirSync } from 'fs'
import yargs from 'yargs'
import chalk from 'chalk'
import syntaxerror from 'syntax-error'
import { tmpdir } from 'os'
import { format } from 'util'
import pino from 'pino'
import { Boom } from '@hapi/boom'
import { makeWASocket, protoType, serialize } from './lib/simple.js'
import { Low, JSONFile } from 'lowdb'
import lodash from 'lodash' 
import readline from 'readline'
import NodeCache from 'node-cache'
import qrcode from 'qrcode-terminal'

const { proto } = (await import('@whiskeysockets/baileys')).default
const {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  makeCacheableSignalKeyStore,
  jidNormalizedUser,
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
  const tmpDir = join(global.__dirname(import.meta.url), './tmp')
  if (!existsSync(tmpDir)) {
    mkdirSync(tmpDir, { recursive: true })
  }
  return tmpDir
}


function ensureTmpDir() {
  const tmpDir = join(global.__dirname(import.meta.url), './tmp')
  if (!existsSync(tmpDir)) {
    mkdirSync(tmpDir, { recursive: true })
    console.log(chalk.green('Carpeta TMP creado exitosamente'))
  }
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


ensureTmpDir()

global.opts = new Object(yargs(process.argv.slice(2)).exitProcess(false).parse())
global.prefix = new RegExp(
  '^[' +
    (opts['prefix'] || '‎z/#$%.\\-').replace(/[|\\{}()[\]^$+*?.\-\^]/g, '\\$&') +
    ']'
)

global.db = new Low(new JSONFile(`storage/databases/database.json`))

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
  await global.db.read().catch(console.error)
  global.db.READ = null
  global.db.data = {
    users: {},
    chats: {},
    stats: {},
    msgs: {},
    sticker: {},
    settings: {},
    botGroups: {},
    antiImg: {},
    bienvenidas: {},
    publicaciones: {},
    ...(global.db.data || {}),
  }
  global.db.chain = lodash.chain(global.db.data) 
}

global.authFile = `sessions`
const { state, saveCreds } = await useMultiFileAuthState(global.authFile)

const { version } = await fetchLatestBaileysVersion()

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const question = (texto) => new Promise((resolver) => rl.question(texto, resolver))

const logger = pino({
  timestamp: () => `,"time":"${new Date().toJSON()}"`,
}).child({ class: 'client' })
logger.level = 'fatal'

const connectionOptions = {
  version: version,
  logger,
  printQRInTerminal: false,
  auth: {
    creds: state.creds,
    keys: makeCacheableSignalKeyStore(state.keys, logger),
  },
  browser: Browsers.ubuntu('Chrome'),
  markOnlineOnclientect: true,
  generateHighQualityLinkPreview: true,
  syncFullHistory: true,
  retryRequestDelayMs: 10,
  transactionOpts: { maxCommitRetries: 10, delayBetweenTriesMs: 10 },
  maxMsgRetryCount: 15,
  appStateMacVerification: {
    patch: false,
    snapshot: false,
  },
  getMessage: async (key) => {
    const jid = jidNormalizedUser(key.remoteJid)
    const msg = await store.loadMessage(jid, key.id)
    return msg?.message || ''
  },
}

global.conn = makeWASocket(connectionOptions)


global.mainBotJid = null

async function handleLogin() {
  if (conn.authState.creds.registered) {
    console.log(chalk.green('Sesión ya está registrada.'))
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
    phoneNumber = phoneNumber.replace(/\D/g, '')

    
    if (phoneNumber.startsWith('52') && phoneNumber.length === 12) {
      phoneNumber = `521${phoneNumber.slice(2)}`
    } else if (phoneNumber.startsWith('52')) {
      phoneNumber = `521${phoneNumber.slice(2)}`
    } else if (phoneNumber.startsWith('0')) {
      phoneNumber = phoneNumber.replace(/^0/, '')
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
      } catch (e) {
        console.log(chalk.red('Error al solicitar código de emparejamiento:'), e.message || e)
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
}

await handleLogin()

conn.isInit = false
conn.well = false

if (!opts['test']) {
  if (global.db) {
    setInterval(async () => {
      if (global.db.data) await global.db.write()
      if (opts['autocleartmp']) {
        const tmp = [tmpdir(), 'tmp', 'serbot']
        tmp.forEach((filename) => {
          spawn('find', [filename, '-amin', '3', '-type', 'f', '-delete'])
        })
      }
    }, 30 * 1000)
  }
}

function clearTmp() {
  const tmp = [join(global.__dirname(import.meta.url), './tmp')]
  let cleanedCount = 0
  tmp.forEach((dirname) => {
  
    if (!existsSync(dirname)) {
      mkdirSync(dirname, { recursive: true })
      return 
    }
    try {
      const files = readdirSync(dirname)
      files.forEach((file) => {
        const filePath = join(dirname, file)
        try {
          const stats = statSync(filePath)
          if (stats.isFile()) {
            unlinkSync(filePath)
            cleanedCount++
          }
        } catch (error) {
          
          console.error('Error processing tmp file:', error.message)
        }
      })
    } catch (error) {
      
      console.error('Error reading tmp directory:', error.message)
    }
  })
  return cleanedCount
}

setInterval(() => {
  if (global.stopped === 'close' || !conn || !conn.user) return
  const cleanedCount = clearTmp()
  console.log(chalk.gray(`Limpieza TMP ejecutada - ${cleanedCount} archivo(s) eliminado(s).`))
}, 50000)

async function connectionUpdate(update) {
  const { connection, lastDisconnect, isNewLogin } = update
  global.stopped = connection
  if (isNewLogin) conn.isInit = true
  const code =
    lastDisconnect?.error?.output?.statusCode ||
    lastDisconnect?.error?.output?.payload?.statusCode
  if (code && code !== DisconnectReason.loggedOut && conn?.ws.socket == null) {
    await global.reloadHandler(true).catch(console.error)
    global.timestamp.connect = new Date()
  }
  if (global.db.data == null) await loadDatabase()
  if (connection === 'open') {
    console.log(chalk.yellow('Conectado correctamente.'))
    global.mainBotJid = conn.user?.jid?.split('@')[0] || conn.user?.id?.split('@')[0]
    if (!conn.startTime) {
      conn.startTime = Date.now()
    }
  }
  const reason = new Boom(lastDisconnect?.error)?.output?.statusCode
  if (reason === 405) {
    if (existsSync('./sessions/creds.json')) unlinkSync('./sessions/creds.json')
    console.log(
      chalk.bold.redBright(
        `Conexión reemplazada, por favor espera un momento. Reiniciando...\nSi aparecen errores, vuelve a iniciar con: npm start`
      )
    )
    process.send('reset')
  }
  if (connection === 'close') {
    switch (reason) {
      case DisconnectReason.badSession:
        conn.logger.error(`Sesión incorrecta, elimina la carpeta ${global.authFile} y escanea nuevamente.`)
        break
      case DisconnectReason.connectionClosed:
      case DisconnectReason.connectionLost:
      case DisconnectReason.timedOut:
        conn.logger.warn(`Conexión perdida o cerrada, reconectando...`)
        await global.reloadHandler(true).catch(console.error)
        break
      case DisconnectReason.connectionReplaced:
        conn.logger.error(
          `Conexión reemplazada, se abrió otra sesión. Cierra esta sesión primero.`
        )
        break
      case DisconnectReason.loggedOut:
        conn.logger.error(`Sesión cerrada, elimina la carpeta ${global.authFile} y escanea nuevamente.`)
        break
      case DisconnectReason.restartRequired:
        conn.logger.info(`Reinicio necesario, reinicia el servidor si hay problemas.`)
        await global.reloadHandler(true).catch(console.error)
        break
      default:
        conn.logger.warn(`Desconexión desconocida: ${reason || ''} - Estado: ${connection || ''}`)
        await global.reloadHandler(true).catch(console.error)
        break
    }
  }
}

process.on('uncaughtException', console.error)

let isInit = true
let handler = await import('./handler.js')
global.reloadHandler = async function (restartConn) {
  try {
    const Handler = await import(`./handler.js?update=${Date.now()}`).catch(console.error)
    if (Handler && Object.keys(Handler).length) handler = Handler
  } catch (e) {
    console.error(e)
  }

  if (restartConn) {
    try {
      if (global.conn.ws) global.conn.ws.close()
    } catch {}
    global.conn.ev.removeAllListeners()
    
    
    const preservedStartTime = global.conn.startTime
    
    global.conn = makeWASocket(connectionOptions)
    
   
    if (preservedStartTime) {
      global.conn.startTime = preservedStartTime
    }
    
    isInit = true
  }

  if (!isInit) {
    conn.ev.off('messages.upsert', conn.handler)
    conn.ev.off('connection.update', conn.connectionUpdate)
    conn.ev.off('creds.update', conn.credsUpdate)
  }

  conn.handler = handler.handler.bind(global.conn)
  conn.connectionUpdate = connectionUpdate.bind(global.conn)
  conn.credsUpdate = saveCreds.bind(global.conn, true)

  conn.ev.on('messages.upsert', conn.handler)
  conn.ev.on('connection.update', conn.connectionUpdate)
  conn.ev.on('creds.update', conn.credsUpdate)

  isInit = false
  return true
}

const pluginFolder = global.__dirname(join(__dirname, './plugins/index'))
const pluginFilter = (filename) => /\.js$/.test(filename)
global.plugins = {}

async function filesInit() {
  for (const filename of readdirSync(pluginFolder).filter(pluginFilter)) {
    try {
      const file = global.__filename(join(pluginFolder, filename))
      const module = await import(file)
      
     
      let plugin = module.default || module
      
     
      if (typeof plugin === 'function') {
       
        plugin = {
          handler: plugin,
          command: plugin.command || [],
          tags: plugin.tags || [],
          help: plugin.help || [],
          disabled: false
        }
      }
      
      
      if (plugin.command && typeof plugin.command === 'string') {
        plugin.command = [plugin.command]
      }
      
      global.plugins[filename] = plugin
      
    } catch (e) {
      conn.logger.error(`Error cargando plugin ${filename}:`, e)
      delete global.plugins[filename]
    }
  }
}
await filesInit()

global.reload = async (_ev, filename) => {
  if (pluginFilter(filename)) {
    const dir = global.__filename(join(pluginFolder, filename), true)
    if (filename in global.plugins) {
      if (existsSync(dir)) conn.logger.info(`Updated plugin - '${filename}'`)
      else {
        conn.logger.warn(`Deleted plugin - '${filename}'`)
        return delete global.plugins[filename]
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
        global.plugins[filename] = module.default || module
      } catch (e) {
        conn.logger.error(`Error requiring plugin '${filename}':\n${format(e)}`)
      } finally {
        global.plugins = Object.fromEntries(Object.entries(global.plugins).sort(([a], [b]) => a.localeCompare(b)))
      }
    }
  }
}
Object.freeze(global.reload)

watch(pluginFolder, global.reload)
await global.reloadHandler()


global.reconnectSubBots = async function() {
  if (!global.conns || !Array.isArray(global.conns)) {
    global.conns = []
  }

  const serbotDir = './Serbot'
  if (!existsSync(serbotDir)) {
    console.log(chalk.yellow('No se encontró la carpeta Serbot'))
    return
  }

  const subBotFolders = readdirSync(serbotDir).filter(folder => {
    const folderPath = join(serbotDir, folder)
    return statSync(folderPath).isDirectory() && existsSync(join(folderPath, 'creds.json'))
  })

  if (subBotFolders.length === 0) {
    console.log(chalk.yellow('No se encontraron sub-bots para reconectar'))
    return
  }

  console.log(chalk.cyan(`\nReconectando ${subBotFolders.length} sub-bots...`))

  for (const folder of subBotFolders) {
    try {
      const botPath = join(serbotDir, folder)
      const credsPath = join(botPath, 'creds.json')
      
      if (!existsSync(credsPath)) {
        console.log(chalk.red(`No se encontró creds.json en ${folder}`))
        continue
      }

     
      const isAlreadyConnected = global.conns.some(conn => 
        conn.user && conn.user.jid && conn.user.jid.includes(folder)
      )

      if (isAlreadyConnected) {
        console.log(chalk.green(`Sub-bot ${folder} ya está conectado`))
        continue
      }

      
      const serbotModule = await import('./plugins/serbot-serbot.js')
      if (serbotModule.AYBot) {
        await serbotModule.AYBot({
          pathAYBot: botPath,
          m: null,
          conn: global.conn,
          args: [],
          usedPrefix: '.',
          command: 'qr',
          fromCommand: false
        })
        console.log(chalk.green(`Sub-bot ${folder} reconectado exitosamente`))
      } else {
        console.log(chalk.red(`No se pudo importar Pain Bot para ${folder}`))
      }

     
      await new Promise(resolve => setTimeout(resolve, 2000))

    } catch (error) {
      console.log(chalk.red(`Error reconectando sub-bot ${folder}:`, error.message))
    }
  }

  console.log(chalk.cyan(`\nProceso de reconexión de sub-bots completado`))
}


const originalConnectionUpdate = connectionUpdate
connectionUpdate = async function(update) {
  await originalConnectionUpdate.call(this, update)
  
 
  if (update.connection === 'open' && !this.subBotsReconnected) {
    this.subBotsReconnected = true
    console.log(chalk.cyan('\nBot principal conectado, iniciando reconexión de sub-bots...'))
    setTimeout(() => {
      global.reloadHandler().then(() => {
        global.reconnectSubBots().catch(console.error)
      })
    }, 5000) 
  }
}


setTimeout(() => {
  if (global.conn && global.conn.user) {
    console.log(chalk.cyan('\nIniciando reconexión automática de sub-bots..'))
    global.reconnectSubBots().catch(console.error)
  }
}, 10000) 

const publicationTimers = new Map()
const publicationQueue = new Map()