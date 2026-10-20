/**
 * Higiene de memoria por proceso. Todo lo que se poda aquí es
 * re-obtenible bajo demanda (metadata, mensajes viejos, búsquedas
 * expiradas): nunca se tocan sockets, credenciales ni DB.
 */
import {
  podarChatsSocket,
  podarMetadataChats,
  estadisticasSockets,
  tamanoCacheMensajes,
} from './socket-message-cache.js'

const MAX_BUSQUEDAS_YT = 2000
const MAX_BUSQUEDAS_SC = 1000
const MAX_BUSQUEDAS_TT = 1000
const EDAD_MAX_BUSQUEDA_MS = 30 * 60 * 1000
const EDAD_MAX_DESCARGA_PENDIENTE_MS = 10 * 60 * 1000

const GC_MIN_MB = Math.max(100, Number.parseInt(process.env.PAIN_GC_MIN_MB, 10) || 350)
const GC_INTERVALO_MS = Math.max(30_000, Number.parseInt(process.env.PAIN_GC_INTERVAL_MS, 10) || 120_000)
// Válvula de seguridad: si el proceso ya ocupa mucho RSS (los búferes de
// multimedia viven fuera del heap y no los limita --max-old-space-size),
// la poda se vuelve agresiva y se fuerza el GC.
const RSS_ALERTA_MB = Number.parseInt(process.env.PAIN_RSS_ALERT_MB, 10) || 1200
const CHATS_MODO_AHORRO = 60
let ultimoGc = 0
let ultimoEstado = null

function podarObjetoConFecha(raiz, edadMaxMs, maxClaves = Infinity) {
  if (!raiz || typeof raiz !== 'object') return 0
  const ahora = Date.now()
  let borradas = 0
  for (const clave of Object.keys(raiz)) {
    const at = Number(raiz[clave]?.at) || 0
    if (at && ahora - at > edadMaxMs) {
      delete raiz[clave]
      borradas++
    }
  }
  const restantes = Object.keys(raiz)
  if (restantes.length > maxClaves) {
    restantes
      .sort((a, b) => (Number(raiz[a]?.at) || 0) - (Number(raiz[b]?.at) || 0))
      .slice(0, restantes.length - maxClaves)
      .forEach((clave) => {
        delete raiz[clave]
        borradas++
      })
  }
  return borradas
}

function mb(bytes) {
  return Math.round((Number(bytes) || 0) / 1048576)
}

/** En workers `global.conn` es un proxy sin chats; se usa solo global.conns. */
function socketsProceso() {
  const sockets = new Set()
  if (global.conn && !global.conn._painPlaceholder) sockets.add(global.conn)
  for (const socket of global.conns || []) {
    if (socket) sockets.add(socket)
  }
  return sockets
}

export function resumenMemoriaProceso() {
  const uso = process.memoryUsage()
  return {
    rssMB: mb(uso.rss),
    heapUsedMB: mb(uso.heapUsed),
    heapTotalMB: mb(uso.heapTotal),
    externalMB: mb(uso.external),
    arrayBuffersMB: mb(uso.arrayBuffers || 0),
  }
}

/** Memoria + conteos del proceso, sin serializar mensajes. */
export function estadoMemoriaProceso() {
  return {
    memoria: resumenMemoriaProceso(),
    ...estadisticasSockets([...socketsProceso()]),
    cacheMensajes: tamanoCacheMensajes(),
    modoAhorro: Boolean(ultimoEstado?.agresivo),
  }
}

/** GC manual solo si el proceso se acerca al umbral (evita pausas constantes). */
export function liberarMemoriaSiHaceFalta({
  forzar = false,
  urgente = false,
  memoria = resumenMemoriaProceso(),
} = {}) {
  if (typeof global.gc !== 'function') return false
  const ahora = Date.now()
  if (!forzar && ahora - ultimoGc < GC_INTERVALO_MS) return false
  if (!forzar && !urgente && memoria.heapUsedMB < GC_MIN_MB) return false
  try {
    global.gc()
    ultimoGc = ahora
    return true
  } catch {
    return false
  }
}

export function higieneMemoriaProceso({ forzarGc = false, verbose = false } = {}) {
  const resumen = { chats: 0, metadata: 0, yt: 0, sc: 0, tt: 0, descargas: 0, gc: false, agresivo: false }
  const memoriaPrevia = resumenMemoriaProceso()
  const agresivo = memoriaPrevia.rssMB > RSS_ALERTA_MB
  resumen.agresivo = agresivo
  const maxChats = agresivo ? CHATS_MODO_AHORRO : undefined

  try {
    for (const sock of socketsProceso()) {
      if (!sock?.chats) continue
      try {
        resumen.chats += podarChatsSocket(sock, maxChats) || 0
      } catch {}
      try {
        resumen.metadata += podarMetadataChats(sock) || 0
      } catch {}
    }
  } catch {}
  try {
    resumen.yt = podarObjetoConFecha(global.lastYtSearch, EDAD_MAX_BUSQUEDA_MS, MAX_BUSQUEDAS_YT)
  } catch {}
  try {
    resumen.sc = podarObjetoConFecha(global.lastScSearch, EDAD_MAX_BUSQUEDA_MS, MAX_BUSQUEDAS_SC)
  } catch {}
  try {
    resumen.tt = podarObjetoConFecha(global.lastTtSearch, EDAD_MAX_BUSQUEDA_MS, MAX_BUSQUEDAS_TT)
  } catch {}
  try {
    resumen.descargas = podarObjetoConFecha(global.pendingYtDescarga, EDAD_MAX_DESCARGA_PENDIENTE_MS)
  } catch {}

  resumen.memoria = resumenMemoriaProceso()
  resumen.gc = liberarMemoriaSiHaceFalta({
    forzar: forzarGc,
    urgente: agresivo,
    memoria: resumen.memoria,
  })

  const liberados = resumen.chats + resumen.metadata + resumen.yt + resumen.sc +
    resumen.tt + resumen.descargas
  ultimoEstado = {
    agresivo,
    gc: resumen.gc,
    liberados,
    memoria: resumen.memoria,
    at: Date.now(),
  }
  if (verbose || liberados || resumen.gc) {
    console.log(
      `[mem] ${resumen.memoria.rssMB} MB rss / ${resumen.memoria.heapUsedMB} MB heap · ` +
      `${resumen.chats} chat(s), ${resumen.metadata} metadata, ${resumen.yt + resumen.sc + resumen.tt} búsqueda(s), ` +
      `${resumen.descargas} descarga(s) liberados${resumen.gc ? ' · GC ejecutado' : ''}` +
      `${agresivo ? ' · modo ahorro' : ''}.`
    )
  }
  return resumen
}

export {
  higieneMemoriaProceso as runMemoryHygiene,
}
