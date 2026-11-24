import fs from 'node:fs'
import path from 'node:path'
import {
  ARCHIVO_PAIRING,
  ARCHIVO_REENLACE_PENDIENTE,
  listarAjustesGuardados,
  necesitaRevinculacion,
  olvidarAjustesSesion,
  sesionEnEmparejamiento,
  tieneAjustesGuardados,
} from '../subbot-recovery.js'
import { readSubbotWorkerStatuses } from '../subbot-status.js'
import { normalizarNumeroTelefono } from '../resolve-phone.js'
import { requestReconnectOne } from '../process-isolation.js'
import { establecerMaxSubs, obtenerMaxSubs } from '../max-subs.js'

const NOMBRE_VALIDO = /^[a-zA-Z0-9_-]+$/

// Caché por mtime/tamaño: `listarSesiones` se llama en cada sondeo del panel
// (miles de carpetas) y parsear todos los creds.json cada vez era puro I/O.
// El archivo solo cambia al vincular/reconectar, así que el mtime detecta
// cualquier cambio real.
const cacheCreds = new Map()

export function normalizarTelefono(valor) {
  return normalizarNumeroTelefono(valor)
}

export function carpetaSesionValida(nombre) {
  return NOMBRE_VALIDO.test(String(nombre || '')) && String(nombre) !== '_prefs'
}

function leerCreds(rutaSesion) {
  const archivo = path.join(rutaSesion, 'creds.json')
  try {
    const info = fs.statSync(archivo)
    const clave = `${info.mtimeMs}:${info.size}`
    const cacheado = cacheCreds.get(archivo)
    if (cacheado?.clave === clave) return cacheado.creds
    const creds = JSON.parse(fs.readFileSync(archivo, 'utf8'))
    const valor = creds && typeof creds === 'object' ? creds : null
    cacheCreds.set(archivo, { clave, creds: valor })
    if (cacheCreds.size > 20_000) cacheCreds.clear()
    return valor
  } catch {
    cacheCreds.delete(archivo)
    return null
  }
}

function carpetasEnDisco(root) {
  if (!root || !fs.existsSync(root)) return []
  try {
    return fs.readdirSync(root, { withFileTypes: true })
      .filter((entrada) => entrada.isDirectory() && carpetaSesionValida(entrada.name))
      .map((entrada) => entrada.name)
  } catch {
    return []
  }
}

/** Estatus de conexión publicado por los workers. */
export function estatusWorkers(root) {
  const mapa = new Map()
  let workers = []
  try {
    // Los workers escriben su estado en `<proyecto>/storage/process-status`,
    // no dentro de la carpeta de sesiones: se lee desde la raíz del proyecto.
    // Los workers publican cada 15 s. 60 s de validez evita que una pausa de
    // CPU del worker haga "desaparecer" sus conexiones del panel.
    workers = readSubbotWorkerStatuses(process.cwd(), { maxAgeMs: 60_000 })
    for (const worker of workers) {
      for (const sesion of worker.sessions || []) {
        mapa.set(sesion.folder, {
          connected: Boolean(sesion.connected),
          worker: worker.workerId,
        })
      }
    }
  } catch {}
  // El principal también puede tener sockets (modo standalone o handoff).
  for (const conn of global.conns || []) {
    try {
      const folder = conn?.pathAYBot ? String(conn.pathAYBot).split(/[\\/]/).pop() : ''
      if (!folder) continue
      const abierto = conn?.ws?.isOpen === true ||
        (conn?.ws?.socket?.readyState ?? conn?.ws?.readyState) === 1
      if (!abierto || !(conn?.user?.id || conn?.user?.jid)) continue
      mapa.set(folder, { connected: true, worker: 'primary' })
    } catch {}
  }
  return { mapa, workers }
}

function estadoDe(root, folder, workerMap) {
  const ruta = path.join(root, folder)
  if (sesionEnEmparejamiento(ruta)) return 'pairing'
  const worker = workerMap.get(folder)
  if (worker?.connected) return 'connected'
  if (necesitaRevinculacion(root, folder)) return 'relink'
  const creds = leerCreds(ruta)
  if (creds?.registered === true) return 'linked'
  if (creds) return 'pending'
  if (tieneAjustesGuardados(root, folder)) return 'relink'
  return 'unknown'
}

const ORDEN = { connected: 0, linked: 1, relink: 2, pairing: 3, pending: 4, unknown: 5 }

/**
 * Lista todas las sesiones (disco + registro de ajustes) para el panel.
 * No modifica nada. Cachea 3 s: varios endpoints (stats, bots, sesiones)
 * piden la misma lista en ráfaga y recorrer miles de carpetas por cada uno
 * castigaba el CPU/disco del proceso que comparte la máquina con el bot.
 */
