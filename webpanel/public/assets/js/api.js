/* Pain Panel — módulo api */
import { state } from './core.js'

// El cliente HTTP no depende directamente de la vista de acceso: la app
// registra aquí qué hacer cuando el servidor invalida la sesión.
let alExpirarSesion = null

export function registrarExpiracionSesion(fn) {
  alExpirarSesion = fn
}

/* ── Cliente HTTP ───────────────────────────────────────────────────────── */
export async function request(method, path, body, options = {}) {
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (options.csrf !== false && state.csrf) headers['X-CSRF-Token'] = state.csrf

  let response
  try {
    response = await fetch(path, {
      method,
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    const error = new Error('No se pudo conectar con el servidor.')
    error.status = 0
    throw error
  }

  const text = await response.text()
  let data = null
  if (text) {
    try { data = JSON.parse(text) } catch { data = null }
  }

  if (!response.ok) {
    const error = new Error(data?.error || `Error ${response.status}`)
    error.status = response.status
    error.code = data?.code || null
    if (response.status === 401 && !path.startsWith('/api/auth/')) alExpirarSesion?.()
    throw error
  }
  return data ?? {}
}

export const api = {
  get: (path) => request('GET', path, undefined, { csrf: false }),
  post: (path, body) => request('POST', path, body ?? {}),
  patch: (path, body) => request('PATCH', path, body ?? {}),
  del: (path, body) => request('DELETE', path, body),
}
