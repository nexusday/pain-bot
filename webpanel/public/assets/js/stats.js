/* Pain Panel — módulo stats */
import { api } from './api.js'
import { icon, state } from './core.js'

/* ── Stats en tiempo real ────────────────────────────────────────────────── */
export async function cargarStats() {
  try {
    const data = await api.get('/api/stats')
    state.stats = data
    renderStatsBadges()
  } catch {
    // Fallo silencioso: las stats son opcionales
  }
}

export function iniciarPollingStats() {
  if (state.statsPoll) clearInterval(state.statsPoll)
  state.statsPoll = setInterval(cargarStats, 30_000)
  state.statsPoll.unref?.()
}

export function renderStatsBadges() {
  const s = state.stats
  if (!s) return
  // Landing (sin login)
  const elAuth = document.getElementById('auth-stats')
  if (elAuth && !state.user) {
    elAuth.innerHTML = `
      <div class="stat-badge">${icon('users')} <b>${s.users}</b> usuarios</div>
      <div class="stat-badge">${icon('bot')} <b>${s.bots}</b> sub-bots</div>
      <div class="stat-badge ${s.sessionsConnected ? 'stat-online' : ''}">${icon('wifi')} <b>${s.sessionsConnected}</b> conectados</div>
      <div class="stat-badge">${icon('globe')} <b>${s.communities}</b> comunidades</div>
    `
    return
  }
  // Shell (después del login): badges en el topbar
  const elTop = document.getElementById('stats-badges')
  if (elTop) {
    elTop.style.display = ''
    elTop.innerHTML = `
      <span class="stat-badge">${icon('users')} <b>${s.users}</b> usuarios</span>
      <span class="stat-badge">${icon('bot')} <b>${s.bots}</b> sub-bots</span>
      <span class="stat-badge ${s.sessionsConnected ? 'stat-online' : ''}">${icon('wifi')} <b>${s.sessionsConnected}</b> conectados</span>
      <span class="stat-badge">${icon('globe')} <b>${s.communities}</b> comunidades</span>
    `
  }
}
