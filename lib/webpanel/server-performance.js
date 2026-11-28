/* Pain Panel — rendimiento agregado por servidor.
 *
 * Cada carril publica métricas en su archivo de estado (workerId, p99 del
 * event loop, CPU, uptime, 428, reintentos). Aquí se agrupan por servidor
 * para que la página pública muestre la salud real de cada uno sin exponer
 * detalles internos del host.
 */

/** Extrae el servidor al que pertenece un worker (`server-3-lane-7`, `worker-2`). */
export function claveDeWorker(workerId) {
  const id = String(workerId || '')
  const coincide = /^server-(\d+)-lane-/.exec(id)
  if (coincide) return String(Number(coincide[1]))
  if (id.startsWith('worker-') || id === 'primary') return 'auto'
  return null
}

/**
 * Agrupa las métricas de los carriles por servidor.
 * @param {Array<{workerId?: string, metricas?: object, sessions?: Array}>} workers
 * @returns {Map<string, {
 *   p99: number[], cpu: number[], uptime: number[], total: number,
 *   connected: number, lanes: number, desconexiones428: number, reintentos: number,
 * }>}
 */
export function agruparRendimientoPorServidor(workers = []) {
  const mapa = new Map()
  for (const worker of workers) {
    // Los workers sintéticos (sin snapshot en disco) no tienen métricas y no
    // deben falsear la media con ceros. Los carriles sin sesiones (por ejemplo
    // el primario, que solo lleva el panel) tampoco representan a ningún bot.
    if (!worker?.metricas) continue
    const sesiones = Array.isArray(worker.sessions) ? worker.sessions : []
    if (!sesiones.length) continue
    const clave = claveDeWorker(worker.workerId)
    if (!clave) continue
    const actual = mapa.get(clave) || {
      p99: [], cpu: [], uptime: [], total: 0, connected: 0, lanes: 0,
      desconexiones428: 0, reintentos: 0,
    }
    actual.p99.push(Number(worker.metricas.lagP99Ms) || 0)
    actual.cpu.push(Number(worker.metricas.cpuUsoPercent) || 0)
    actual.uptime.push(Number(worker.metricas.uptimeSegundos) || 0)
    actual.desconexiones428 += Number(worker.metricas.desconexiones428) || 0
    actual.reintentos += Number(worker.metricas.reintentosReconexion) || 0
    actual.total += sesiones.length
    actual.connected += sesiones.filter((sesion) => sesion?.connected).length
    actual.lanes++
    mapa.set(clave, actual)
  }
  return mapa
}

/**
 * Convierte el agregado de carriles en una nota de salud 0-100.
 * Se usa el peor carril: si un carril va lento, los bots de ese carril lo
 * notan aunque la media del servidor sea buena.
 */
export function calcularRendimiento(agg) {
  if (!agg || !agg.lanes) return null
  const p99Ms = agg.p99.length ? Math.max(...agg.p99) : 0
  const cpuPercent = agg.cpu.length ? Math.max(...agg.cpu) : 0
  const uptimeSegundos = agg.uptime.length ? Math.min(...agg.uptime) : 0
  const desconectados = Math.max(0, agg.total - agg.connected)

  let score = 100
  if (p99Ms > 1000) score -= 40
  else if (p99Ms > 500) score -= 25
  else if (p99Ms > 250) score -= 10
  else if (p99Ms > 100) score -= 3
  if (cpuPercent > 90) score -= 25
  else if (cpuPercent > 70) score -= 15
  else if (cpuPercent > 50) score -= 8
  else if (cpuPercent > 30) score -= 3
  if (agg.total > 0) score -= Math.round((desconectados / agg.total) * 30)
  score = Math.max(0, Math.min(100, score))

  return {
    score,
    label: score >= 85 ? 'Excelente' : score >= 65 ? 'Buena' : score >= 45 ? 'Con carga' : 'Lenta',
    speed: p99Ms <= 150 ? 'Rápido' : p99Ms <= 400 ? 'Normal' : 'Lento',
    p99Ms,
    cpuPercent,
    connected: agg.connected,
    total: agg.total,
    lanes: agg.lanes,
    uptimeSegundos,
    desconexiones428: agg.desconexiones428,
    reintentos: agg.reintentos,
  }
}
