export function crearVerificadorApi({
  fetchImpl,
  timeoutMs = 2_500,
  cacheMs = 30_000,
  now = Date.now
}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl debe ser una función.')

  const cache = new Map()
  const pendientes = new Map()

  return async function apiDisponible(urlBase) {
    const clave = String(urlBase).replace(/\/$/, '')
    const cached = cache.get(clave)
    if (cached && now() - cached.at < cacheMs) return cached.disponible

    const existing = pendientes.get(clave)
    if (existing) return existing

    const pending = (async () => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      let disponible = false
      try {
        const response = await fetchImpl(clave, {
          method: 'GET',
          signal: controller.signal,
          headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0' }
        })
        response.body?.destroy?.()
        disponible = response.status < 500
      } catch {
        disponible = false
      } finally {
        clearTimeout(timer)
      }
      cache.set(clave, { disponible, at: now() })
      return disponible
    })()

    pendientes.set(clave, pending)
    try {
      return await pending
    } finally {
      if (pendientes.get(clave) === pending) pendientes.delete(clave)
    }
  }
}
