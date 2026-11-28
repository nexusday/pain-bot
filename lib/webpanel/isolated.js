import { fork } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { cargarConfigPanel } from './panel-config.js'
import * as main from './main-bot.js'
import { serveRpc } from './ipc.js'
import { carpetaSesionValida, eliminarSesion, reconectarSesion } from './session-ops.js'
import { contarGruposActivos, estadisticasGlobales } from './runtime-stats.js'

/** El HTTP tiene heap, event loop y pool de trabajo separados del bot. */
export async function startIsolatedWebPanel(overrides = {}) {
  const config = cargarConfigPanel(overrides)
  if (!config.enabled) return null
  let current
  let closed = false
  let everReady = false
  let failures = 0
  let startedAt = 0
  let restartTimer
  let runtimeStore
  let pairing
  let pairingInit
  let startingPair = false
  let restarting
  const phone = (value) => {
    const number = String(value || '').replace(/\D/g, '')
    if (!/^\d{6,20}$/.test(number) || !carpetaSesionValida(number)) throw new Error('Sesión inválida.')
    return number
  }
  const getPairing = () => pairingInit ||= (async () => {
    const { PanelStore } = await import('./store.js')
    const { PairingManager } = await import('./pairing.js')
    runtimeStore = await new PanelStore(config.dbFile).init()
    pairing = new PairingManager({ store: runtimeStore, config })
    return pairing
  })()
  const handlers = {
    'main.code': (value) => main.solicitarCodigoPrincipal(phone(value)),
    'main.unlink': () => main.desvincularPrincipal(),
    'main.relink': (value) => main.relinkPrincipal(phone(value)),
    'main.restart': () => main.programarReinicioPrincipal(),
    'session.reconnect': (value) => reconectarSesion(config.root, phone(value)),
    'session.delete': (value) => eliminarSesion(config.root, phone(value)),
    'session.reassign': (value, serverId) => {
      const folder = phone(value)
      if (typeof process.send !== 'function') {
        throw new Error('El supervisor no está disponible para reasignar en caliente.')
      }
      // isolated.js corre dentro del proceso principal, que sí es hijo del
      // supervisor. Antes el mensaje se enviaba desde el worker HTTP y se
      // perdía en el proceso principal.
      process.send({ type: 'reassign-bot', phone: folder, serverId })
      return { ok: true, hot: true }
    },
    'antipv.get': (value) => global.db?.data?.antipv?.[phone(value)] === true,
    'antipv.set': async (value, active) => {
      const number = phone(value)
      if (!global.db?.data) throw new Error('La base del bot no está lista.')
      global.db.data.antipv ||= {}
      global.db.data.antipv[number] = active === true
      await global.db.write?.()
      return true
    },
    'pairing.start': async (options) => {
      const { PairingError } = await import('./pairing.js')
      if (startingPair) throw new PairingError('busy', 'Hay otra vinculación preparando su código. Intenta de nuevo en unos segundos.')
      startingPair = true
      try {
        const manager = await getPairing()
        if (manager.activos.size >= 8) throw new PairingError('busy', 'Hay varias vinculaciones en curso. Intenta de nuevo en unos segundos.')
        return await manager.iniciar(options)
      } finally { startingPair = false }
    },
    'pairing.state': async (...args) => (await getPairing()).estado(...args),
    'pairing.cancel': async (...args) => (await getPairing()).cancelar(...args),
    'pairing.regenerate': async (...args) => {
      const { PairingError } = await import('./pairing.js')
      if (startingPair) throw new PairingError('busy', 'Hay otra vinculación preparando su código. Intenta de nuevo en unos segundos.')
      startingPair = true
      try {
        const manager = await getPairing()
        if (manager.activos.size >= 8) throw new PairingError('busy', 'Hay varias vinculaciones en curso. Intenta de nuevo en unos segundos.')
        return await manager.regenerar(...args)
      } finally { startingPair = false }
    },
    'runtime.reload': (options) => {
      if (typeof global.recargarEnCaliente !== 'function') throw new Error('Recarga no disponible.')
      return global.recargarEnCaliente(options)
    },
    'runtime.reloadWorkers': (plugins) => global.pedirRecargaWorkers?.(plugins) || { dispatched: 0, workers: 0 },
  }
  const sendState = () => {
    if (!current?.child.connected) return
    const actividad = estadisticasGlobales()
    const gruposActivos = contarGruposActivos(global.db?.data)
    // Debe coincidir con el total que usa el menú de WhatsApp (`totalf`):
    // cada plugin documentado como comando cuenta una vez.
    const comandosDisponibles = Object.values(global.plugins || {})
      .filter((plugin) => plugin?.help && plugin?.tags).length
    try {
      current.child.send({
        type: 'pain-panel-state', state: main.estadoPrincipal(),
        preview: {
          namebot: String(global.namebot || 'PAIN BOT'),
          totalPlugins: Object.values(global.plugins || {}).filter((plugin) => plugin?.help && plugin?.tags).length,
          totalCommands: comandosDisponibles,
          activeGroups: gruposActivos,
          topCommands: actividad.topCommands,
          recentCommands: actividad.recentCommands,
          processRamMB: Math.round(process.memoryUsage().rss / 1048576),
        },
      }, () => {})
    } catch {}
  }
  async function spawn() {
    if (closed) return
    const heap = Math.min(1024, Math.max(128, Number.parseInt(process.env.PAIN_WEB_HEAP_MB, 10) || 256))
    const child = fork(fileURLToPath(new URL('./worker.js', import.meta.url)), [], {
      cwd: process.cwd(),
      execArgv: [...process.execArgv.filter((arg) => !/^--(?:max-old-space-size|max-semi-space-size|inspect)/.test(arg)), `--max-old-space-size=${heap}`],
      env: {
        ...process.env, PAIN_ROLE: 'web', UV_THREADPOOL_SIZE: '2',
        // Un fallo HTTP no debe reaplicar un reset solicitado al arrancar el bot.
        PAIN_WEB_ADMIN_RESET: everReady ? '0' : (process.env.PAIN_WEB_ADMIN_RESET || '0'),
      },
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    })
    const slot = { child, intentional: false }
    startedAt = Date.now()
    current = slot
    const stopRpc = serveRpc(child, handlers)
    const ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('El proceso web no respondió al arranque.'))
        child.kill()
      }, 20_000)
      child.on('message', (message) => {
        if (message?.type !== 'pain-panel-ready') return
        clearTimeout(timer)
        config.port = message.port
        everReady = true
        resolve()
      })
      child.once('error', (error) => { clearTimeout(timer); reject(error) })
      child.once('exit', () => { clearTimeout(timer); reject(new Error('El proceso web terminó antes de estar disponible.')) })
    })
    child.once('exit', (code, signal) => {
      stopRpc()
      if (current === slot) current = null
      if (closed || slot.intentional || !everReady) return
      if (Date.now() - startedAt >= 60_000) failures = 0
      const delay = Math.min(30_000, 1000 * 2 ** Math.min(failures++, 5))
      console.warn(`[webpanel] El proceso web terminó (${signal || code}); se reinicia solo en ${delay} ms. El bot sigue en marcha.`)
      restartTimer = setTimeout(() => { spawn().catch((error) => console.error('[webpanel]', error.message)) }, delay)
      restartTimer.unref?.()
    })
    child.send({ type: 'pain-panel-start', config }, () => {})
    sendState()
    await ready
    return true
  }
  async function stopChild() {
    const slot = current
    if (!slot) return
    slot.intentional = true
    await new Promise((resolve) => {
      const timer = setTimeout(() => { slot.child.kill('SIGKILL') }, 2000)
      slot.child.once('exit', () => { clearTimeout(timer); resolve() })
      try { slot.child.send({ type: 'pain-panel-stop' }, () => {}) } catch { slot.child.kill() }
    })
  }
  const stateTimer = setInterval(sendState, 10_000)
  stateTimer.unref?.()
  const handle = {
    isolated: true,
    config,
    get pid() { return current?.child.pid || null },
    restart() {
      return restarting ||= (async () => {
        clearTimeout(restartTimer)
        await stopChild()
        return spawn()
      })().finally(() => { restarting = null })
    },
    async close() {
      closed = true
      clearTimeout(restartTimer)
      clearInterval(stateTimer)
      await stopChild()
      await pairing?.cerrar().catch(() => {})
      await runtimeStore?.close().catch(() => {})
    },
  }
  try {
    await spawn()
    return handle
  } catch (error) {
    await handle.close()
    throw error
  }
}
