import os from 'node:os'
import { startWebPanel } from './server.js'
import { createRpcClient } from './ipc.js'
import { MainBotError } from './main-bot.js'
import { PairingError } from './pairing.js'

// Este proceso no carga main.js, sockets de WhatsApp ni la base del bot.
try { os.setPriority(10) } catch {}
const rpc = createRpcClient(process)
let handle
let maintenance
let starting = false
let snapshot = { available: false, linked: false, connected: false }
const call = async (method, ...args) => {
  try { return await rpc.call(method, ...args) } catch (error) {
    if (error.remoteType === 'PairingError') throw new PairingError(error.code, error.message)
    if (error.remoteType === 'MainBotError') throw new MainBotError(error.code, error.message)
    throw error
  }
}
const runtime = {
  main: {
    estadoPrincipal: () => snapshot,
    solicitarCodigoPrincipal: (phone) => call('main.code', phone),
    desvincularPrincipal: () => call('main.unlink'),
    relinkPrincipal: (phone) => call('main.relink', phone),
    programarReinicioPrincipal: () => call('main.restart'),
  },
  sessions: {
    reconectarSesion: (_root, phone) => call('session.reconnect', phone),
    eliminarSesion: (_root, phone) => call('session.delete', phone),
  },
  antipvDe: (phone) => call('antipv.get', phone),
  establecerAntipvPanel: (phone, value) => call('antipv.set', phone, value),
  pairing: {
    iniciar: (options) => call('pairing.start', options),
    estado: (...args) => call('pairing.state', ...args),
    cancelar: (...args) => call('pairing.cancel', ...args),
    regenerar: (...args) => call('pairing.regenerate', ...args),
    cerrar: async () => {}, // El HTTP no es dueño de los sockets ni sus intentos.
  },
}
global.recargarEnCaliente = (options) => call('runtime.reload', options)
global.pedirRecargaWorkers = (plugins) => call('runtime.reloadWorkers', plugins)
global.reiniciarPanelWeb = () => shutdown()

async function shutdown() {
  clearInterval(maintenance)
  rpc.close()
  await handle?.close().catch(() => {})
  process.exit(0)
}
process.on('message', async (message) => {
  if (message?.type === 'pain-panel-state') {
    snapshot = message.state
    global.webPanelPreview = message.preview
    global.namebot = message.preview?.namebot || 'PAIN BOT'
  }
  if (message?.type === 'pain-panel-stop') return shutdown()
  if (message?.type !== 'pain-panel-start' || starting) return
  starting = true
  try {
    handle = await startWebPanel(message.config, runtime)
    if (!handle) throw new Error('El panel no pudo abrir el puerto.')
    maintenance = setInterval(async () => {
      try {
        await handle.store.limpiarSesionesExpiradas()
        await handle.store.limpiarTokensCorreo(Date.now() - 7 * 24 * 60 * 60 * 1000)
      } catch (error) { console.warn('[webpanel] No se pudo ejecutar la limpieza:', error?.message) }
    }, 10 * 60 * 1000)
    maintenance.unref?.()
    process.send?.({ type: 'pain-panel-ready', port: handle.server.address().port })
  } catch (error) {
    console.error('[webpanel-worker]', error?.message || error)
    process.exit(1)
  }
})
process.once('disconnect', shutdown)
process.once('SIGTERM', shutdown)
process.once('SIGINT', shutdown)
