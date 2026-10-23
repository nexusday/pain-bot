/* Pain Panel — módulo shell */
import { renderAuth } from './auth.js'
import {
  app,
  closeModal,
  h,
  icon,
  initials,
  navigate,
  PANEL_VERSION,
  state,
  stopTimers,
  updateNavBadges,
} from './core.js'
import { renderAdmin } from './pages-admin.js'
import {
  renderAccount,
  renderBots,
  renderCommunities,
  renderDashboard,
  renderLinkPage,
} from './pages-user.js'
import { renderStatsBadges } from './stats.js'

/* ── Shell principal ────────────────────────────────────────────────────── */
export function navLink(path, iconName, label, options = {}) {
  const nav = options.nav || path
  return `<a class="nav-link" href="#${path}" data-nav="${nav}" title="${h(label)}">
    ${icon(iconName)}<span class="nav-label">${h(label)}</span>${options.badge ? `<span class="nav-badge" id="${options.badgeId || ''}">${h(options.badge)}</span>` : ''}
  </a>`
}

export const CLAVE_MENU = 'pain.sidebar'

export function menuColapsado() {
  try {
    return localStorage.getItem(CLAVE_MENU) === 'collapsed'
  } catch {
    return false
  }
}

export function guardarMenu(colapsado) {
  try {
    localStorage.setItem(CLAVE_MENU, colapsado ? 'collapsed' : 'open')
  } catch {}
}

export function toggleSidebar() {
  const shell = document.getElementById('app-shell')
  if (!shell) return
  if (window.innerWidth <= 900) {
    shell.classList.toggle('sidebar-open')
    return
  }
  const colapsado = !shell.classList.contains('sidebar-collapsed')
  shell.classList.toggle('sidebar-collapsed', colapsado)
  guardarMenu(colapsado)
}

export function renderShell() {
  if (!app || !state.user) return
  const cfg = state.config || {}
  const user = state.user
  const isAdmin = user.role === 'admin'
  const publicUrl = cfg.publicUrl || ''

  document.title = `${cfg.brandName || 'Pain Panel'} · Panel`
  app.innerHTML = `
    <div class="app-shell${menuColapsado() ? ' sidebar-collapsed' : ''}" id="app-shell">
      <aside class="sidebar">
        <div class="sidebar-brand">
          <div class="brand">
            <div class="brand-mark"><img src="/assets/logo.webp" alt="" /></div>
            <div class="brand-text">
              <div class="brand-name">${h(cfg.brandName || 'Pain Bot')}</div>
              <div class="brand-sub">Panel de control</div>
            </div>
          </div>
        </div>
        <nav class="nav">
          ${navLink('/dashboard', 'grid', 'Dashboard')}
          ${navLink('/bots', 'bot', 'Mis bots', { badge: state.bots.length || '', badgeId: 'nav-bots-count' })}
          ${navLink('/link', 'link', 'Vincular bot')}
          ${navLink('/communities', 'globe', 'Comunidades')}
          <div class="nav-section">Cuenta</div>
          ${navLink('/account', 'user', 'Mi cuenta')}
          ${isAdmin ? `<div class="nav-section">Administración</div>${navLink('/admin/overview', 'shield', 'Administración', { nav: '/admin' })}` : ''}
        </nav>
        <div class="sidebar-foot">
          <div class="hint">Panel público · v${h(PANEL_VERSION)}</div>
          <div class="public-url">${icon('globe')}<span>${h(publicUrl.replace(/^https?:\/\//, '') || '—')}</span></div>
        </div>
      </aside>
      <div class="sidebar-overlay" data-action="close-sidebar"></div>
      <main class="main">
        <header class="topbar">
          <button class="topbar-toggle" data-action="toggle-sidebar" aria-label="Mostrar u ocultar el menú" title="Mostrar u ocultar el menú">${icon('menu')}</button>
          <div class="topbar-title">
            <h1 id="page-title">Dashboard</h1>
            <p id="page-sub">Resumen de tu cuenta</p>
          </div>
          <div class="topbar-actions">
            <div id="stats-badges" class="stat-badge-skeleton-box" style="display:none;"></div>
            <button class="icon-btn" data-action="refresh" title="Actualizar">${icon('refresh')}</button>
            <div class="user-chip">
              <div class="avatar">${initials(user.username)}</div>
              <div><div class="uc-name">${h(user.username)}</div><div class="uc-role">${isAdmin ? 'Administrador' : 'Usuario'}</div></div>
            </div>
            <button class="icon-btn danger" data-action="logout" title="Cerrar sesión">${icon('logout')}</button>
          </div>
        </header>
        ${state.impersonatedBy ? `<div class="impersonating-bar">
          ${icon('user')}
          <span>Estás <b>acting como @${h(state.user.username)}</b>. Todo lo que cambies afecta a esa cuenta.</span>
          <button class="btn btn-sm btn-secondary" data-action="stop-impersonating">${icon('logout')} Volver a @${h(state.impersonatedBy.username)}</button>
        </div>` : ''}
        ${!user.email ? `<div class="account-nudge" id="email-nudge">
          ${icon('mail')}
          <span><b>Añade un correo a tu cuenta.</b> Te ayuda a recuperar el acceso y la mantiene más segura.</span>
          <a class="btn btn-sm btn-secondary" href="#/account">Añadir correo</a>
        </div>` : ''}
        <div class="content" id="content"></div>
      </main>
    </div>`
  updateNavBadges()
  renderStatsBadges()
}

export function isNavActive(nav, path) {
  if (nav === '/dashboard') return path === '/dashboard' || path === '/' || path === ''
  if (nav === '/admin') return path.startsWith('/admin')
  return path === nav || path.startsWith(`${nav}/`)
}

export function setActiveNav(path) {
  document.querySelectorAll('.nav-link[data-nav]').forEach((link) => {
    link.classList.toggle('active', isNavActive(link.dataset.nav, path))
  })
}


/* ── Router ─────────────────────────────────────────────────────────────── */
export async function route() {
  closeModal()
  stopTimers()
  if (!state.user) {
    renderAuth()
    return
  }
  const raw = location.hash.replace(/^#/, '') || '/dashboard'
  const [path, queryString] = raw.split('?')
  const parts = path.split('/').filter(Boolean)
  state.route = { path, query: new URLSearchParams(queryString || ''), parts }
  setActiveNav(path)

  if (parts[0] === 'admin') {
    if (state.user.role !== 'admin') {
      navigate('/dashboard')
      return
    }
    const section = parts[1] || 'overview'
    const valid = ['overview', 'principal', 'users', 'sessions', 'pairings', 'communities', 'audit', 'settings']
    return renderAdmin(valid.includes(section) ? section : 'overview')
  }

  switch (parts[0] || 'dashboard') {
    case 'dashboard':
      return renderDashboard()
    case 'bots':
      return renderBots()
    case 'link':
      return renderLinkPage()
    case 'communities':
      return renderCommunities()
    case 'account':
      return renderAccount()
    default:
      navigate('/dashboard')
  }
}
