/* Pain-Bot — métricas en vivo por carril.
 *
 * El estado completo (sesiones, memoria, plugins) se escribe cada 60 s porque
 * es grande. Para la página de servidores hace falta algo mucho más pequeño y
 * frecuente: latencia p99, CPU, uptime, 428 y número de sesiones. Se escribe
 * un JSON de ~300 bytes por carril cada pocos segundos.
 *
 * Los archivos viven en `storage/metrics/live/<workerId>.json` y se escriben
 * de forma atómica (temporal + rename) para que el panel nunca lea medio JSON.
 */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

const DIRECTORIO = path.join('storage', 'metrics', 'live')
const WORKER_ID_PATTERN = /^[a-zA-Z0-9_-]+$/
export const MAX_EDAD_MS = 15_000

function rutaDirectorio(rootDir) {
  // Permite aislar las métricas (pruebas o contenedores con otro cwd).
  const override = String(process.env.PAIN_LIVE_METRICS_DIR || '').trim()
  if (override) return path.resolve(override)
  return path.join(rootDir, DIRECTORIO)
}

function rutaArchivo(rootDir, workerId) {
  return path.join(rutaDirectorio(rootDir), `${workerId}.json`)
}

/** Publica la muestra en vivo de un carril. Nunca lanza: es best-effort. */
export async function publicarMetricasVivo(rootDir, workerId, datos = {}) {
  if (!WORKER_ID_PATTERN.test(String(workerId || ''))) return false
  const destino = rutaArchivo(rootDir, workerId)
  const temporal = `${destino}.${process.pid}.tmp`
  try {
    await fsp.mkdir(rutaDirectorio(rootDir), { recursive: true })
    await fsp.writeFile(temporal, `${JSON.stringify({
      ...datos,
      workerId,
      actualizadoEn: Date.now(),
    })}\n`, 'utf8')
    await fsp.rename(temporal, destino)
    return true
  } catch {
    try { await fsp.rm(temporal, { force: true }) } catch {}
    return false
  }
}

/** Elimina el archivo en vivo al cerrar el proceso. */
export async function eliminarMetricasVivo(rootDir, workerId) {
  if (!WORKER_ID_PATTERN.test(String(workerId || ''))) return
  try { await fsp.rm(rutaArchivo(rootDir, workerId), { force: true }) } catch {}
}

/**
 * Lee todas las muestras en vivo frescas.
 * @returns {Promise<Map<string, object>>} workerId -> muestra
 */
export async function leerMetricasVivo(rootDir, { maxAgeMs = MAX_EDAD_MS, now = Date.now() } = {}) {
  const mapa = new Map()
  let entradas = []
  try {
    entradas = await fsp.readdir(rutaDirectorio(rootDir))
  } catch {
    return mapa
  }
  await Promise.all(entradas.map(async (nombre) => {
    if (!nombre.endsWith('.json')) return
    const workerId = nombre.slice(0, -'.json'.length)
    if (!WORKER_ID_PATTERN.test(workerId)) return
    try {
      const muestra = JSON.parse(await fsp.readFile(path.join(rutaDirectorio(rootDir), nombre), 'utf8'))
      if (muestra.workerId !== workerId) return
      if (!Number.isFinite(muestra.actualizadoEn)) return
      if (now - muestra.actualizadoEn > maxAgeMs) return
      mapa.set(workerId, muestra)
    } catch {}
  }))
  return mapa
}

/** Versión síncrona para pruebas o llamadas de arranque. */
export function leerMetricasVivoSync(rootDir, { maxAgeMs = MAX_EDAD_MS, now = Date.now() } = {}) {
  const mapa = new Map()
  let entradas = []
  try {
    entradas = fs.readdirSync(rutaDirectorio(rootDir), { withFileTypes: true })
  } catch {
    return mapa
  }
  for (const entrada of entradas) {
    if (!entrada.isFile() || !entrada.name.endsWith('.json')) continue
    const workerId = entrada.name.slice(0, -'.json'.length)
    if (!WORKER_ID_PATTERN.test(workerId)) continue
    try {
      const muestra = JSON.parse(fs.readFileSync(path.join(rutaDirectorio(rootDir), entrada.name), 'utf8'))
      if (muestra.workerId !== workerId) continue
      if (!Number.isFinite(muestra.actualizadoEn)) continue
      if (now - muestra.actualizadoEn > maxAgeMs) continue
      mapa.set(workerId, muestra)
    } catch {}
  }
  return mapa
}
