/* Pain Panel — módulo core */

/* ==========================================================================
   Pain Panel — SPA sin dependencias
   Router por hash, sesiones con cookie HttpOnly + CSRF, polling de pairing.
   ========================================================================== */

export const app = document.getElementById('app')
export const modalRoot = document.getElementById('modal-root')
export const toastRoot = document.getElementById('toast-root')

// Versión de los recursos del panel. Si el servidor tiene otra, el navegador
// está con la copia vieja: se avisa para que recarguen.
export const PANEL_VERSION = '1.7.0'

export const state = {
  user: null,
  csrf: null,
  config: null,
  bots: [],
  route: { path: '/dashboard', query: new URLSearchParams(), parts: [] },
  authTab: 'login',
  pairing: null,
  pairingCode: null,
  pollTimer: null,
  pollId: null,
  countdownTimer: null,
  linkPrefill: null,
  botsFilter: '',
  adminUsers: [],
  adminSessions: [],
  adminPairings: [],
  adminAudit: [],
  adminSettings: null,
  adminRoles: [],
  adminPermissions: [],
  adminMail: null,
  adminCommunities: [],
  sessionFilter: 'all',
  selectedSessions: new Set(),
  botLimit: null,
  main: null,
  mainCode: null,
  mainPoll: null,
  impersonatedBy: null,
  stats: null,
  statsPoll: null,
  dashboardPoll: null,
}

/* ── Iconos (stroke, sin dependencias) ──────────────────────────────────── */
export const ICONS = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  bot: '<rect x="5" y="7" width="14" height="12" rx="3"/><path d="M12 3v4"/><path d="M9 11h.01M15 11h.01"/><path d="M9 15h6"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 0 0-7.07-7.07L10.9 5.03"/><path d="M14 11a5 5 0 0 0-7.07 0L4.81 13.12a5 5 0 0 0 7.07 7.07l1.22-1.22"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  shield: '<path d="M12 3 20 6v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3Z"/>',
  shieldCheck: '<path d="M12 3 20 6v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3Z"/><path d="m9 12 2 2 4-4"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 5.5a3.5 3.5 0 0 1 0 6.8"/><path d="M17.5 14.5A6.5 6.5 0 0 1 21.5 20"/>',
  server: '<rect x="3" y="4" width="18" height="6" rx="2"/><rect x="3" y="14" width="18" height="6" rx="2"/><path d="M7 7h.01M7 17h.01"/>',
  activity: '<path d="M3 12h4l2-7 4 14 2-7h6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.9 19.3a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.7 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.7 8.9a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.7h.09A1.7 1.7 0 0 0 10.1 3.14V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.3 9v.09a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1.03Z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  refresh: '<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m6 6 1 14h10l1-14"/><path d="M10 11v5M14 11v5"/>',
  rotate: '<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  alert: '<path d="M10.3 4.3 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/>',
  login: '<path d="M15 3h6v6M15 3l-6 6M9 21H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6"/><path d="M21 15H9"/>',
  userPlus: '<path d="M16 21v-2a4 4 0 0 0-4-4H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  key: '<circle cx="7.5" cy="15.5" r="3.5"/><path d="m10 13 8-8"/><path d="m15 4 5 5"/><path d="m17 6 2-2"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18"/><path d="M12 3a14 14 0 0 0 0 18"/>',
  cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3"/><rect x="9" y="9" width="6" height="6" rx="1"/>',
  wifi: '<path d="M5 12.5a10 10 0 0 1 14 0"/><path d="M8.5 16a5 5 0 0 1 7 0"/><path d="M12 20h.01"/><path d="M2 9a15 15 0 0 1 20 0"/>',
  external: '<path d="M14 3h7v7"/><path d="M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/>',
  eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/>',
  eyeOff: '<path d="m3 3 18 18"/><path d="M10.6 10.6A2.5 2.5 0 0 0 13.4 13.4"/><path d="M9.9 5.2A10.6 10.6 0 0 1 12 5c6.5 0 10 6 10 6a17.5 17.5 0 0 1-2.2 3.1"/><path d="M6.6 6.6A17.6 17.6 0 0 0 2 11s3.5 6 10 6a10.5 10.5 0 0 0 5.4-1.5"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  sparkles: '<path d="m12 3 1.2 3.3L16.5 7.5l-3.3 1.2L12 12l-1.2-3.3L7.5 7.5l3.3-1.2L12 3Z"/><path d="m19 13 .8 2.2L22 16l-2.2.8L19 19l-.8-2.2L16 16l2.2-.8L19 13Z"/><path d="m5 14 .9 2.1L8 17l-2.1.9L5 20l-.9-2.1L2 17l2.1-.9L5 14Z"/>',
  arrowRight: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>',
  pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>',
  filter: '<path d="M22 3H2l8 9.5V19l4 2v-8.5L22 3Z"/>',
  power: '<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.8 0"/>',
}