const cacheListado = new Map()
const TTL_LISTADO_MS = 3000

export function invalidarListadoSesiones(root) {
  if (root) cacheListado.delete(path.resolve(String(root)))
  else cacheListado.clear()
}

export function listarSesiones(root, { force = false } = {}) {
  const clave = path.resolve(String(root || ''))
  const ahora = Date.now()
  const cacheado = cacheListado.get(clave)
  if (!force && cacheado && ahora - cacheado.at < TTL_LISTADO_MS) return cacheado.sesiones
  const sesiones = listarSesionesSinCache(root)
  cacheListado.set(clave, { at: ahora, sesiones })
  if (cacheListado.size > 50) cacheListado.clear()
  return sesiones
}

function listarSesionesSinCache(root) {
  const { mapa } = estatusWorkers(root)
  const vistos = new Set()
  const sesiones = []

  for (const folder of carpetasEnDisco(root)) {
    vistos.add(folder)
    const ruta = path.join(root, folder)
    const creds = leerCreds(ruta)
    const estado = estadoDe(root, folder, mapa)
    sesiones.push({
      folder,
      phone: folder,
      status: estado,
      worker: mapa.get(folder)?.worker || null,
      connected: estado === 'connected',
      hasCreds: Boolean(creds),
      registered: creds?.registered === true,
      needsRelink: estado === 'relink',
      pairing: estado === 'pairing',
      archived: false,
      hasSettings: tieneAjustesGuardados(root, folder),
    })
  }

  // Sesiones ya archivadas que solo conservan ajustes en `_prefs`.
  for (const folder of listarAjustesGuardados(root)) {
    if (vistos.has(folder)) continue
    vistos.add(folder)
    sesiones.push({
      folder,
      phone: folder,
      status: 'relink',
      worker: null,
      connected: false,
      hasCreds: false,
      registered: false,
      needsRelink: true,
      pairing: false,
      archived: true,
      hasSettings: true,
    })
  }

  return sesiones.sort((a, b) =>
    (ORDEN[a.status] ?? 9) - (ORDEN[b.status] ?? 9) || a.folder.localeCompare(b.folder)
  )
}

export function obtenerSesion(root, folder) {
  return listarSesiones(root).find((sesion) => sesion.folder === folder) || null
}

export function contarSesiones(root) {
  const sesiones = listarSesiones(root)
  return {
    total: sesiones.length,
    connected: sesiones.filter((s) => s.status === 'connected').length,
    linked: sesiones.filter((s) => s.status === 'linked').length,
    relink: sesiones.filter((s) => s.status === 'relink').length,
    pairing: sesiones.filter((s) => s.status === 'pairing').length,
  }
}

/** Cierra el socket, borra la carpeta y olvida los ajustes conservados. */
export async function eliminarSesion(root, folder) {
  if (!carpetaSesionValida(folder)) throw new Error('Sesión inválida.')
  const ruta = path.join(root, folder)

  try {
    const modulo = await import('../../plugins/serbot-serbot.js')
    await modulo.retirarSesionDeWorker(ruta, { handoff: false })
  } catch {}

  try { olvidarAjustesSesion(ruta, root) } catch {}

  if (fs.existsSync(ruta)) {
    fs.rmSync(ruta, { recursive: true, force: true })
  }

  try {
    if (typeof process.send === 'function') {
      process.send({ type: 'remove-session', session: folder }, () => {})
    }
  } catch {}

  invalidarListadoSesiones(root)
  return true
}

/** Pide al supervisor que reconecte una sesión existente. */
export async function reconectarSesion(root, folder) {
  if (!carpetaSesionValida(folder)) return { ok: false, reason: 'invalid' }
  const ruta = path.join(root, folder)
  if (sesionEnEmparejamiento(ruta)) return { ok: false, reason: 'pairing' }
  if (necesitaRevinculacion(root, folder)) return { ok: false, reason: 'relink' }
  if (!fs.existsSync(path.join(ruta, 'creds.json'))) return { ok: false, reason: 'no-creds' }

  const ack = await requestReconnectOne(folder)
  if (!ack) return { ok: false, reason: 'no-worker' }
  return { ok: ack.dispatched === true, reason: ack.dispatched ? null : 'no-worker', worker: ack.worker }
}

/** Lee/actualiza el máximo de sub-bots desde el panel. */
export function leerMaxSubs() {
  return obtenerMaxSubs()
}

export function guardarMaxSubs(valor) {
  return establecerMaxSubs(valor)
}

export { ARCHIVO_PAIRING, ARCHIVO_REENLACE_PENDIENTE }
