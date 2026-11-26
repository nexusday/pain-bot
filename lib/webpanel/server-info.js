/**
 * Detección de recursos del servidor para el panel web.
 *
 * Lee CPU, RAM, disco y carga del sistema sin dependencias externas.
 * Se cachea unos segundos para no golpear /proc en cada request.
 */
import fs from 'node:fs'
import os from 'node:os'

const CACHE_MS = 5_000
let cache = null
let cacheAt = 0

function leerCpuTimes() {
  const cpus = os.cpus() || []
  let idle = 0
  let total = 0
  for (const cpu of cpus) {
    const t = cpu.times || {}
    idle += (t.idle || 0) + (t.wait || 0)
    total += (t.user || 0) + (t.nice || 0) + (t.sys || 0) + (t.irq || 0) + (t.idle || 0)
  }
  return { idle, total }
}

let cpuAnterior = leerCpuTimes()

function usoCpu() {
  const actual = leerCpuTimes()
  const idleDiff = actual.idle - cpuAnterior.idle
  const totalDiff = actual.total - cpuAnterior.total
  cpuAnterior = actual
  if (totalDiff <= 0) return 0
  return Math.max(0, Math.min(100, (1 - idleDiff / totalDiff) * 100))
}

function memoriaSistema() {
  const total = os.totalmem()
  const libre = os.freemem()
  return {
    totalMB: Math.round(total / 1048576),
    libreMB: Math.round(libre / 1048576),
    usadaMB: Math.round((total - libre) / 1048576),
    porcentaje: total > 0 ? Math.round(((total - libre) / total) * 100) : 0,
  }
}

function memoriaProceso() {
  const u = process.memoryUsage()
  return {
    rssMB: Math.round(u.rss / 1048576),
    heapMB: Math.round(u.heapUsed / 1048576),
    heapTotalMB: Math.round(u.heapTotal / 1048576),
    externalMB: Math.round(u.external / 1048576),
    arrayBuffersMB: Math.round((u.arrayBuffers || 0) / 1048576),
  }
}

function disco(carpeta = process.cwd()) {
  try {
    const { statfsSync } = fs
    if (typeof statfsSync === 'function') {
      const s = statfsSync(carpeta)
      const block = s.bsize || s.blockSize || 4096
      const total = (s.blocks || 0) * block
      const libre = (s.bavail || s.blocksFree || 0) * block
      return {
        totalGB: Math.round((total / 1073741824) * 10) / 10,
        libreGB: Math.round((libre / 1073741824) * 10) / 10,
        usadaGB: Math.round(((total - libre) / 1073741824) * 10) / 10,
        porcentaje: total > 0 ? Math.round(((total - libre) / total) * 100) : 0,
      }
    }
  } catch {}
  // Fallback: no exhaustivo pero útil en Windows/otros.
  try {
    const s = fs.statSync(carpeta)
    if (s) return { totalGB: null, libreGB: null, usadaGB: null, porcentaje: null }
  } catch {}
  return { totalGB: null, libreGB: null, usadaGB: null, porcentaje: null }
}

function cargaSistema() {
  const carga = os.loadavg ? os.loadavg() : [0, 0, 0]
  const cpus = os.cpus()?.length || 1
  return {
    load1: Math.round(carga[0] * 100) / 100,
    load5: Math.round(carga[1] * 100) / 100,
    load15: Math.round(carga[2] * 100) / 100,
    normalizado: Math.round((carga[0] / cpus) * 100) / 100,
  }
}

export function informacionServidor({ forzar = false } = {}) {
  const ahora = Date.now()
  if (!forzar && cache && ahora - cacheAt < CACHE_MS) return cache
  const cpus = os.cpus() || []
  const memoria = memoriaSistema()
  const discoInfo = disco()
  const info = {
    hostname: os.hostname(),
    plataforma: os.platform(),
    arquitectura: os.arch(),
    release: os.release(),
    uptimeSegundos: Math.round(os.uptime()),
    node: process.version,
    cpu: {
      nucleos: cpus.length,
      modelo: cpus[0]?.model?.trim() || 'desconocido',
      velocidadMHz: cpus[0]?.speed || 0,
      usoPorcentaje: Math.round(usoCpu() * 10) / 10,
    },
    memoria,
    proceso: memoriaProceso(),
    disco: discoInfo,
    carga: cargaSistema(),
    tier: process.env.PAIN_TIER || 'free',
    worker: process.env.PAIN_WORKER_ID || 'primary',
    lanes: Number.parseInt(process.env.PAIN_LANES, 10) || 1,
  }
  cache = info
  cacheAt = ahora
  return info
}