export function icon(name, cls = '') {
  const body = ICONS[name] || ICONS.info
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`
}

/* ── Utilidades ─────────────────────────────────────────────────────────── */
export const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export function h(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ESCAPES[char])
}

export function initials(name) {
  const clean = String(name || '?').trim()
  const parts = clean.split(/[\s._-]+/).filter(Boolean)
  if (parts.length >= 2) return h((parts[0][0] + parts[1][0]).toUpperCase())
  return h(clean.slice(0, 2).toUpperCase() || '?')
}

export function fmtPhone(phone) {
  const value = String(phone || '').replace(/\D/g, '')
  return value ? `+${value}` : '—'
}

export function fmtDate(ts, withTime = true) {
  if (!ts) return '—'
  const date = new Date(Number(ts))
  if (Number.isNaN(date.getTime())) return '—'
  const day = date.toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })
  if (!withTime) return day
  const time = date.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
  return `${day}, ${time}`
}

export function fmtRelative(ts) {
  if (!ts) return '—'
  const diff = Date.now() - Number(ts)
  if (diff < 0) return 'ahora'
  const seconds = Math.floor(diff / 1000)
  if (seconds < 45) return 'ahora'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hace ${hours} h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `hace ${days} d`
  return fmtDate(ts, false)
}

export function fmtUptime(seconds) {
  let total = Math.max(0, Math.floor(Number(seconds) || 0))
  const days = Math.floor(total / 86400)
  total %= 86400
  const hours = Math.floor(total / 3600)
  total %= 3600
  const minutes = Math.floor(total / 60)
  if (days) return `${days}d ${hours}h`
  if (hours) return `${hours}h ${minutes}m`
  if (minutes) return `${minutes}m`
  return `${total}s`
}

export const STATUS = {
  connected: { label: 'Conectado', cls: 'success' },
  linked: { label: 'Vinculado', cls: 'info' },
  relink: { label: 'Re-vincular', cls: 'warn' },
  pairing: { label: 'Vinculando', cls: 'accent' },
  pending: { label: 'Pendiente', cls: 'neutral' },
  missing: { label: 'Sin archivos', cls: 'danger' },
  unknown: { label: 'Desconocido', cls: 'neutral' },
  code_ready: { label: 'Código listo', cls: 'accent' },
  expired: { label: 'Expirado', cls: 'warn' },
  error: { label: 'Error', cls: 'danger' },
  cancelled: { label: 'Cancelado', cls: 'neutral' },
  active: { label: 'Activo', cls: 'success' },
  banned: { label: 'Bloqueado', cls: 'danger' },
  admin: { label: 'Admin', cls: 'accent' },
  user: { label: 'Usuario', cls: 'neutral' },
}

export function badge(status) {
  const meta = STATUS[status] || { label: status || '—', cls: 'neutral' }
  return `<span class="badge ${meta.cls}"><span class="dot"></span>${h(meta.label)}</span>`
}

export function roleBadge(role, roleName = '') {
  const admin = role === 'admin'
  const label = roleName || (admin ? 'Administrador' : 'Usuario')
  return `<span class="badge ${admin ? 'accent' : 'neutral'}"><span class="dot"></span>${h(label)}</span>`
}

/** Permisos del usuario actual (el principal siempre puede todo). */
export function puede(permiso) {
  const user = state.user
  if (!user) return false
  if (user.isPrincipal) return true
  const permisos = Array.isArray(user.permissions) ? user.permissions : []
  if (permisos.includes('*') || permisos.includes(permiso)) return true
  // Los administradores también pueden usar las funciones normales de usuario.
  if (!String(permiso).startsWith('admin.') && permisos.includes('admin.access')) return true
  return false
}

export function esPrincipal() {
  return Boolean(state.user?.isPrincipal)
}

export function statusIconTone(status) {
  if (status === 'connected') return 'green'
  if (status === 'relink') return 'amber'
  if (status === 'missing') return 'red'
  if (status === 'pairing') return 'cyan'
  return ''
}

export function isLinkRoute() {
  return state.route.parts[0] === 'link'
}

export function isAdminRoute(section) {
  return state.route.parts[0] === 'admin' && (state.route.parts[1] || 'overview') === section
}

export function content(html) {
  const el = document.getElementById('content')
  if (el) el.innerHTML = html
}

export function setPage(title, subtitle = '') {
  const titleEl = document.getElementById('page-title')
  const subEl = document.getElementById('page-sub')
  if (titleEl) titleEl.textContent = title
  if (subEl) subEl.textContent = subtitle
  document.title = `${title} · ${state.config?.brandName || 'PAIN BOT MD'}`
}

export function navigate(path) {
  const hash = `#${path}`
  if (location.hash === hash) {
    window.dispatchEvent(new Event('hashchange'))
    return
  }
  location.hash = hash
}

