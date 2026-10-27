/* Pain Panel — módulo stats */
import { api } from './api.js'
import { h, icon, state } from './core.js'

export function dashboardGlobalStatsHTML(s = {}) {
  const top = Array.isArray(s.topCommands) ? s.topCommands : []
  const recent = Array.isArray(s.recentCommands) ? s.recentCommands : []
  return `<div class="card global-overview-card"><div class="card-head"><div><h3>Actividad del servicio</h3><p>Resumen general del uso del panel</p></div></div>
    <div class="card-body"><div class="global-overview-metrics">
      <div class="global-metric"><span class="global-metric-value">${Number(s.activeGroups) || 0}</span><span class="global-metric-label">Grupos activos</span></div>
      <div class="global-metric"><span class="global-metric-value">${Number(s.totalCommands) || 0}</span><span class="global-metric-label">Comandos disponibles</span></div>
    </div></div>
  </div>
  <div class="dashboard-activity-stats">
    <div class="card"><div class="card-head"><div><h3>Comandos más usados</h3><p>Ranking general</p></div></div>
      <div class="card-body tight"><div class="global-command-list">${top.length ? top.map((item, index) => `<div class="global-command-row"><b>${index + 1}</b><code>.${h(item.command)}</code><span>${h(item.count)} usos</span></div>`).join('') : '<div class="empty-inline">Todavía no hay comandos registrados.</div>'}</div></div>
    </div>
  </div>
  <div class="card recent-commands-card"><div class="card-head"><div><h3>Últimos comandos</h3><p>Actividad reciente</p></div></div>
    <div class="card-body tight"><div class="global-command-list">${recent.length ? recent.map((item) => `<div class="global-command-row"><span class="dot dot-success"></span><code>.${h(item.command)}</code><span>${new Date(Number(item.at)).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span></div>`).join('') : '<div class="empty-inline">Aún no se ha ejecutado ningún comando.</div>'}</div></div>
  </div>`
}

/* ── Stats en tiempo real ────────────────────────────────────────────────── */
export async function cargarStats() {
  if (document.hidden) return
  try {
    const data = await api.get('/api/stats')
    state.stats = data
    renderStatsBadges()
    const live = document.getElementById('dashboard-global-stats')
    if (live) live.innerHTML = dashboardGlobalStatsHTML(data)
  } catch {
    // Fallo silencioso: las stats son opcionales
  }
}

export function iniciarPollingStats() {
  if (state.statsPoll) clearInterval(state.statsPoll)
  state.statsPoll = setInterval(cargarStats, 5_000)
  state.statsPoll.unref?.()
}

export function renderStatsBadges() {
  const s = state.stats
  if (!s) return
  // Landing (sin login)
  const elAuth = document.getElementById('auth-stats')
  if (elAuth && !state.user) {
    const premiumActivos = Number(s.premiumActive) || 0
    const premiumGuardados = Number(s.premiumSaved) || 0
    elAuth.innerHTML = `
      <div class="stat-badge">${icon('users')} <b>${s.users}</b> usuarios</div>
      <div class="stat-badge">${icon('bot')} <b>${s.bots}</b> sub-bots</div>
      <div class="stat-badge ${s.sessionsConnected ? 'stat-online' : ''}">${icon('wifi')} <b>${s.sessionsConnected}</b> conectados</div>
      <div class="stat-badge">${icon('globe')} <b>${s.communities}</b> comunidades</div>
      <div class="stat-badge stat-online">${icon('users')} <b>${s.activeGroups || 0}</b> grupos activos</div>
      <div class="stat-badge">${icon('activity')} <b>${s.totalCommands || 0}</b> comandos disponibles</div>
      <div class="stat-badge">${icon('sparkles')} <b>${premiumActivos}</b> premium activos</div>
      <div class="stat-badge">${icon('zap')} <b>${premiumGuardados}</b> premium guardados</div>
    `
    const global = document.getElementById('auth-global-stats')
    if (global) global.innerHTML = dashboardGlobalStatsHTML(s)
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
      <span class="stat-badge stat-online">${icon('users')} <b>${s.activeGroups || 0}</b> grupos activos</span>
      <span class="stat-badge">${icon('activity')} <b>${s.totalCommands || 0}</b> comandos</span>
    `
  }
}
