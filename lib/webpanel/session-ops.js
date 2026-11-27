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
import { snapshotSesiones } from '../session-registry.js'
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

/** Estatus de conexión publicado por el proceso del bot. */
export function estatusWorkers(root) {
  const mapa = new Map()
  let workers = []
  try {
    // En el proceso web no hay memoria compartida: se lee el snapshot que
    // publica el bot. En el proceso del bot se usa el registro directo.
    if (process.env.PAIN_ROLE === 'web') {
      workers = readSubbotWorkerStatuses(process.cwd(), { maxAgeMs: 120_000 })
      for (const worker of workers) {
        for (const sesion of worker.sessions || []) {
          mapa.set(sesion.folder, {
            connected: Boolean(sesion.connected),
            worker: worker.workerId,
          })
        }
      }
    } else {
      workers = [{ workerId: 'primary', sessions: snapshotSesiones() }]
      for (const sesion of workers[0].sessions) {
        mapa.set(sesion.folder, { connected: Boolean(sesion.connected), worker: 'primary' })
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

/**
 * Lista todas las sesiones (disco + registro de ajustes) para el panel.
 *
 * El escaneo de disco (miles de carpetas + creds + prefs) se cachea 8 s,
 * porque casi nunca cambia. El estado de conexión NO se cachea: se lee de los
 * archivos de estado de los workers en cada llamada (5 archivos pequeños), así
 * "Conectados ahora" sigue fresco aunque el listado esté cacheado.
 */
const cacheListado = new Map()
const TTL_LISTADO_MS = 8000
const ORDEN = { connected: 0, linked: 1, relink: 2, pairing: 3, pending: 4, unknown: 5 }

export function invalidarListadoSesiones(root) {
  if (root) cacheListado.delete(path.resolve(String(root)))
  else cacheListado.clear()
}

function construirBaseSesiones(root) {
  const vistos = new Set()
  const base = []

  for (const folder of carpetasEnDisco(root)) {
    vistos.add(folder)
    const ruta = path.join(root, folder)
    const pairing = sesionEnEmparejamiento(ruta)
    const creds = leerCreds(ruta)
    base.push({
      folder,
      hasCreds: Boolean(creds),
      registered: creds?.registered === true,
      pairing,
      needsRelink: !pairing && necesitaRevinculacion(root, folder),
      archived: false,
      hasSettings: tieneAjustesGuardados(root, folder),
    })
  }

  // Sesiones ya archivadas que solo conservan ajustes en `_prefs`.
  for (const folder of listarAjustesGuardados(root)) {
    if (vistos.has(folder)) continue
    vistos.add(folder)
    base.push({
      folder,
      hasCreds: false,
      registered: false,
      pairing: false,
      needsRelink: true,
      archived: true,
      hasSettings: true,
    })
  }
  return base
}

function estadoDesdeBase(entrada, workerMap) {
  if (entrada.pairing) return 'pairing'
  if (workerMap.get(entrada.folder)?.connected) return 'connected'
  if (entrada.needsRelink) return 'relink'
  if (entrada.registered) return 'linked'
  if (entrada.hasCreds) return 'pending'
  if (entrada.hasSettings) return 'relink'
  return 'unknown'
}

export function listarSesiones(root, { force = false } = {}) {
  const clave = path.resolve(String(root || ''))
  const ahora = Date.now()
  let cacheado = cacheListado.get(clave)
  if (force || !cacheado || ahora - cacheado.at >= TTL_LISTADO_MS) {
    cacheado = { at: ahora, base: construirBaseSesiones(root) }
    cacheListado.set(clave, cacheado)
    if (cacheListado.size > 50) cacheListado.clear()
  }
  // Estado de conexión fresco en cada consulta (archivos pequeños de worker).
  const { mapa } = estatusWorkers(root)
  return cacheado.base.map((entrada) => {
    // `.pairing` cambia durante una vinculación y no debe quedar atrapado en
    // la caché de 8 s del listado: una marca huérfana se limpia al arrancar y
    // el panel debe reflejarlo inmediatamente.
    const baseActual = {
      ...entrada,
      pairing: sesionEnEmparejamiento(path.join(String(root || ''), entrada.folder)),
    }
    const estado = estadoDesdeBase(baseActual, mapa)
    return {
      folder: baseActual.folder,
      phone: baseActual.folder,
      status: estado,
      worker: mapa.get(baseActual.folder)?.worker || null,
      connected: estado === 'connected',
      hasCreds: baseActual.hasCreds,
      registered: baseActual.registered,
      needsRelink: estado === 'relink',
      pairing: baseActual.pairing,
      archived: baseActual.archived,
      hasSettings: baseActual.hasSettings,
    }
  }).sort((a, b) =>
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
  if (process.env.PAIN_ROLE === 'web') {
    throw new Error('La sesión debe eliminarse desde el proceso del bot.')
  }
  const ruta = path.join(root, folder)

  try {
    const modulo = await import('../../plugins/serbot-serbot.js')
    await modulo.retirarSesionDeWorker(ruta, { handoff: false })
  } catch {}

  try { olvidarAjustesSesion(ruta, root) } catch {}

  if (fs.existsSync(ruta)) {
    fs.rmSync(ruta, { recursive: true, force: true })
  }

  invalidarListadoSesiones(root)
  return true
}

/** Pide al gestor único que reconecte una sesión existente. */
export async function reconectarSesion(root, folder) {
  if (!carpetaSesionValida(folder)) return { ok: false, reason: 'invalid' }
  const ruta = path.join(root, folder)
  if (sesionEnEmparejamiento(ruta)) return { ok: false, reason: 'pairing' }
  if (necesitaRevinculacion(root, folder)) return { ok: false, reason: 'relink' }
  if (!fs.existsSync(path.join(ruta, 'creds.json'))) return { ok: false, reason: 'no-creds' }

  if (typeof global.__painReconnectOne === 'function') {
    const resultado = await global.__painReconnectOne(folder)
    if (resultado?.reason !== 'not-local') return { ...resultado, worker: 'primary' }
  }
  // La sesión vive en otro carril: el supervisor la redirige por IPC.
  if (typeof process.send === 'function') {
    process.send({ type: 'reconnect-bot', folder })
    return { ok: true, pending: true, worker: 'remote' }
  }
  return { ok: false, reason: 'no-manager' }
}

/** Lee/actualiza el máximo de sub-bots desde el panel. */
export function leerMaxSubs() {
  return obtenerMaxSubs()
}

export function guardarMaxSubs(valor) {
  return establecerMaxSubs(valor)
}

export { ARCHIVO_PAIRING, ARCHIVO_REENLACE_PENDIENTE }