export function applyRowFilter(selector, query) {
  const q = String(query || '').trim().toLowerCase()
  document.querySelectorAll(selector).forEach((row) => {
    row.style.display = !q || String(row.dataset.search || '').includes(q) ? '' : 'none'
  })
}

export function attachRowFilter(inputSelector, rowSelector) {
  const input = document.querySelector(inputSelector)
  if (!input) return
  const apply = () => applyRowFilter(rowSelector, input.value)
  input.addEventListener('input', apply)
  apply()
}

export function copyText(text) {
  const value = String(text || '')
  if (!value) return
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(value)
      .then(() => showToast('Copiado al portapapeles.', 'success'))
      .catch(() => fallbackCopy(value))
    return
  }
  fallbackCopy(value)
}

export function fallbackCopy(value) {
  try {
    const area = document.createElement('textarea')
    area.value = value
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    document.execCommand('copy')
    area.remove()
    showToast('Copiado al portapapeles.', 'success')
  } catch {
    showToast('No se pudo copiar.', 'error')
  }
}

export function showToast(message, type = 'info', ms = 4200) {
  if (!toastRoot) return
  while (toastRoot.children.length >= 4) toastRoot.firstElementChild?.remove()
  const el = document.createElement('div')
  el.className = `toast ${type}`
  const iconName = type === 'success' ? 'check' : type === 'error' || type === 'warn' ? 'alert' : 'info'
  el.innerHTML = `${icon(iconName)}<span>${h(message)}</span><button class="toast-close" data-action="close-toast" aria-label="Cerrar">${icon('x')}</button>`
  toastRoot.appendChild(el)
  const timer = setTimeout(() => el.remove(), ms)
  el.querySelector('.toast-close')?.addEventListener('click', () => {
    clearTimeout(timer)
    el.remove()
  })
}

export function setLoading(button, loading, label = 'Procesando…') {
  if (!button) return
  if (loading) {
    if (!button.dataset.original) button.dataset.original = button.innerHTML
    button.disabled = true
    button.innerHTML = `<span class="boot-spinner" style="width:16px;height:16px;border-width:2px"></span><span>${h(label)}</span>`
  } else {
    button.disabled = false
    if (button.dataset.original) {
      button.innerHTML = button.dataset.original
      delete button.dataset.original
    }
  }
}

export function showFormError(form, message) {
  const box = form.querySelector('.form-error')
  if (box) {
    const span = box.querySelector('span')
    if (span) span.textContent = message
    else box.textContent = message
    box.classList.add('show')
  } else {
    showToast(message, 'error')
  }
}

export function hideFormError(form) {
  form.querySelector('.form-error')?.classList.remove('show')
}

export function showFormSuccess(form, message) {
  const box = form.querySelector('.form-success')
  if (!box) return
  const span = box.querySelector('span')
  if (span) span.textContent = message
  else box.textContent = message
  box.classList.add('show')
}

export function hideFormSuccess(form) {
  form.querySelector('.form-success')?.classList.remove('show')
}


/* ── Timer helpers ──────────────────────────────────────────────────────── */
export function stopPairingPolling() {
  if (state.pollTimer) clearInterval(state.pollTimer)
  state.pollTimer = null
  state.pollId = null
}

export function stopCountdown() {
  if (state.countdownTimer) clearInterval(state.countdownTimer)
  state.countdownTimer = null
}

