/* Pain Panel — módulo app */
import { api, registrarExpiracionSesion } from './api.js'
import { definirEntradaAlPanel, handleSessionExpired, renderAuth } from './auth.js'
import { PANEL_VERSION, h, icon, navigate, showToast, state } from './core.js'
import { onChange, onClick, onKeydown, onSubmit } from './events.js'
import { renderShell, route } from './shell.js'
import { cargarStats, iniciarPollingStats } from './stats.js'

/* ── Arranque ───────────────────────────────────────────────────────────── */
/* ── Aviso de versión desactualizada ──────────────────────────────────────── */
/** Compara versiones "1.2.3" → 1 si a > b, -1 si a < b, 0 si iguales. */
export function compararVersiones(a, b) {
  const pa = String(a || '').split('.').map((n) => Number.parseInt(n, 10) || 0)
  const pb = String(b || '').split('.').map((n) => Number.parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0
    const y = pb[i] || 0
    if (x > y) return 1
    if (x < y) return -1
  }
  return 0
}

/**
 * Si el navegador tiene un JS viejo, el servidor avisa con otra versión.
 * También avisa al revés: si el servidor quedó con el código viejo (no se
 * reinició el proceso tras una actualización), avisa de que hay que reiniciarlo.
 */
export function avisarVersionDesactualizada() {
  const delServidor = String(state.config?.version || '').trim()
  if (!delServidor) return
  const comparacion = compararVersiones(PANEL_VERSION, delServidor)
  if (comparacion === 0) return
  if (document.getElementById('version-banner')) return

  const servidorViejo = comparacion > 0
  const aviso = document.createElement('div')
  aviso.id = 'version-banner'
  aviso.className = 'version-banner'
  aviso.innerHTML = servidorViejo
    ? `${icon('alert')}<span>El <b>servidor del panel tiene el código viejo</b> (v${h(delServidor)}). Pulsa <b>Aplicar cambios</b>: si el proceso no necesita reiniciarse, el panel se recarga solo <b>sin cortar la web</b>.</span>${
        state.user?.role === 'admin'
          ? `<button class="btn btn-sm btn-secondary" data-action="apply-updates">${icon('refresh')} Aplicar cambios</button>`
          : ''
      }`
    : `${icon('alert')}<span>Hay una versión nueva del panel (v${h(delServidor)}). Recarga la página para verla: <b>Ctrl + Shift + R</b></span>`
  document.body.appendChild(aviso)
}

export async function boot() {
  try {
    const me = await api.get('/api/auth/me')
    state.user = me.user
    state.csrf = me.csrf
    let publicConfig = {}
    try {
      publicConfig = await api.get('/api/config')
    } catch {}
    state.config = { ...(state.config || {}), ...(me.config || {}), ...publicConfig }
    state.impersonatedBy = me.impersonatedBy || null
    renderShell()
    if (!location.hash) history.replaceState(null, '', '#/dashboard')
    await route()
    avisarVersionDesactualizada()
    // Stats en tiempo real: cargar una vez y mantener actualizado
    await cargarStats()
    iniciarPollingStats()
  } catch (error) {
    state.user = null
    try {
      state.config = { ...(state.config || {}), ...(await api.get('/api/config')) }
    } catch {}
    // La landing se pinta primero para que las stats tengan dónde mostrarse.
    renderAuth()
    await cargarStats()
    iniciarPollingStats()
    if (error.status && error.status !== 401) {
      showToast(error.message || 'No se pudo cargar el panel.', 'error')
    }
  }
}

document.addEventListener('click', onClick)
document.addEventListener('submit', onSubmit)
document.addEventListener('change', onChange)
document.addEventListener('keydown', onKeydown)
window.addEventListener('hashchange', () => { route() })

// Conecta las piezas que no deben depender entre sí:
// - el cliente HTTP avisa a auth cuando la sesión caduca;
// - auth avisa al shell cuando el login termina bien.
registrarExpiracionSesion(handleSessionExpired)
definirEntradaAlPanel(() => {
  renderShell()
  navigate('/dashboard')
})

boot()
