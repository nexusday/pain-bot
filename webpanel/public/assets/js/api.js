/* Pain Panel — módulo api */
import { state } from './core.js'

// El cliente HTTP no depende directamente de la vista de acceso: la app
// registra aquí qué hacer cuando el servidor invalida la sesión.
let alExpirarSesion = null

export function registrarExpiracionSesion(fn) {
  alExpirarSesion = fn
}

/* ── Vigilante de reconexión ────────────────────────────────────────────── */
/**
 * Si el proceso del panel se reinicia (bot reiniciado por SSH, «Aplicar
 * cambios», etc.), las pestañas abiertas quedan con la conexión muerta y el
 * usuario tendría que recargar a mano. Este vigilante sondea /healthz y
 * recarga la página en cuanto el panel vuelve a responder, sin necesidad de
 * que nadie toque nada.
 */
let vigilanteReconexion = null

function iniciarVigilanteReconexion() {
  if (vigilanteReconexion) return
  if (typeof window === 'undefined' || typeof setInterval === 'undefined') return
  let revisando = false
  vigilanteReconexion = setInterval(async () => {
    if (revisando) return
    revisando = true
    try {
      const respuesta = await fetch('/healthz', { cache: 'no-store' })
      if (!respuesta.ok) return
      clearInterval(vigilanteReconexion)
      vigilanteReconexion = null
      window.location.reload()
    } catch {
      // sigue esperando al siguiente intento
    } finally {
      revisando = false
    }
  }, 3000)
  // Tope de 2 minutos: si el panel sigue sin volver, deja de sondear y avisa.
  setTimeout(() => {
    if (!vigilanteReconexion) return
    clearInterval(vigilanteReconexion)
    vigilanteReconexion = null
    import('./core.js').then(({ showToast }) =>
      showToast('El panel no volvió a responder. Recarga la página en unos segundos.', 'warn')
    ).catch(() => {})
  }, 120_000).unref?.()
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
    // El proceso del panel no responde (reiniciando el bot, desplegando
    // cambios…): empezar el vigilante para que la pestaña se recargue sola
    // en cuanto vuelva.
    iniciarVigilanteReconexion()
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