export function stopTimers() {
  stopPairingPolling()
  stopCountdown()
  // El polling de stats es global (landing y topbar): no se detiene al
  // navegar entre páginas. iniciarPollingStats() se encarga de no duplicarlo.
  if (state.dashboardPoll) {
    clearInterval(state.dashboardPoll)
    state.dashboardPoll = null
  }
  if (state.mainPoll) {
    clearInterval(state.mainPoll)
    state.mainPoll = null
  }
}

/* ── Toasts / modales ───────────────────────────────────────────────────── */
export function openModal({ title, subtitle = '', body, footer = '', wide = false, onMount }) {
  if (!modalRoot) return
  modalRoot.innerHTML = `
    <div class="modal-backdrop" data-action="modal-close"></div>
    <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${h(title)}">
      <div class="modal-head">
        <div><h3>${h(title)}</h3>${subtitle ? `<p>${h(subtitle)}</p>` : ''}</div>
        <button class="icon-btn sm" data-action="modal-close" aria-label="Cerrar">${icon('x')}</button>
      </div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
    </div>`
  modalRoot.classList.add('open')
  onMount?.(modalRoot)
}

export function closeModal() {
  if (!modalRoot) return
  modalRoot.classList.remove('open')
  modalRoot.innerHTML = ''
  state.turnstileToken = ''
  state.turnstileWidget = null
}

export function confirmModal({ title, message, confirmLabel = 'Confirmar', danger = true, onConfirm }) {
  openModal({
    title,
    body: `<p class="muted" style="margin:0;font-size:12.5px;line-height:1.65">${message}</p>`,
    footer: `<button class="btn btn-ghost" data-action="modal-close">Cancelar</button>
      <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="confirm-action">${h(confirmLabel)}</button>`,
    onMount(root) {
      const button = root.querySelector('#confirm-action')
      button?.addEventListener('click', async () => {
        setLoading(button, true, 'Procesando…')
        try {
          await onConfirm()
          closeModal()
        } catch (error) {
          setLoading(button, false)
          showToast(error.message || 'No se pudo completar la acción.', 'error')
        }
      })
    },
  })
}

export function updateNavBadges() {
  const el = document.getElementById('nav-bots-count')
  if (!el) return
  const count = state.bots.length
  el.textContent = String(count)
  el.style.display = count ? '' : 'none'
}

/* ── Widgets compartidos ────────────────────────────────────────────────── */
export function statCard(label, value, iconName, tone = 'accent', foot = '') {
  return `<div class="stat stat-${tone}">
    <div class="stat-top"><div class="stat-icon">${icon(iconName)}</div></div>
    <div class="stat-value">${h(value)}</div>
    <div class="stat-label">${h(label)}</div>
    ${foot ? `<div class="stat-foot">${foot}</div>` : ''}
  </div>`
}

export function emptyState(iconName, title, text, action = '') {
  return `<div class="empty">
    <div class="empty-icon">${icon(iconName)}</div>
    <h4>${h(title)}</h4>
    <p>${h(text)}</p>
    ${action}
  </div>`
}

export function loadingPage(label = 'Cargando…') {
  return `<div class="page-head"><div><h2>${h(label)}</h2><p>Un momento…</p></div></div>
    <div class="stats">${'<div class="skeleton sk-card"></div>'.repeat(4)}</div>
    <div class="card"><div class="card-body">
      <div class="skeleton sk-line" style="width:38%"></div>
      <div class="skeleton sk-line" style="width:72%"></div>
      <div class="skeleton sk-line" style="width:55%"></div>
    </div></div>`
}

export function loadingBlock() {
  return `<div class="stats">${'<div class="skeleton sk-card"></div>'.repeat(4)}</div>
    <div class="card"><div class="card-body">
      <div class="skeleton sk-line" style="width:38%"></div>
      <div class="skeleton sk-line" style="width:72%"></div>
      <div class="skeleton sk-line" style="width:55%"></div>
    </div></div>`
}

export function errorPage(message) {
  return `<div class="card"><div class="empty">
    <div class="empty-icon">${icon('alert')}</div>
    <h4>No se pudo cargar</h4>
    <p>${h(message || 'Intenta de nuevo en unos segundos.')}</p>
    <button class="btn btn-secondary" data-action="refresh">${icon('refresh')} Reintentar</button>
  </div></div>`
}
