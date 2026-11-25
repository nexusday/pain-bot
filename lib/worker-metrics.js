/**
 * Métricas ligeras por proceso worker. Todo son enteros o muestras del
 * histograma del event loop: nada pesado, sin intervalos propios (el muestreo
 * lo hace publishWorkerStatus de main.js, que ya corre cada 10 s).
 *
 * - lag del event loop con monitorEventLoopDelay (resolución 50 ms): evidencia
 *   operacional de bloqueos reales (consultas síncronas, GC, plugins lentos).
 * - mensajería: recibidos / duplicados descartados / entregados al handler.
 * - reconexiones: reintentos programados, cuántos fueron por cierre 428 y
 *   cuántos terminaron (via cola por worker).
 * - persistencia: una línea JSONL por minuto en storage/metrics/, con
 *   rotación automática (borra archivos > 7 días). Un worker ocupa ~300 KB/día
 *   con la cadencia de 60 s.
 */
import fs from 'node:fs'
import path from 'node:path'
import { monitorEventLoopDelay } from 'node:perf_hooks'

const ID_PATTERN = /^[a-zA-Z0-9_-]+$/
const DIAS_RETENCION = 7

const reloj = iniciarReloj()
const contadores = {
  mensajesRecibidos: 0,
  mensajesDuplicados: 0,
  mensajesEntregados: 0,
  reintentosReconexion: 0,
  desconexiones428: 0,
  reconexionesTerminadas: 0,
}
// El porcentaje de CPU solo se puede medir por proceso. Estas etapas agregan
// atribución operacional (eventos y tiempo transcurrido) para saber qué estaba
// haciendo el worker durante esa ventana y qué socket era responsable.
const actividadWorker = new Map()
const actividadPorSocket = new WeakMap()
let ultimoCpu = process.cpuUsage()
let ultimoMuestreo = Date.now()
let limpioViejos = false

function iniciarReloj() {
  try {
    const histograma = monitorEventLoopDelay({ resolution: 50 })
    histograma.enable()
    return histograma
  } catch {
    return null
  }
}

export function iniciarMetricasWorker() {
  reloj?.enable?.()
}

/** Para liberar el histograma al cerrar el proceso de forma controlada (tests). */
export function finalizarMetricasWorker() {
  reloj?.disable?.()
}

export function contarMensajesRecibidos(total, entregados) {
  contadores.mensajesRecibidos += Math.max(0, Number(total) || 0)
  contadores.mensajesEntregados += Math.max(0, Number(entregados) || 0)
}

export function contarMensajesDuplicados(cantidad = 1) {
  contadores.mensajesDuplicados += Math.max(0, Number(cantidad) || 0)
}

/** motivo: código de desconexión de Baileys (428 = cierre por WhatsApp). */
export function contarReintentoReconexion(motivo = null) {
  contadores.reintentosReconexion++
  if (Number(motivo) === 428) contadores.desconexiones428++
}

export function contarReconexionTerminada() {
  contadores.reconexionesTerminadas++
}

function sumarActividad(mapa, etapa, duracionMs) {
  if (!mapa || !etapa) return
  const anterior = mapa.get(etapa) || { eventos: 0, duracionMs: 0 }
  anterior.eventos++
  anterior.duracionMs += Math.max(0, Number(duracionMs) || 0)
  mapa.set(etapa, anterior)
}

function mapaDeSocket(socket) {
  if (!socket || (typeof socket !== 'object' && typeof socket !== 'function')) return null
  let mapa = actividadPorSocket.get(socket)
  if (!mapa) {
    mapa = new Map()
    actividadPorSocket.set(socket, mapa)
  }
  return mapa
}

function serializarActividad(mapa, reset = false) {
  const salida = {}
  if (!mapa) return salida
  for (const [etapa, datos] of mapa) {
    salida[etapa] = {
      eventos: datos.eventos,
      duracionMs: Math.round(datos.duracionMs),
    }
  }
  if (reset) mapa.clear()
  return salida
}

/** Registra una operación que no pertenece a un socket concreto, como FFmpeg. */
export function registrarActividadWorker(etapa, duracionMs = 0) {
  sumarActividad(actividadWorker, etapa, duracionMs)
}

