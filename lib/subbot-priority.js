/**
 * Prioridad por plan de sub-bot. No depende de cuántos sub-bots existan: se
 * aplica al orden de arranque y a la cola de reconexiones de cada worker, así
 * que escala igual con 50, 500 o 5000 sesiones.
 *
 * El estado premium vive en `Serbot/<número>/config.json` (premium.expiresAt /
 * adminInfinite). Se cachea 60 s por sesión: leer el archivo en cada
 * reconexión sería barato, pero con cientos de sesiones no hace falta.
 */
import fs from 'node:fs'
import path from 'node:path'

const TTL_MS = 60_000
const MAX_ENTRADAS = 5_000
const cache = new Map()

function rutaConfig(rootSubbots, folder) {
  if (!rootSubbots || !folder) return null
  const carpeta = String(folder)
  if (!/^[a-zA-Z0-9_-]+$/.test(carpeta)) return null
  return path.join(String(rootSubbots), carpeta, 'config.json')
}

/** ¿La sesión tiene un plan premium vigente? */
export function esSesionPremium(rootSubbots, folder, ahora = Date.now()) {
  const ruta = rutaConfig(rootSubbots, folder)
  if (!ruta) return false
  const guardado = cache.get(ruta)
  if (guardado && ahora - guardado.at < TTL_MS) return guardado.premium
  let premium = false
  try {
    const datos = JSON.parse(fs.readFileSync(ruta, 'utf8'))
    const plan = datos && typeof datos === 'object' ? datos.premium : null
    premium = Boolean(
      plan &&
      (plan.adminInfinite === true || Number(plan.expiresAt) > ahora)
    )
  } catch {
    premium = false
  }
  cache.set(ruta, { at: ahora, premium })
  if (cache.size > MAX_ENTRADAS) {
    for (const [clave, entrada] of cache) {
      if (ahora - entrada.at > TTL_MS) cache.delete(clave)
    }
    while (cache.size > MAX_ENTRADAS) cache.delete(cache.keys().next().value)
  }
  return premium
}

/** 1 = premium (atender primero), 0 = normal. */
export function prioridadDeSesion(rootSubbots, folder) {
  return esSesionPremium(rootSubbots, folder) ? 1 : 0
}

/**
 * Ordena sesiones para arranque: premium primero, conservando el orden
 * original dentro de cada grupo (sort estable).
 */
export function ordenarSesionesPorPrioridad(rootSubbots, sesiones, ahora = Date.now()) {
  if (!Array.isArray(sesiones) || sesiones.length < 2) return [...(sesiones || [])]
  const premium = []
  const normales = []
  for (const folder of sesiones) {
    if (esSesionPremium(rootSubbots, folder, ahora)) premium.push(folder)
    else normales.push(folder)
  }
  return premium.concat(normales)
}
