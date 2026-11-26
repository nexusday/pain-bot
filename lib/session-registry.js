/**
 * Registro único de sesiones del proceso.
 *
 * Antes de este módulo la vida de un sub-bot estaba repartida entre
 * `global.conns`, tres gestores distintos, ficheros `process-status/*.json`,
 * leases y colas por proceso. Eso producía carreras (sockets duplicados con
 * cierre 440) y obligaba a leer y parsear ficheros en el camino de cada
 * mensaje.
 *
 * Aquí hay una sola fuente de verdad en memoria. El fichero de estado que lee
 * el panel se genera a partir de este registro, nunca al revés.
 */
import fs from 'node:fs'
import path from 'node:path'
import * as ws from 'ws'

const sesiones = new Map()
let version = 0

function normalizar(folder) {
  return String(folder || '').trim()
}

function socketAbierto(conn) {
  if (!conn?.user) return false
  try {
    if (conn.ws?.isOpen === true) return true
    const estado = conn.ws?.socket?.readyState ?? conn.ws?.readyState
    return estado === ws.OPEN
  } catch {
    return false
  }
}

export function registrarSesion(folder, conn, datos = {}) {
  const clave = normalizar(folder)
  if (!clave) return null
  const anterior = sesiones.get(clave) || {}
  const entrada = {
    folder: clave,
    path: datos.path || anterior.path || '',
    conn: conn || anterior.conn || null,
    estado: datos.estado || (conn ? 'conectando' : anterior.estado || 'iniciando'),
    desde: datos.desde || anterior.desde || Date.now(),
    abiertoDesde: datos.abiertoDesde || anterior.abiertoDesde || 0,
    ultimoError: datos.ultimoError ?? anterior.ultimoError ?? null,
    intentos: datos.intentos ?? anterior.intentos ?? 0,
    requiereRelink: datos.requiereRelink ?? anterior.requiereRelink ?? false,
    telefono: datos.telefono || anterior.telefono || '',
    nombre: datos.nombre || anterior.nombre || '',
    jid: datos.jid || anterior.jid || '',
    lid: datos.lid || anterior.lid || '',
  }
  if (entrada.conn && datos.estado === 'abierta') {
    entrada.estado = 'abierta'
    entrada.abiertoDesde = entrada.abiertoDesde || Date.now()
  }
  sesiones.set(clave, entrada)
  version++
  return entrada
}

export function actualizarSesion(folder, datos = {}) {
  const clave = normalizar(folder)
  const actual = sesiones.get(clave)
  if (!actual) return registrarSesion(clave, datos.conn || null, datos)
  return registrarSesion(clave, datos.conn ?? actual.conn, { ...actual, ...datos })
}

export function quitarSesion(folder) {
  const clave = normalizar(folder)
  const existia = sesiones.delete(clave)
  if (existia) version++
  return existia
}

export function obtenerSesion(folder) {
  return sesiones.get(normalizar(folder)) || null
}

export function listarSesionesRegistradas() {
  return [...sesiones.values()]
}

export function sesionAbierta(folder) {
  const entrada = sesiones.get(normalizar(folder))
  if (!entrada) return false
  if (entrada.estado === 'abierta' && entrada.conn && socketAbierto(entrada.conn)) return true
  return socketAbierto(entrada.conn)
}

export function listarSocketsLocales() {
  const vistos = new Set()
  const lista = []
  for (const entrada of sesiones.values()) {
    if (!entrada.conn || vistos.has(entrada.conn)) continue
    vistos.add(entrada.conn)
    lista.push(entrada.conn)
  }
  for (const conn of global.conns || []) {
    if (!conn || vistos.has(conn)) continue
    vistos.add(conn)
    lista.push(conn)
  }
  return lista
}

export function telefonoDeSesion(entrada) {
  return String(
    entrada?.telefono ||
    entrada?.conn?.phoneNumber ||
    entrada?.conn?.botNumber ||
    entrada?.folder ||
    ''
  ).replace(/\D/g, '')
}

/** Datos compactos para el panel y los comandos (sin sockets ni Buffers). */
export function snapshotSesiones() {
  return [...sesiones.values()].map((entrada) => ({
    folder: entrada.folder,
    number: telefonoDeSesion(entrada) || entrada.folder,
    name: entrada.nombre || entrada.conn?.user?.name || entrada.conn?.authState?.creds?.me?.name || '',
    jid: entrada.jid || entrada.conn?.user?.jid || entrada.conn?.user?.id || '',
    lid: entrada.lid || entrada.conn?.user?.lid || '',
    connected: entrada.estado === 'abierta' && socketAbierto(entrada.conn),
    requiresRelink: Boolean(entrada.requiereRelink),
    estado: entrada.estado,
    desde: entrada.desde,
    abiertoDesde: entrada.abiertoDesde,
    ultimoError: entrada.ultimoError,
    intentos: entrada.intentos,
  }))
}

export function resumenSesiones() {
  let abiertas = 0
  let conectando = 0
  let caidas = 0
  for (const entrada of sesiones.values()) {
    if (entrada.estado === 'abierta' && socketAbierto(entrada.conn)) abiertas++
    else if (entrada.estado === 'iniciando' || entrada.estado === 'conectando') conectando++
    else caidas++
  }
  return { total: sesiones.size, abiertas, conectando, caidas, version }
}

/**
 * Lista global para comandos que antes leían `storage/process-status`.
 * En el proceso del bot sale del registro; en el proceso web (que no comparte
 * memoria) lee el snapshot que publica el bot.
 */
export async function listarSesionesGlobales(rootDir = process.cwd()) {
  // En modo carriles (varios procesos) el panel corre en el carril primario
  // pero las sesiones viven repartidas. Se agregan desde los ficheros de
  // estado de todos los carriles. En modo único basta con el registro local.
  const multiCarril = process.env.PAIN_SINGLE_PROCESS === '0'
  if (!multiCarril && process.env.PAIN_ROLE !== 'web') {
    return snapshotSesiones()
  }
  try {
    const { readSubbotWorkerStatuses } = await import('../subbot-status.js')
    const sesionesWeb = []
    for (const worker of readSubbotWorkerStatuses(rootDir, { maxAgeMs: 120_000 })) {
      for (const sesion of worker.sessions || []) {
        sesionesWeb.push({ ...sesion, workerId: worker.workerId })
      }
    }
    return sesionesWeb
  } catch {
    return []
  }
}

export function escribirSnapshot(rootDir = process.cwd(), extra = {}) {
  const datos = {
    workerId: 'primary',
    pid: process.pid,
    updatedAt: Date.now(),
    sessions: snapshotSesiones(),
    ...extra,
  }
  return datos
}

export function carpetaSesiones(global_bot) {
  return path.resolve(process.cwd(), global_bot || 'Serbot')
}

export function existeSesionEnDisco(folder, rootDir = carpetaSesiones(global.bot)) {
  try {
    return fs.existsSync(path.join(rootDir, normalizar(folder), 'creds.json'))
  } catch {
    return false
  }
}