export function iniciarActividadWorker(etapa) {
  const inicio = process.hrtime.bigint()
  let finalizada = false
  return () => {
    if (finalizada) return
    finalizada = true
    registrarActividadWorker(
      etapa,
      Number(process.hrtime.bigint() - inicio) / 1e6
    )
  }
}

/** Devuelve un finalizador idempotente para medir una etapa de un socket. */
export function iniciarActividadSocket(socket, etapa) {
  const inicio = process.hrtime.bigint()
  let finalizada = false
  return () => {
    if (finalizada) return
    finalizada = true
    const duracionMs = Number(process.hrtime.bigint() - inicio) / 1e6
    sumarActividad(actividadWorker, etapa, duracionMs)
    sumarActividad(mapaDeSocket(socket), etapa, duracionMs)
  }
}

export function obtenerActividadSocket(socket, { reset = false } = {}) {
  return serializarActividad(actividadPorSocket.get(socket), reset)
}

function msDelHistograma(valor) {
  return Number.isFinite(valor) ? Math.round(valor / 1e6) : 0
}

/**
 * Muestra métricas desde el último muestreo. El histograma del event loop
 * se resetea para que cada muestra refleje la ventana reciente (10 s) y no
 * un promedio de toda la vida del proceso.
 */
export function registrarMetricasWorker() {
  const ahora = Date.now()
  const cpu = process.cpuUsage(ultimoCpu)
  ultimoCpu = process.cpuUsage()
  const cpuUso = ahora > ultimoMuestreo
    ? Math.max(0, (cpu.user + cpu.system) / 1000 / (ahora - ultimoMuestreo) * 100)
    : 0
  ultimoMuestreo = ahora
  let lagMediaMs = 0
  let lagMaxMs = 0
  let lagP99Ms = 0
  let lagMuestras = 0
  if (reloj) {
    lagMediaMs = msDelHistograma(reloj.mean)
    lagMaxMs = msDelHistograma(reloj.max)
    lagP99Ms = msDelHistograma(reloj.percentile(99))
    lagMuestras = reloj.count
    reloj.reset()
  }
  return {
    lagMediaMs,
    lagMaxMs,
    lagP99Ms,
    lagMuestras,
    // % de UN núcleo (100 = un core completo; proceso multi-hilo no: >100% solo
    // si el GC de otro hilo suma). Sirve para comparar workers entre sí.
    cpuUsoPercent: Math.round(cpuUso * 10) / 10,
    uptimeSegundos: Math.round(process.uptime()),
    actividad: serializarActividad(actividadWorker, true),
    ...contadores,
  }
}

/** Persistencia JSONL liviana: una línea por llamada del llamador (cadencia 60 s). */
export async function persistirMetrica(workerId, rootDir, muestra) {
  if (!ID_PATTERN.test(String(workerId || ''))) return
  try {
    const directorio = path.join(rootDir, 'storage', 'metrics')
    fs.mkdirSync(directorio, { recursive: true })
    if (!limpioViejos) {
      limpioViejos = true
      purgarViejos(directorio)
    }
    const fecha = new Date().toISOString().slice(0, 10)
    const destino = path.join(directorio, `${workerId}-${fecha}.jsonl`)
    fs.appendFileSync(
      destino,
      `${JSON.stringify({ t: Date.now(), ...muestra })}\n`,
      'utf8'
    )
  } catch {
    // Las métricas nunca deben romper el flujo del worker.
  }
}

function purgarViejos(directorio) {
  fs.readdirSync(directorio, { withFileTypes: true }).forEach((entrada) => {
    if (!entrada.isFile() || !entrada.name.endsWith('.jsonl')) return
    const fechaTexto = /(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(entrada.name)?.[1]
    if (!fechaTexto) return
    const edad = Date.now() - Date.parse(`${fechaTexto}T00:00:00Z`)
    if (edad > DIAS_RETENCION * 24 * 60 * 60 * 1000) {
      try { fs.rmSync(path.join(directorio, entrada.name), { force: true }) } catch {}
    }
  })
}
