/* ==========================================================================
   Pain Panel — SPA sin dependencias
   Router por hash, sesiones con cookie HttpOnly + CSRF, polling de pairing.
   ========================================================================== */
'use strict'

const app = document.getElementById('app')
const modalRoot = document.getElementById('modal-root')
const toastRoot = document.getElementById('toast-root')

const state = {
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
}

/* ── Iconos (stroke, sin dependencias) ──────────────────────────────────── */
const ICONS = {
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

function icon(name, cls = '') {
  const body = ICONS[name] || ICONS.info
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`
}

/* ── Utilidades ─────────────────────────────────────────────────────────── */
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
function h(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ESCAPES[char])
}

function initials(name) {
  const clean = String(name || '?').trim()
  const parts = clean.split(/[\s._-]+/).filter(Boolean)
  if (parts.length >= 2) return h((parts[0][0] + parts[1][0]).toUpperCase())
  return h(clean.slice(0, 2).toUpperCase() || '?')
}

function fmtPhone(phone) {
  const value = String(phone || '').replace(/\D/g, '')
  return value ? `+${value}` : '—'
}

function fmtDate(ts, withTime = true) {
  if (!ts) return '—'
  const date = new Date(Number(ts))
  if (Number.isNaN(date.getTime())) return '—'
  const day = date.toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })
  if (!withTime) return day
  const time = date.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
  return `${day}, ${time}`
}

function fmtRelative(ts) {
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

function fmtUptime(seconds) {
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

const STATUS = {
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

function badge(status) {
  const meta = STATUS[status] || { label: status || '—', cls: 'neutral' }
  return `<span class="badge ${meta.cls}"><span class="dot"></span>${h(meta.label)}</span>`
}

function roleBadge(role) {
  return role === 'admin'
    ? '<span class="badge accent"><span class="dot"></span>Administrador</span>'
    : '<span class="badge neutral"><span class="dot"></span>Usuario</span>'
}

function statusIconTone(status) {
  if (status === 'connected') return 'green'
  if (status === 'relink') return 'amber'
  if (status === 'missing') return 'red'
  if (status === 'pairing') return 'cyan'
  return ''
}

function isLinkRoute() {
  return state.route.parts[0] === 'link'
}

function isAdminRoute(section) {
  return state.route.parts[0] === 'admin' && (state.route.parts[1] || 'overview') === section
}

function content(html) {
  const el = document.getElementById('content')
  if (el) el.innerHTML = html
}

function setPage(title, subtitle = '') {
  const titleEl = document.getElementById('page-title')
  const subEl = document.getElementById('page-sub')
  if (titleEl) titleEl.textContent = title
  if (subEl) subEl.textContent = subtitle
  document.title = `${title} · ${state.config?.brandName || 'Pain Panel'}`
}

function navigate(path) {
  const hash = `#${path}`
  if (location.hash === hash) {
    route()
    return
  }
  location.hash = hash
}

function applyRowFilter(selector, query) {
  const q = String(query || '').trim().toLowerCase()
  document.querySelectorAll(selector).forEach((row) => {
    row.style.display = !q || String(row.dataset.search || '').includes(q) ? '' : 'none'
  })
}

function attachRowFilter(inputSelector, rowSelector) {
  const input = document.querySelector(inputSelector)
  if (!input) return
  const apply = () => applyRowFilter(rowSelector, input.value)
  input.addEventListener('input', apply)
  apply()
}

function copyText(text) {
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

function fallbackCopy(value) {
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

function showToast(message, type = 'info', ms = 4200) {
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

function setLoading(button, loading, label = 'Procesando…') {
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

function showFormError(form, message) {
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

function hideFormError(form) {
  form.querySelector('.form-error')?.classList.remove('show')
}

function showFormSuccess(form, message) {
  const box = form.querySelector('.form-success')
  if (!box) return
  const span = box.querySelector('span')
  if (span) span.textContent = message
  else box.textContent = message
  box.classList.add('show')
}

function hideFormSuccess(form) {
  form.querySelector('.form-success')?.classList.remove('show')
}

/* ── Cliente HTTP ───────────────────────────────────────────────────────── */
async function request(method, path, body, options = {}) {
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
    if (response.status === 401 && !path.startsWith('/api/auth/')) handleSessionExpired()
    throw error
  }
  return data ?? {}
}

const api = {
  get: (path) => request('GET', path, undefined, { csrf: false }),
  post: (path, body) => request('POST', path, body ?? {}),
  patch: (path, body) => request('PATCH', path, body ?? {}),
  del: (path) => request('DELETE', path),
}

/* ── Timer helpers ──────────────────────────────────────────────────────── */
function stopPairingPolling() {
  if (state.pollTimer) clearInterval(state.pollTimer)
  state.pollTimer = null
  state.pollId = null
}

function stopCountdown() {
  if (state.countdownTimer) clearInterval(state.countdownTimer)
  state.countdownTimer = null
}

function stopTimers() {
  stopPairingPolling()
  stopCountdown()
}

/* ── Toasts / modales ───────────────────────────────────────────────────── */
function openModal({ title, subtitle = '', body, footer = '', wide = false, onMount }) {
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

function closeModal() {
  if (!modalRoot) return
  modalRoot.classList.remove('open')
  modalRoot.innerHTML = ''
}

function confirmModal({ title, message, confirmLabel = 'Confirmar', danger = true, onConfirm }) {
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

/* ── Sesión expirada ────────────────────────────────────────────────────── */
function handleSessionExpired() {
  if (!state.user) return
  state.user = null
  state.csrf = null
  state.bots = []
  state.pairing = null
  state.pairingCode = null
  stopTimers()
  closeModal()
  renderAuth()
  showToast('Tu sesión expiró. Inicia sesión de nuevo.', 'warn')
}

/* ── Login / registro ───────────────────────────────────────────────────── */
function renderAuth() {
  stopTimers()
  closeModal()
  if (!app) return
  const cfg = state.config || {}
  const brand = cfg.brandName || 'Pain Bot'
  const allowRegistration = cfg.allowRegistration !== false
  if (!allowRegistration && state.authTab === 'register') state.authTab = 'login'
  const tab = state.authTab
  const publicUrl = cfg.publicUrl || ''

  document.title = `Acceso · ${brand}`
  app.innerHTML = `
    <div class="auth-shell">
      <section class="auth-brand">
        <div class="brand">
          <div class="brand-mark">${icon('zap')}</div>
          <div>
            <div class="brand-name">${h(brand)}</div>
            <div class="brand-sub">Control panel</div>
          </div>
        </div>
        <div class="auth-hero">
          <div class="auth-kicker"><span class="dot"></span> Panel de sub-bots</div>
          <h1 class="auth-title">Tus sub-bots,<br><span class="grad">bajo control.</span></h1>
          <p class="auth-lead">Vincula números de WhatsApp, revisa el estado de cada sesión y administra todo desde un solo lugar. Sin comandos, sin complicaciones.</p>
          <ul class="auth-features">
            <li><span class="fi">${icon('link')}</span><div><b>Vinculación desde la web</b><span>Genera el código y conéctalo desde WhatsApp en segundos.</span></div></li>
            <li><span class="fi">${icon('activity')}</span><div><b>Estado en tiempo real</b><span>Conectado, vinculado o necesita re-vincularse: siempre visible.</span></div></li>
            <li><span class="fi">${icon('shieldCheck')}</span><div><b>Panel administrador</b><span>Usuarios, sesiones, límites y auditoría con permisos separados.</span></div></li>
          </ul>
          <div class="auth-meta">
            <span>${h(publicUrl.replace(/^https?:\/\//, '') || 'Panel privado')}</span>
            <span class="sep"></span>
            <span>v${h(cfg.version || '1.0.0')}</span>
          </div>
        </div>
      </section>
      <section class="auth-pane">
        <div class="auth-card">
          <div class="auth-card-head">
            <h2>${tab === 'login' ? 'Bienvenido de vuelta' : 'Crea tu cuenta'}</h2>
            <p>${tab === 'login' ? 'Ingresa para administrar tus sub-bots.' : 'Regístrate para vincular tu primer número.'}</p>
          </div>
          ${allowRegistration ? `<div class="auth-tabs">
            <button class="auth-tab ${tab === 'login' ? 'active' : ''}" data-action="auth-tab" data-tab="login">Iniciar sesión</button>
            <button class="auth-tab ${tab === 'register' ? 'active' : ''}" data-action="auth-tab" data-tab="register">Registrarse</button>
          </div>` : ''}
          <form id="auth-form" data-mode="${tab}">
            <div class="form-error">${icon('alert')}<span></span></div>
            <div class="field">
              <label class="label" for="auth-username">Usuario</label>
              <div class="input-icon">${icon('user')}<input class="input" id="auth-username" name="username" autocomplete="username" placeholder="tu_usuario" required minlength="3" maxlength="32" /></div>
            </div>
            ${tab === 'register' ? `<div class="field">
              <label class="label" for="auth-email">Correo <span class="muted">(opcional)</span></label>
              <div class="input-icon">${icon('mail')}<input class="input" id="auth-email" name="email" type="email" autocomplete="email" placeholder="tu@correo.com" /></div>
            </div>` : ''}
            <div class="field">
              <label class="label" for="auth-password">Contraseña</label>
              <div class="input-icon">
                ${icon('lock')}
                <input class="input" id="auth-password" name="password" type="password" autocomplete="${tab === 'login' ? 'current-password' : 'new-password'}" placeholder="••••••••" required ${tab === 'register' ? 'minlength="8"' : ''} />
                <button type="button" class="icon-btn sm" data-action="toggle-password" data-input="auth-password" style="position:absolute;right:5px;top:5px;border:0;background:transparent" aria-label="Mostrar contraseña">${icon('eye')}</button>
              </div>
            </div>
            ${tab === 'register' ? `<div class="field">
              <label class="label" for="auth-confirm">Confirmar contraseña</label>
              <div class="input-icon">${icon('lock')}<input class="input" id="auth-confirm" name="confirm" type="password" autocomplete="new-password" placeholder="••••••••" required minlength="8" /></div>
            </div>` : ''}
            ${tab === 'register' && cfg.requireInvite ? `<div class="field">
              <label class="label" for="auth-invite">Código de invitación</label>
              <div class="input-icon">${icon('key')}<input class="input" id="auth-invite" name="invite" placeholder="Código de acceso" required /></div>
            </div>` : ''}
            <button class="btn btn-primary btn-block auth-submit" type="submit">${tab === 'login' ? 'Entrar al panel' : 'Crear cuenta'} ${icon('arrowRight')}</button>
            <div class="auth-legal">Conexión cifrada · Sesiones protegidas con cookies HttpOnly</div>
          </form>
        </div>
      </section>
    </div>`
}

/* ── Shell principal ────────────────────────────────────────────────────── */
function navLink(path, iconName, label, options = {}) {
  const nav = options.nav || path
  return `<a class="nav-link" href="#${path}" data-nav="${nav}">
    ${icon(iconName)}<span>${h(label)}</span>${options.badge ? `<span class="nav-badge" id="${options.badgeId || ''}">${h(options.badge)}</span>` : ''}
  </a>`
}

function renderShell() {
  if (!app || !state.user) return
  const cfg = state.config || {}
  const user = state.user
  const isAdmin = user.role === 'admin'
  const publicUrl = cfg.publicUrl || ''

  document.title = `${cfg.brandName || 'Pain Panel'} · Panel`
  app.innerHTML = `
    <div class="app-shell" id="app-shell">
      <aside class="sidebar">
        <div class="sidebar-brand">
          <div class="brand">
            <div class="brand-mark">${icon('zap')}</div>
            <div><div class="brand-name">${h(cfg.brandName || 'Pain Bot')}</div><div class="brand-sub">Panel de control</div></div>
          </div>
        </div>
        <nav class="nav">
          ${navLink('/dashboard', 'grid', 'Dashboard')}
          ${navLink('/bots', 'bot', 'Mis bots', { badge: state.bots.length || '', badgeId: 'nav-bots-count' })}
          ${navLink('/link', 'link', 'Vincular bot')}
          <div class="nav-section">Cuenta</div>
          ${navLink('/account', 'user', 'Mi cuenta')}
          ${isAdmin ? `<div class="nav-section">Administración</div>${navLink('/admin/overview', 'shield', 'Administración', { nav: '/admin' })}` : ''}
        </nav>
        <div class="sidebar-foot">
          <div class="hint">Panel público</div>
          <div class="public-url">${icon('globe')}<span>${h(publicUrl.replace(/^https?:\/\//, '') || '—')}</span></div>
        </div>
      </aside>
      <div class="sidebar-overlay" data-action="close-sidebar"></div>
      <main class="main">
        <header class="topbar">
          <button class="icon-btn mobile-only" data-action="toggle-sidebar" aria-label="Abrir menú">${icon('menu')}</button>
          <div class="topbar-title">
            <h1 id="page-title">Dashboard</h1>
            <p id="page-sub">Resumen de tu cuenta</p>
          </div>
          <div class="topbar-actions">
            <button class="icon-btn" data-action="refresh" title="Actualizar">${icon('refresh')}</button>
            <div class="user-chip">
              <div class="avatar">${initials(user.username)}</div>
              <div><div class="uc-name">${h(user.username)}</div><div class="uc-role">${isAdmin ? 'Administrador' : 'Usuario'}</div></div>
            </div>
            <button class="icon-btn danger" data-action="logout" title="Cerrar sesión">${icon('logout')}</button>
          </div>
        </header>
        <div class="content" id="content"></div>
      </main>
    </div>`
  updateNavBadges()
}

function isNavActive(nav, path) {
  if (nav === '/dashboard') return path === '/dashboard' || path === '/' || path === ''
  if (nav === '/admin') return path.startsWith('/admin')
  return path === nav || path.startsWith(`${nav}/`)
}

function setActiveNav(path) {
  document.querySelectorAll('.nav-link[data-nav]').forEach((link) => {
    link.classList.toggle('active', isNavActive(link.dataset.nav, path))
  })
}

function updateNavBadges() {
  const el = document.getElementById('nav-bots-count')
  if (!el) return
  const count = state.bots.length
  el.textContent = String(count)
  el.style.display = count ? '' : 'none'
}

/* ── Router ─────────────────────────────────────────────────────────────── */
async function route() {
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
    const valid = ['overview', 'users', 'sessions', 'pairings', 'audit', 'settings']
    return renderAdmin(valid.includes(section) ? section : 'overview')
  }

  switch (parts[0] || 'dashboard') {
    case 'dashboard':
      return renderDashboard()
    case 'bots':
      return renderBots()
    case 'link':
      return renderLinkPage()
    case 'account':
      return renderAccount()
    default:
      navigate('/dashboard')
  }
}

/* ── Widgets compartidos ────────────────────────────────────────────────── */
function statCard(label, value, iconName, tone = 'violet', foot = '') {
  const tones = {
    violet: ['#c4b5fd', 'rgba(139,92,246,.13)', 'rgba(139,92,246,.22)', 'rgba(139,92,246,.16)'],
    green: ['#86efac', 'rgba(34,197,94,.12)', 'rgba(34,197,94,.22)', 'rgba(34,197,94,.15)'],
    cyan: ['#a5f3fc', 'rgba(6,182,212,.12)', 'rgba(6,182,212,.22)', 'rgba(6,182,212,.15)'],
    amber: ['#fde68a', 'rgba(245,158,11,.12)', 'rgba(245,158,11,.22)', 'rgba(245,158,11,.14)'],
    red: ['#fecaca', 'rgba(239,68,68,.12)', 'rgba(239,68,68,.22)', 'rgba(239,68,68,.14)'],
  }
  const [color, bg, line, glow] = tones[tone] || tones.violet
  return `<div class="stat" style="--stat-color:${color};--stat-bg:${bg};--stat-line:${line};--stat-glow:${glow}">
    <div class="stat-top"><div class="stat-icon">${icon(iconName)}</div></div>
    <div class="stat-value">${h(value)}</div>
    <div class="stat-label">${h(label)}</div>
    ${foot ? `<div class="stat-foot">${foot}</div>` : ''}
  </div>`
}

function emptyState(iconName, title, text, action = '') {
  return `<div class="empty">
    <div class="empty-icon">${icon(iconName)}</div>
    <h4>${h(title)}</h4>
    <p>${h(text)}</p>
    ${action}
  </div>`
}

function loadingPage(label = 'Cargando…') {
  return `<div class="page-head"><div><h2>${h(label)}</h2><p>Un momento…</p></div></div>
    <div class="stats">${'<div class="skeleton sk-card"></div>'.repeat(4)}</div>
    <div class="card"><div class="card-body">
      <div class="skeleton sk-line" style="width:38%"></div>
      <div class="skeleton sk-line" style="width:72%"></div>
      <div class="skeleton sk-line" style="width:55%"></div>
    </div></div>`
}

function loadingBlock() {
  return `<div class="stats">${'<div class="skeleton sk-card"></div>'.repeat(4)}</div>
    <div class="card"><div class="card-body">
      <div class="skeleton sk-line" style="width:38%"></div>
      <div class="skeleton sk-line" style="width:72%"></div>
      <div class="skeleton sk-line" style="width:55%"></div>
    </div></div>`
}

function errorPage(message) {
  return `<div class="card"><div class="empty">
    <div class="empty-icon">${icon('alert')}</div>
    <h4>No se pudo cargar</h4>
    <p>${h(message || 'Intenta de nuevo en unos segundos.')}</p>
    <button class="btn btn-secondary" data-action="refresh">${icon('refresh')} Reintentar</button>
  </div></div>`
}

/* ── Bots del usuario ───────────────────────────────────────────────────── */
async function loadBots() {
  const data = await api.get('/api/bots')
  state.bots = Array.isArray(data.bots) ? data.bots : []
  updateNavBadges()
  return state.bots
}

function botRow(bot) {
  const label = bot.label || fmtPhone(bot.phone)
  const sub = bot.label ? fmtPhone(bot.phone) : 'WhatsApp'
  const canReconnect = ['linked', 'connected', 'unknown', 'missing'].includes(bot.status)
  const search = `${bot.phone} ${bot.label || ''} ${bot.status}`.toLowerCase()
  return `<tr data-bot-row data-search="${h(search)}">
    <td><div class="cell-main">
      <div class="row-icon ${statusIconTone(bot.status)}">${icon('bot')}</div>
      <div class="grow"><div class="cell-title">${h(label)}</div><div class="cell-sub">${h(sub)}</div></div>
    </div></td>
    <td>${badge(bot.status)}</td>
    <td>${bot.worker ? `<span class="mono tiny muted">${h(bot.worker)}</span>` : '<span class="tiny muted">—</span>'}</td>
    <td><span class="tiny muted">${fmtDate(bot.linked_at)}</span></td>
    <td><div class="actions">
      <button class="icon-btn sm" data-action="bot-reconnect" data-phone="${h(bot.phone)}" title="Reconectar" ${canReconnect ? '' : 'disabled'}>${icon('rotate')}</button>
      <button class="icon-btn sm" data-action="bot-relink" data-phone="${h(bot.phone)}" title="Re-vincular">${icon('link')}</button>
      <button class="icon-btn sm" data-action="bot-rename" data-phone="${h(bot.phone)}" data-label="${h(bot.label || '')}" title="Renombrar">${icon('pencil')}</button>
      <button class="icon-btn sm danger" data-action="bot-delete" data-phone="${h(bot.phone)}" data-label="${h(label)}" title="Eliminar">${icon('trash')}</button>
    </div></td>
  </tr>`
}

function botsTable(bots, limit = 0) {
  if (!bots.length) {
    return emptyState(
      'bot',
      'Sin sub-bots todavía',
      'Vincula tu primer número de WhatsApp y empieza a usar el bot desde la web.',
      `<a class="btn btn-primary" href="#/link">${icon('plus')} Vincular mi primer bot</a>`
    )
  }
  const list = limit ? bots.slice(0, limit) : bots
  return `<div class="table-wrap"><table class="table">
    <thead><tr><th>Bot</th><th>Estado</th><th>Worker</th><th>Vinculado</th><th class="right">Acciones</th></tr></thead>
    <tbody>${list.map(botRow).join('')}</tbody>
  </table></div>
  ${limit && bots.length > limit ? `<div style="padding:12px 18px;border-top:1px solid var(--line);text-align:right"><a class="btn btn-ghost btn-sm" href="#/bots">Ver los ${bots.length} bots ${icon('chevronRight')}</a></div>` : ''}`
}

/* ── Dashboard ──────────────────────────────────────────────────────────── */
async function renderDashboard() {
  setPage('Dashboard', 'Resumen de tu cuenta y tus sub-bots')
  content(loadingPage('Cargando tu dashboard…'))
  try {
    await loadBots()
  } catch (error) {
    content(errorPage(error.message))
    return
  }
  const bots = state.bots
  const total = bots.length
  const connected = bots.filter((bot) => bot.status === 'connected').length
  const relink = bots.filter((bot) => bot.status === 'relink').length
  const pending = bots.filter((bot) => ['pairing', 'pending'].includes(bot.status)).length
  const maxSubs = Number(state.config?.maxSubs || 0)
  const slots = maxSubs > 0 ? `${total}/${maxSubs}` : 'Ilimitado'
  const publicUrl = state.config?.publicUrl || ''

  content(`
    <div class="page-head">
      <div><h2>Hola, ${h(state.user.username)}</h2><p>Este es el estado de tus sub-bots y tu cuenta.</p></div>
      <div class="page-actions">
        <a class="btn btn-secondary" href="#/bots">${icon('bot')} Ver todos</a>
        <a class="btn btn-primary" href="#/link">${icon('plus')} Vincular bot</a>
      </div>
    </div>
    <div class="stats">
      ${statCard('Sub-bots', total, 'bot', 'violet')}
      ${statCard('Conectados', connected, 'wifi', 'green')}
      ${statCard('Requieren atención', relink, 'alert', 'amber')}
      ${statCard('Plazas', slots, 'server', 'cyan', `<span>${maxSubs > 0 ? 'Límite del servidor' : 'Sin límite configurado'}</span>`)}
    </div>
    <div class="grid-2">
      <div class="stack">
        <div class="card">
          <div class="card-head">
            <div><h3>Tus bots</h3><p>${total ? `${total} sesión(es) registrada(s)` : 'Aún no has vinculado ningún número'}</p></div>
            <a class="btn btn-ghost btn-sm" href="#/bots">Gestionar ${icon('chevronRight')}</a>
          </div>
          <div class="card-body tight">${botsTable(bots, 5)}</div>
        </div>
        ${pending ? `<div class="card"><div class="card-body">
          <div class="flex items-center gap-12">
            <div class="row-icon cyan">${icon('link')}</div>
            <div class="grow"><div class="cell-title">Vinculación en curso</div><div class="cell-sub">Tienes ${pending} sesión(es) esperando código o confirmación.</div></div>
            <a class="btn btn-secondary btn-sm" href="#/link">Continuar</a>
          </div>
        </div></div>` : ''}
      </div>
      <div class="stack">
        <div class="card">
          <div class="card-head"><div><h3>Acceso rápido</h3><p>Tu panel público</p></div><span class="badge success"><span class="dot"></span>En línea</span></div>
          <div class="card-body">
            <div class="field">
              <label class="label">URL del panel</label>
              <div class="input-group">
                <input class="input mono" readonly value="${h(publicUrl)}" />
                <button class="btn btn-secondary" data-action="copy" data-copy="${h(publicUrl)}" title="Copiar">${icon('copy')}</button>
              </div>
              <div class="hint">Comparte esta dirección con tus usuarios. El subdominio se configura en <span class="mono">config.js</span>.</div>
            </div>
            <div class="field">
              <label class="label">Cuenta</label>
              <div class="system-grid">
                <div class="system-item"><div class="si-label">Usuario</div><div class="si-value" style="font-size:13px">${h(state.user.username)}</div></div>
                <div class="system-item"><div class="si-label">Rol</div><div class="si-value" style="font-size:13px">${state.user.role === 'admin' ? 'Administrador' : 'Usuario'}</div></div>
              </div>
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-head"><div><h3>Primeros pasos</h3><p>Vincula en menos de un minuto</p></div></div>
          <div class="card-body">
            <ol class="steps">
              <li><span class="step-num">1</span><div><b>Abre WhatsApp</b><span>Entra en <span class="kbd">Dispositivos vinculados</span> y elige vincular con número de teléfono.</span></div></li>
              <li><span class="step-num">2</span><div><b>Genera el código</b><span>Escribe tu número en el panel y copia el código de 8 caracteres.</span></div></li>
              <li><span class="step-num">3</span><div><b>Confirma</b><span>Ingresa el código en WhatsApp. La sesión aparecerá conectada automáticamente.</span></div></li>
            </ol>
            <a class="btn btn-primary btn-block" href="#/link" style="margin-top:16px">${icon('link')} Empezar vinculación</a>
          </div>
        </div>
      </div>
    </div>`)
}

/* ── Mis bots ───────────────────────────────────────────────────────────── */
async function renderBots() {
  setPage('Mis bots', 'Administra las sesiones de WhatsApp vinculadas a tu cuenta')
  content(loadingPage('Cargando tus bots…'))
  try {
    await loadBots()
  } catch (error) {
    content(errorPage(error.message))
    return
  }
  const bots = state.bots
  content(`
    <div class="page-head">
      <div><h2>Mis bots</h2><p>${bots.length} sesión(es) vinculada(s) a tu cuenta.</p></div>
      <div class="page-actions">
        <button class="btn btn-secondary" data-action="refresh">${icon('refresh')} Actualizar</button>
        <a class="btn btn-primary" href="#/link">${icon('plus')} Vincular bot</a>
      </div>
    </div>
    <div class="card">
      <div class="card-head">
        <div><h3>Sesiones</h3><p>Estado actual de cada sub-bot</p></div>
        <div class="input-icon" style="max-width:290px;width:100%">
          ${icon('search')}
          <input id="bots-search" class="input" placeholder="Buscar por número o nombre…" value="${h(state.botsFilter)}" />
        </div>
      </div>
      <div class="card-body tight">${botsTable(bots)}</div>
    </div>`)
  attachRowFilter('#bots-search', '[data-bot-row]')
}

/* ── Vincular bot ───────────────────────────────────────────────────────── */
function stepsCardHTML() {
  return `<div class="card">
    <div class="card-head"><div><h3>Cómo vincular</h3><p>Sigue estos pasos en tu teléfono</p></div></div>
    <div class="card-body">
      <ol class="steps">
        <li><span class="step-num">1</span><div><b>Abre WhatsApp</b><span>Ve a <span class="kbd">Ajustes</span> → <span class="kbd">Dispositivos vinculados</span> → <span class="kbd">Vincular un dispositivo</span>.</span></div></li>
        <li><span class="step-num">2</span><div><b>Elige "Vincular con número"</b><span>Ingresa el número tal como lo escribiste en el panel.</span></div></li>
        <li><span class="step-num">3</span><div><b>Escribe el código</b><span>Copia el código de 8 caracteres y confírmalo. La sesión aparecerá conectada.</span></div></li>
      </ol>
      <div class="pairing-alert" style="margin-top:18px">${icon('shield')}<div><b>Seguridad:</b> nunca compartas el código. Caduca rápido y permite vincular tu WhatsApp.</div></div>
    </div>
  </div>`
}

function linkFormHTML() {
  const phone = state.linkPrefill?.phone || ''
  const force = Boolean(state.linkPrefill?.force)
  return `<div class="card pairing-card">
    <div class="pairing-head">
      <div><h3>Vincular un sub-bot</h3><p>Conecta un número de WhatsApp a tu cuenta.</p></div>
      <span class="badge accent"><span class="dot"></span>Paso 1 de 3</span>
    </div>
    <form id="link-form">
      <div class="form-error">${icon('alert')}<span></span></div>
      <div class="field">
        <label class="label" for="link-phone">Número de WhatsApp</label>
        <div class="input-icon">${icon('phone')}<input id="link-phone" name="phone" class="input" inputmode="numeric" autocomplete="tel" placeholder="5215512345678" value="${h(phone)}" required /></div>
        <div class="hint">Incluye el código de país, sin <b>+</b>, espacios ni guiones. Ejemplo: <span class="mono">5215512345678</span>.</div>
      </div>
      <label class="check">
        <input type="checkbox" id="link-force" name="force" ${force ? 'checked' : ''} />
        <span><b>Re-vincular este número</b> — cierra la sesión actual y genera credenciales nuevas. Úsalo solo si el bot dejó de responder o cambiaste de teléfono.</span>
      </label>
      <button class="btn btn-primary btn-block auth-submit" type="submit">${icon('sparkles')} Generar código de vinculación</button>
      <div class="hint" style="margin-top:12px;text-align:center">El código caduca en 90 segundos y solo puede usarse una vez.</div>
    </form>
  </div>`
}

function pairingCardHTML() {
  const pairing = state.pairing
  if (!pairing) return linkFormHTML()
  const phone = fmtPhone(pairing.phone)
  const code = pairing.code || state.pairingCode || ''
  const status = pairing.status

  if (status === 'linked') {
    return `<div class="card pairing-card"><div class="empty">
      <div class="empty-icon" style="color:#86efac;background:rgba(34,197,94,.1);border-color:rgba(34,197,94,.2)">${icon('check')}</div>
      <h4>¡Sub-bot vinculado!</h4>
      <p>${h(phone)} ya está registrado. El supervisor lo conectará en unos segundos.</p>
      <div class="flex gap-8" style="margin-top:8px">
        <a class="btn btn-primary" href="#/bots">${icon('bot')} Ver mis bots</a>
        <button class="btn btn-secondary" data-action="link-new">${icon('plus')} Vincular otro</button>
      </div>
    </div></div>`
  }

  if (['expired', 'error', 'cancelled'].includes(status)) {
    const title = status === 'expired' ? 'Código expirado' : status === 'cancelled' ? 'Vinculación cancelada' : 'No se pudo vincular'
    const message = status === 'expired'
      ? 'El código expiró. Genera uno nuevo para continuar.'
      : status === 'cancelled'
        ? 'La vinculación se canceló antes de completarse.'
        : pairing.error || 'No se pudo completar la vinculación.'
    return `<div class="card pairing-card"><div class="empty">
      <div class="empty-icon" style="color:#fca5a5;background:rgba(239,68,68,.1);border-color:rgba(239,68,68,.2)">${icon('alert')}</div>
      <h4>${h(title)}</h4>
      <p>${h(message)}</p>
      <div class="flex gap-8" style="margin-top:8px">
        <button class="btn btn-primary" data-action="link-new">${icon('rotate')} Intentar de nuevo</button>
        <a class="btn btn-secondary" href="#/bots">Ver mis bots</a>
      </div>
    </div></div>`
  }

  const createdAt = Number(pairing.created_at || Date.now())
  const total = status === 'code_ready' ? 90_000 : 180_000
  const expires = Number(pairing.expires_at || createdAt + total)
  const remaining = Math.max(0, expires - Date.now())
  const width = Math.max(0, Math.min(100, (remaining / total) * 100))

  return `<div class="card pairing-card">
    <div class="pairing-head">
      <div><h3>Vinculando ${h(phone)}</h3><p>${status === 'code_ready' ? 'Ingresa el código en WhatsApp' : 'Generando un código seguro…'}</p></div>
      ${badge(status)}
    </div>
    <div class="code-box">
      <div class="code-kicker">Código de vinculación</div>
      <div class="code-value ${code ? '' : 'pending'}" id="pairing-code">${code ? h(code) : 'Generando código…'}</div>
      <div class="code-sub">${code ? 'Cópialo y pégalo en WhatsApp → Dispositivos vinculados.' : 'Esto toma unos segundos.'}</div>
      <div class="code-actions">
        ${code ? `<button class="btn btn-secondary btn-sm" data-action="copy" data-copy="${h(code)}">${icon('copy')} Copiar código</button>` : ''}
        <button class="btn btn-ghost btn-sm" data-action="link-regenerate">${icon('rotate')} Regenerar</button>
        <button class="btn btn-ghost btn-sm" data-action="link-cancel">${icon('x')} Cancelar</button>
      </div>
    </div>
    <div class="countdown">
      <div class="countdown-top"><span>El código caduca en</span><b id="pairing-countdown">--:--</b></div>
      <div class="progress"><span id="pairing-progress" style="width:${width}%"></span></div>
    </div>
    <div class="pairing-alert">${icon('info')}<div>Mantén esta página abierta. Cuando confirmes en tu teléfono, la sesión se conectará automáticamente.</div></div>
  </div>`
}

function renderLinkPage() {
  setPage('Vincular bot', 'Genera un código y conéctalo desde WhatsApp')
  const active = state.pairing && !['linked', 'expired', 'error', 'cancelled'].includes(state.pairing.status)
  content(`
    <div class="page-head">
      <div><h2>Vincular un sub-bot</h2><p>La sesión queda registrada en tu cuenta y el supervisor la conecta automáticamente.</p></div>
      <div class="page-actions"><a class="btn btn-secondary" href="#/bots">${icon('bot')} Mis bots</a></div>
    </div>
    <div class="link-layout">
      <div>${state.pairing ? pairingCardHTML() : linkFormHTML()}</div>
      <div>${stepsCardHTML()}</div>
    </div>`)

  const phoneInput = document.getElementById('link-phone')
  phoneInput?.addEventListener('input', () => {
    phoneInput.value = phoneInput.value.replace(/[^\d]/g, '').slice(0, 15)
  })

  if (active) {
    if (state.pollId !== state.pairing.id) startPairingPolling(state.pairing.id)
    startCountdown()
  }
}

function startPairingPolling(id) {
  if (!id) return
  if (state.pollId === id && state.pollTimer) return
  stopPairingPolling()
  state.pollId = id
  state.pollTimer = setInterval(async () => {
    if (!state.pairing || state.pairing.id !== id) {
      stopPairingPolling()
      return
    }
    try {
      const data = await api.get(`/api/bots/link/${encodeURIComponent(id)}`)
      const pairing = data.pairing
      if (!pairing) return
      state.pairing = pairing
      if (pairing.code) state.pairingCode = pairing.code
      if (['linked', 'expired', 'error', 'cancelled'].includes(pairing.status)) {
        stopPairingPolling()
        stopCountdown()
        if (pairing.status === 'linked') {
          showToast('¡Sub-bot vinculado correctamente!', 'success')
          await loadBots().catch(() => {})
        }
      }
      if (isLinkRoute()) renderLinkPage()
    } catch (error) {
      if (error.status === 404 || error.status === 403) {
        stopPairingPolling()
        stopCountdown()
        state.pairing = { ...(state.pairing || {}), status: 'error', error: error.message }
        if (isLinkRoute()) renderLinkPage()
      }
    }
  }, 2500)
}

function startCountdown() {
  stopCountdown()
  if (!state.pairing) return
  const tick = () => {
    const pairing = state.pairing
    if (!pairing) return
    const text = document.getElementById('pairing-countdown')
    const bar = document.getElementById('pairing-progress')
    if (!text && !bar) return
    const total = pairing.status === 'code_ready' ? 90_000 : 180_000
    const createdAt = Number(pairing.created_at || Date.now())
    const expires = Number(pairing.expires_at || createdAt + total)
    const remaining = Math.max(0, expires - Date.now())
    const minutes = String(Math.floor(remaining / 60000)).padStart(2, '0')
    const seconds = String(Math.floor((remaining % 60000) / 1000)).padStart(2, '0')
    if (text) text.textContent = `${minutes}:${seconds}`
    if (bar) bar.style.width = `${Math.max(0, Math.min(100, (remaining / total) * 100))}%`
  }
  tick()
  state.countdownTimer = setInterval(tick, 1000)
}

/* ── Mi cuenta ──────────────────────────────────────────────────────────── */
function renderAccount() {
  setPage('Mi cuenta', 'Datos de acceso y seguridad del panel')
  const user = state.user
  const cfg = state.config || {}
  content(`
    <div class="page-head"><div><h2>Mi cuenta</h2><p>Información de tu perfil y seguridad.</p></div></div>
    <div class="grid-2">
      <div class="stack">
        <div class="card">
          <div class="card-head"><div><h3>Perfil</h3><p>Información de tu cuenta</p></div>${roleBadge(user.role)}</div>
          <div class="card-body">
            <div class="system-grid">
              <div class="system-item"><div class="si-label">Usuario</div><div class="si-value" style="font-size:13px">${h(user.username)}</div></div>
              <div class="system-item"><div class="si-label">Correo</div><div class="si-value" style="font-size:13px">${h(user.email || 'Sin correo')}</div></div>
              <div class="system-item"><div class="si-label">Registro</div><div class="si-value" style="font-size:13px">${fmtDate(user.created_at, false)}</div></div>
              <div class="system-item"><div class="si-label">Último acceso</div><div class="si-value" style="font-size:13px">${user.last_login_at ? fmtRelative(user.last_login_at) : '—'}</div></div>
            </div>
            <div class="input-group" style="margin-top:16px">
              <input class="input mono" readonly value="${h(cfg.publicUrl || '')}" />
              <button class="btn btn-secondary" data-action="copy" data-copy="${h(cfg.publicUrl || '')}">${icon('copy')}</button>
            </div>
            <div class="hint" style="margin-top:7px">Esta es la dirección pública de tu panel.</div>
          </div>
        </div>
        <div class="card">
          <div class="card-head"><div><h3>Seguridad</h3><p>Cambia tu contraseña</p></div></div>
          <div class="card-body">
            <form id="password-form">
              <div class="form-error">${icon('alert')}<span></span></div>
              <div class="form-success">${icon('check')}<span></span></div>
              <div class="field"><label class="label" for="current-password">Contraseña actual</label><div class="input-icon">${icon('lock')}<input id="current-password" name="current" type="password" class="input" autocomplete="current-password" required /></div></div>
              <div class="field"><label class="label" for="new-password">Nueva contraseña</label><div class="input-icon">${icon('lock')}<input id="new-password" name="password" type="password" class="input" autocomplete="new-password" minlength="8" required /></div><div class="hint">Mínimo 8 caracteres.</div></div>
              <div class="field"><label class="label" for="confirm-password">Confirmar nueva contraseña</label><div class="input-icon">${icon('lock')}<input id="confirm-password" name="confirm" type="password" class="input" autocomplete="new-password" minlength="8" required /></div></div>
              <button class="btn btn-primary" type="submit">${icon('key')} Actualizar contraseña</button>
            </form>
          </div>
        </div>
      </div>
      <div class="stack">
        <div class="card">
          <div class="card-head"><div><h3>Servidor</h3><p>Datos del panel</p></div></div>
          <div class="card-body">
            <div class="system-grid">
              <div class="system-item"><div class="si-label">Subdominio</div><div class="si-value" style="font-size:13px">${h(cfg.subdomain || '—')}</div></div>
              <div class="system-item"><div class="si-label">Dominio</div><div class="si-value" style="font-size:13px">${h(cfg.domain || '—')}</div></div>
              <div class="system-item"><div class="si-label">Plazas</div><div class="si-value" style="font-size:13px">${Number(cfg.maxSubs) > 0 ? h(cfg.maxSubs) : 'Ilimitado'}</div></div>
              <div class="system-item"><div class="si-label">Versión</div><div class="si-value" style="font-size:13px">${h(cfg.version || '1.0.0')}</div></div>
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-head"><div><h3>Sesión</h3><p>Control de acceso</p></div></div>
          <div class="card-body">
            <p class="hint" style="margin:0 0 12px">Si cierras sesión, tendrás que ingresar de nuevo. Las demás sesiones abiertas seguirán activas hasta caducar.</p>
            <button class="btn btn-danger btn-block" data-action="logout">${icon('logout')} Cerrar sesión</button>
          </div>
        </div>
      </div>
    </div>`)
}

/* ── Administración ─────────────────────────────────────────────────────── */
function adminTabs(active) {
  const tabs = [
    ['overview', 'Resumen', 'grid'],
    ['users', 'Usuarios', 'users'],
    ['sessions', 'Sesiones', 'server'],
    ['pairings', 'Vinculaciones', 'link'],
    ['audit', 'Auditoría', 'activity'],
    ['settings', 'Ajustes', 'settings'],
  ]
  return `<div class="admin-tabs">${tabs.map(([id, label, iconName]) => `
    <a class="admin-tab ${active === id ? 'active' : ''}" href="#/admin/${id}">${icon(iconName)}${h(label)}</a>`).join('')}</div>`
}

const ADMIN_META = {
  overview: ['Resumen', 'Estado general del panel y del sistema'],
  users: ['Usuarios', 'Cuentas registradas en el panel'],
  sessions: ['Sesiones', 'Sub-bots detectados en el servidor'],
  pairings: ['Vinculaciones', 'Historial de intentos de vinculación'],
  audit: ['Auditoría', 'Actividad reciente del panel'],
  settings: ['Ajustes', 'Configuración global del panel'],
}

async function renderAdmin(section) {
  const meta = ADMIN_META[section] || ADMIN_META.overview
  setPage(meta[0], meta[1])
  content(adminTabs(section) + loadingBlock())

  try {
    if (section === 'overview') {
      const data = await api.get('/api/admin/overview')
      if (!isAdminRoute('overview')) return
      content(adminTabs('overview') + adminOverviewHTML(data))
      return
    }

    if (section === 'users') {
      const data = await api.get('/api/admin/users?limit=200')
      if (!isAdminRoute('users')) return
      state.adminUsers = Array.isArray(data.users) ? data.users : []
      content(adminTabs('users') + adminUsersHTML(data))
      attachRowFilter('#admin-users-search', '[data-user-row]')
      return
    }

    if (section === 'sessions') {
      const data = await api.get('/api/admin/sessions')
      if (!isAdminRoute('sessions')) return
      state.adminSessions = Array.isArray(data.sessions) ? data.sessions : []
      content(adminTabs('sessions') + adminSessionsHTML(data))
      attachRowFilter('#admin-sessions-search', '[data-session-row]')
      return
    }

    if (section === 'pairings') {
      const data = await api.get('/api/admin/pairings')
      if (!isAdminRoute('pairings')) return
      state.adminPairings = Array.isArray(data.pairings) ? data.pairings : []
      content(adminTabs('pairings') + adminPairingsHTML(data))
      return
    }

    if (section === 'audit') {
      const data = await api.get('/api/admin/audit?limit=150')
      if (!isAdminRoute('audit')) return
      state.adminAudit = Array.isArray(data.audit) ? data.audit : []
      content(adminTabs('audit') + adminAuditHTML(data))
      return
    }

    const data = await api.get('/api/admin/settings')
    if (!isAdminRoute('settings')) return
    state.adminSettings = data
    content(adminTabs('settings') + adminSettingsHTML(data))
  } catch (error) {
    if (error.status === 403) {
      showToast(error.message || 'Necesitas permisos de administrador.', 'error')
      navigate('/dashboard')
      return
    }
    if (!isAdminRoute(section)) return
    content(adminTabs(section) + errorPage(error.message))
  }
}

function adminOverviewHTML(data) {
  const counts = data.counts || {}
  const sessions = data.sessions || {}
  const system = data.system || {}
  const workers = Array.isArray(data.workers) ? data.workers : []
  const maxSubs = Number(data.maxSubs || 0)

  return `
    <div class="stats">
      ${statCard('Usuarios', counts.users ?? 0, 'users', 'violet', `<span>${counts.admins ?? 0} administrador(es)</span>`)}
      ${statCard('Sub-bots', counts.bots ?? 0, 'bot', 'cyan', `<span>${sessions.connected ?? 0} conectados</span>`)}
      ${statCard('Sesiones', sessions.total ?? 0, 'server', 'green', `<span>${sessions.linked ?? 0} vinculadas</span>`)}
      ${statCard('Plazas', maxSubs > 0 ? maxSubs : '∞', 'shield', 'amber', '<span>Máximo configurado</span>')}
    </div>
    <div class="grid-2">
      <div class="stack">
        <div class="card">
          <div class="card-head"><div><h3>Sistema</h3><p>Proceso principal</p></div><span class="badge success"><span class="dot"></span>En línea</span></div>
          <div class="card-body">
            <div class="system-grid">
              <div class="system-item"><div class="si-label">Uptime</div><div class="si-value">${h(fmtUptime(system.uptime || 0))}</div></div>
              <div class="system-item"><div class="si-label">Memoria RSS</div><div class="si-value">${h(system.rssMB || 0)} <small>MB</small></div></div>
              <div class="system-item"><div class="si-label">Heap usado</div><div class="si-value">${h(system.heapMB || 0)} <small>MB</small></div></div>
              <div class="system-item"><div class="si-label">Node.js</div><div class="si-value" style="font-size:13px">${h(system.node || '—')}</div></div>
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-head"><div><h3>Workers de sub-bots</h3><p>${workers.length} proceso(s) reportando</p></div></div>
          <div class="card-body">${workersList(workers)}</div>
        </div>
        <div class="card">
          <div class="card-head"><div><h3>Distribución de sesiones</h3><p>Estado actual en disco y workers</p></div></div>
          <div class="card-body">
            <div class="system-grid">
              <div class="system-item"><div class="si-label">Conectadas</div><div class="si-value" style="color:#86efac">${sessions.connected ?? 0}</div></div>
              <div class="system-item"><div class="si-label">Vinculadas</div><div class="si-value" style="color:#7dd3fc">${sessions.linked ?? 0}</div></div>
              <div class="system-item"><div class="si-label">Re-vincular</div><div class="si-value" style="color:#fcd34d">${sessions.relink ?? 0}</div></div>
              <div class="system-item"><div class="si-label">Vinculando</div><div class="si-value" style="color:#c4b5fd">${sessions.pairing ?? 0}</div></div>
            </div>
          </div>
        </div>
      </div>
      <div class="stack">
        <div class="card">
          <div class="card-head"><div><h3>Actividad reciente</h3><p>Últimos eventos del panel</p></div><a class="btn btn-ghost btn-sm" href="#/admin/audit">Ver todo ${icon('chevronRight')}</a></div>
          <div class="card-body">${auditTimeline(data.recentAudit || [])}</div>
        </div>
        <div class="card">
          <div class="card-head"><div><h3>Últimas vinculaciones</h3><p>Intentos recientes</p></div><a class="btn btn-ghost btn-sm" href="#/admin/pairings">Ver todo ${icon('chevronRight')}</a></div>
          <div class="card-body tight">${pairingsTable(data.recentPairings || [], { compact: true })}</div>
        </div>
      </div>
    </div>`
}

function workersList(workers) {
  if (!workers?.length) {
    return '<div class="hint">No hay workers de sub-bots reportando. El proceso principal puede atender sesiones en modo standalone.</div>'
  }
  return `<div class="worker-list">${workers.map((worker) => {
    const active = Number(worker.connected) > 0
    return `<div class="worker-row">
      <span class="badge ${active ? 'success' : 'neutral'}"><span class="dot"></span>${active ? 'Activo' : 'Inactivo'}</span>
      <span class="wr-name">${h(worker.id || 'worker')}</span>
      <span class="wr-meta">${Number(worker.connected) || 0}/${Number(worker.total) || 0} · ${fmtRelative(worker.updatedAt)}</span>
    </div>`
  }).join('')}</div>`
}

const ACTION_LABELS = {
  'auth.login': 'Inicio de sesión',
  'auth.register': 'Registro',
  'auth.logout': 'Cierre de sesión',
  'auth.password': 'Contraseña cambiada',
  'bot.code_ready': 'Código generado',
  'bot.linked': 'Sub-bot vinculado',
  'bot.link_expired': 'Vinculación expirada',
  'bot.link_error': 'Error de vinculación',
  'bot.link_cancelled': 'Vinculación cancelada',
  'bot.deleted': 'Sub-bot eliminado',
  'bot.reconnect': 'Reconexión solicitada',
  'admin.user_update': 'Usuario actualizado',
  'admin.user_delete': 'Usuario eliminado',
  'admin.session_reconnect': 'Sesión reconectada',
  'admin.session_delete': 'Sesión eliminada',
  'admin.settings': 'Ajustes actualizados',
}

function actionLabel(action) {
  return ACTION_LABELS[action] || String(action || 'Evento')
}

function actionTone(action) {
  const value = String(action || '')
  if (['auth.login', 'auth.register', 'bot.linked'].includes(value)) return 'ok'
  if (['bot.link_expired', 'bot.link_cancelled', 'bot.reconnect', 'admin.user_update', 'admin.settings'].includes(value)) return 'warn'
  if (value.includes('delete') || value.includes('error')) return 'bad'
  return ''
}

function parseMeta(meta) {
  if (!meta) return {}
  if (typeof meta === 'object') return meta
  try { return JSON.parse(meta) } catch { return {} }
}

function auditTimeline(items) {
  if (!items?.length) return '<div class="hint">Sin actividad registrada todavía.</div>'
  return `<div class="timeline">${items.map((item) => {
    const meta = parseMeta(item.meta)
    const details = []
    if (meta.phone) details.push(fmtPhone(meta.phone))
    if (meta.username) details.push('@' + meta.username)
    if (meta.reason) details.push(String(meta.reason))
    return `<div class="timeline-item ${actionTone(item.action)}">
      <div class="ti-action">${h(actionLabel(item.action))}</div>
      <div class="ti-meta">${item.username ? h(item.username) + ' · ' : ''}${item.ip ? h(item.ip) + ' · ' : ''}${fmtRelative(item.created_at)}${details.length ? ' · ' + h(details.join(' · ')) : ''}</div>
    </div>`
  }).join('')}</div>`
}

function usersTable(users) {
  if (!users?.length) {
    return emptyState('users', 'Sin usuarios', 'Todavía no hay cuentas registradas en el panel.')
  }
  const selfId = Number(state.user?.id)
  return `<div class="table-wrap"><table class="table">
    <thead><tr><th>Usuario</th><th>Rol</th><th>Estado</th><th>Registro</th><th>Último acceso</th><th class="right">Acciones</th></tr></thead>
    <tbody>${users.map((user) => {
      const self = Number(user.id) === selfId
      const search = [user.username, user.email || '', user.role, user.status].join(' ').toLowerCase()
      return `<tr data-user-row data-search="${h(search)}">
        <td><div class="cell-main">
          <div class="avatar" style="width:34px;height:34px;border-radius:9px">${initials(user.username)}</div>
          <div class="grow"><div class="cell-title">${h(user.username)}${self ? ' <span class="badge neutral" style="margin-left:4px">Tú</span>' : ''}</div><div class="cell-sub">${h(user.email || 'Sin correo')}</div></div>
        </div></td>
        <td>${roleBadge(user.role)}</td>
        <td>${badge(user.status)}</td>
        <td><span class="tiny muted">${fmtDate(user.created_at, false)}</span></td>
        <td><span class="tiny muted">${user.last_login_at ? fmtRelative(user.last_login_at) : 'Nunca'}</span></td>
        <td><div class="actions">
          <button class="icon-btn sm" data-action="admin-user-edit" data-id="${user.id}" title="Editar">${icon('pencil')}</button>
          <button class="icon-btn sm danger" data-action="admin-user-delete" data-id="${user.id}" data-username="${h(user.username)}" title="Eliminar" ${self ? 'disabled' : ''}>${icon('trash')}</button>
        </div></td>
      </tr>`
    }).join('')}</tbody>
  </table></div>`
}

function adminUsersHTML(data) {
  return `<div class="card">
    <div class="card-head">
      <div><h3>Usuarios</h3><p>${data.total ?? 0} cuenta(s) registrada(s)</p></div>
      <div class="input-icon" style="max-width:290px;width:100%">${icon('search')}<input id="admin-users-search" class="input" placeholder="Buscar usuario o correo…" /></div>
    </div>
    <div class="card-body tight">${usersTable(data.users || [])}</div>
  </div>`
}

function sessionsTable(sessions) {
  if (!sessions?.length) {
    return emptyState('server', 'Sin sesiones', 'No hay carpetas de sub-bots en el servidor todavía.')
  }
  return `<div class="table-wrap"><table class="table">
    <thead><tr><th>Sesión</th><th>Dueño</th><th>Estado</th><th>Worker</th><th class="right">Acciones</th></tr></thead>
    <tbody>${sessions.map((session) => {
      const phone = session.folder || session.phone
      const search = [phone, session.owner || '', session.label || '', session.status].join(' ').toLowerCase()
      const details = []
      if (session.archived) details.push('solo ajustes')
      else if (session.hasCreds) details.push('credenciales')
      else details.push('sin credenciales')
      if (session.label) details.push(session.label)
      const canReconnect = ['linked', 'connected'].includes(session.status)
      return `<tr data-session-row data-search="${h(search)}">
        <td><div class="cell-main">
          <div class="row-icon ${statusIconTone(session.status)}">${icon('bot')}</div>
          <div class="grow"><div class="cell-title mono">${fmtPhone(phone)}</div><div class="cell-sub">${h(details.join(' · '))}</div></div>
        </div></td>
        <td>${session.owner ? h(session.owner) : '<span class="badge warn"><span class="dot"></span>Sin dueño</span>'}</td>
        <td>${badge(session.status)}</td>
        <td>${session.worker ? `<span class="mono tiny muted">${h(session.worker)}</span>` : '<span class="tiny muted">—</span>'}</td>
        <td><div class="actions">
          <button class="icon-btn sm" data-action="admin-session-reconnect" data-phone="${h(phone)}" title="Reconectar" ${canReconnect ? '' : 'disabled'}>${icon('rotate')}</button>
          <button class="icon-btn sm danger" data-action="admin-session-delete" data-phone="${h(phone)}" title="Eliminar">${icon('trash')}</button>
        </div></td>
      </tr>`
    }).join('')}</tbody>
  </table></div>`
}

function adminSessionsHTML(data) {
  const sessions = data.sessions || []
  const counts = {
    total: sessions.length,
    connected: sessions.filter((session) => session.status === 'connected').length,
    relink: sessions.filter((session) => session.status === 'relink').length,
    pairing: sessions.filter((session) => session.status === 'pairing').length,
  }
  return `<div class="stats">
    ${statCard('Sesiones', counts.total, 'server', 'violet')}
    ${statCard('Conectadas', counts.connected, 'wifi', 'green')}
    ${statCard('Re-vincular', counts.relink, 'alert', 'amber')}
    ${statCard('Vinculando', counts.pairing, 'link', 'cyan')}
  </div>
  <div class="card">
    <div class="card-head">
      <div><h3>Todas las sesiones</h3><p>Detectadas por el supervisor y los workers</p></div>
      <div class="input-icon" style="max-width:290px;width:100%">${icon('search')}<input id="admin-sessions-search" class="input" placeholder="Buscar número o dueño…" /></div>
    </div>
    <div class="card-body tight">${sessionsTable(sessions)}</div>
  </div>`
}

function pairingsTable(pairings, { compact = false } = {}) {
  if (!pairings?.length) {
    return emptyState('link', 'Sin vinculaciones', 'Aún no se ha generado ningún código de vinculación.')
  }
  return `<div class="table-wrap"><table class="table">
    <thead><tr><th>Número</th><th>Estado</th><th>Código</th><th>Creado</th>${compact ? '' : '<th>Detalle</th>'}</tr></thead>
    <tbody>${pairings.map((pairing) => {
      const detail = pairing.error || (pairing.linked_at ? 'Vinculado ' + fmtDate(pairing.linked_at) : '—')
      return `<tr>
        <td><div class="cell-main">
          <div class="row-icon ${statusIconTone(pairing.status)}">${icon('link')}</div>
          <div class="grow"><div class="cell-title mono">${fmtPhone(pairing.phone)}</div><div class="cell-sub">${h(pairing.username || 'Sin dueño')}</div></div>
        </div></td>
        <td>${badge(pairing.status)}</td>
        <td>${pairing.code ? `<span class="mono tiny">${h(pairing.code)}</span>` : '<span class="tiny muted">—</span>'}</td>
        <td><span class="tiny muted">${fmtRelative(pairing.created_at)}</span></td>
        ${compact ? '' : `<td><span class="tiny muted">${h(String(detail).slice(0, 60))}</span></td>`}
      </tr>`
    }).join('')}</tbody>
  </table></div>`
}

function adminPairingsHTML(data) {
  return `<div class="card">
    <div class="card-head"><div><h3>Vinculaciones recientes</h3><p>Últimos 100 intentos registrados</p></div><a class="btn btn-ghost btn-sm" href="#/admin/overview">Resumen ${icon('chevronRight')}</a></div>
    <div class="card-body tight">${pairingsTable(data.pairings || [])}</div>
  </div>`
}

function adminAuditHTML(data) {
  return `<div class="card">
    <div class="card-head"><div><h3>Auditoría</h3><p>Eventos más recientes del panel</p></div><span class="badge neutral"><span class="dot"></span>${(data.audit || []).length} evento(s)</span></div>
    <div class="card-body">${auditTimeline(data.audit || [])}</div>
  </div>`
}

function adminSettingsHTML(data) {
  const maxSubs = Number(data.maxSubs || 0)
  return `<div class="grid-2">
    <div class="card">
      <div class="card-head"><div><h3>Límites de sub-bots</h3><p>Se aplica a todo el servidor</p></div></div>
      <div class="card-body">
        <form id="settings-form">
          <div class="form-error">${icon('alert')}<span></span></div>
          <div class="field">
            <label class="label" for="settings-max">Máximo de sub-bots</label>
            <input id="settings-max" name="maxSubs" type="number" min="0" class="input" value="${maxSubs}" />
            <div class="hint">Usa <b>0</b> para ilimitado. El valor se guarda en <span class="mono">storage/maxsubs.json</span>.</div>
          </div>
          <button class="btn btn-primary" type="submit">${icon('check')} Guardar límite</button>
        </form>
      </div>
    </div>
    <div class="card">
      <div class="card-head"><div><h3>Identidad del panel</h3><p>Dominio, subdominio y URL pública</p></div></div>
      <div class="card-body">
        <div class="field">
          <label class="label">URL pública</label>
          <div class="input-group">
            <input class="input mono" readonly value="${h(data.publicUrl || '')}" />
            <button class="btn btn-secondary" data-action="copy" data-copy="${h(data.publicUrl || '')}">${icon('copy')}</button>
          </div>
        </div>
        <div class="system-grid">
          <div class="system-item"><div class="si-label">Subdominio</div><div class="si-value" style="font-size:13px">${h(data.subdomain || '—')}</div></div>
          <div class="system-item"><div class="si-label">Dominio</div><div class="si-value" style="font-size:13px">${h(data.domain || '—')}</div></div>
          <div class="system-item"><div class="si-label">Marca</div><div class="si-value" style="font-size:13px">${h(data.brandName || '—')}</div></div>
          <div class="system-item"><div class="si-label">Plazas</div><div class="si-value" style="font-size:13px">${maxSubs > 0 ? h(maxSubs) : 'Ilimitado'}</div></div>
        </div>
        <div class="pairing-alert" style="margin-top:14px">${icon('info')}<div>Para cambiar el subdominio, dominio o puerto, edita <span class="mono">config.js</span> (o las variables <span class="mono">PAIN_WEB_*</span>) y reinicia el bot. Nada está fijo en el código.</div></div>
      </div>
    </div>
  </div>`
}

function openUserModal(id) {
  const user = state.adminUsers.find((item) => Number(item.id) === Number(id))
  if (!user) {
    showToast('No se encontró el usuario. Actualiza la lista.', 'error')
    return
  }
  openModal({
    title: 'Editar usuario',
    subtitle: '@' + user.username,
    body: `<form id="user-form" data-id="${user.id}">
      <div class="form-error">${icon('alert')}<span></span></div>
      <div class="field"><label class="label">Usuario</label><input class="input" value="${h(user.username)}" disabled /></div>
      <div class="field"><label class="label" for="user-role">Rol</label>
        <select id="user-role" name="role" class="select">
          <option value="user" ${user.role === 'user' ? 'selected' : ''}>Usuario</option>
          <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Administrador</option>
        </select>
      </div>
      <div class="field"><label class="label" for="user-status">Estado</label>
        <select id="user-status" name="status" class="select">
          <option value="active" ${user.status === 'active' ? 'selected' : ''}>Activo</option>
          <option value="banned" ${user.status === 'banned' ? 'selected' : ''}>Bloqueado</option>
        </select>
      </div>
      <div class="field"><label class="label" for="user-password">Nueva contraseña <span class="muted">(opcional)</span></label><input id="user-password" name="password" type="password" class="input" autocomplete="new-password" minlength="8" placeholder="Déjalo vacío para no cambiarla" /><div class="hint">Mínimo 8 caracteres. Al bloquear al usuario se cierran sus sesiones.</div></div>
    </form>`,
    footer: `<button class="btn btn-ghost" data-action="modal-close">Cancelar</button><button class="btn btn-primary" id="user-save-btn" type="submit" form="user-form">Guardar cambios</button>`,
  })
}

function openRenameModal(phone, label) {
  openModal({
    title: 'Renombrar sub-bot',
    subtitle: fmtPhone(phone),
    body: `<form id="rename-form" data-phone="${h(phone)}">
      <div class="form-error">${icon('alert')}<span></span></div>
      <div class="field"><label class="label" for="rename-label">Nombre visible</label><input id="rename-label" name="label" class="input" maxlength="60" value="${h(label || '')}" placeholder="Ej: Ventas, Soporte, Personal…" /><div class="hint">Solo se muestra en el panel; no cambia el número de WhatsApp.</div></div>
    </form>`,
    footer: `<button class="btn btn-ghost" data-action="modal-close">Cancelar</button><button class="btn btn-primary" type="submit" form="rename-form">Guardar</button>`,
  })
}

/* ── Handlers de autenticación ──────────────────────────────────────────── */
async function handleAuth(form) {
  const mode = form.dataset.mode === 'register' ? 'register' : 'login'
  const username = form.querySelector('[name="username"]')?.value.trim() || ''
  const password = form.querySelector('[name="password"]')?.value || ''
  const email = form.querySelector('[name="email"]')?.value.trim() || ''
  const confirm = form.querySelector('[name="confirm"]')?.value || ''
  const invite = form.querySelector('[name="invite"]')?.value.trim() || ''
  const submit = form.querySelector('button[type="submit"]')

  hideFormError(form)
  if (mode === 'register' && password !== confirm) {
    showFormError(form, 'Las contraseñas no coinciden.')
    return
  }

  setLoading(submit, true, mode === 'register' ? 'Creando cuenta…' : 'Entrando…')
  try {
    const data = mode === 'register'
      ? await api.post('/api/auth/register', { username, email: email || null, password, invite })
      : await api.post('/api/auth/login', { username, password })

    state.user = data.user
    state.csrf = data.csrf
    state.authTab = 'login'
    try {
      const config = await api.get('/api/config')
      state.config = { ...(state.config || {}), ...config }
    } catch {}
    renderShell()
    navigate('/dashboard')
    showToast(mode === 'register' ? 'Cuenta creada. Bienvenido.' : 'Bienvenido de vuelta.', 'success')
  } catch (error) {
    showFormError(form, error.message || 'No se pudo completar la operación.')
    setLoading(submit, false)
  }
}

async function handleLogout() {
  try {
    await api.post('/api/auth/logout', {})
  } catch {}
  stopTimers()
  state.user = null
  state.csrf = null
  state.bots = []
  state.pairing = null
  state.pairingCode = null
  state.linkPrefill = null
  state.adminUsers = []
  state.adminSessions = []
  state.adminPairings = []
  state.adminAudit = []
  state.adminSettings = null
  closeModal()
  renderAuth()
  showToast('Sesión cerrada.', 'info')
}

/* ── Handlers de vinculación ────────────────────────────────────────────── */
async function handleStartLink(form) {
  const submit = form.querySelector('button[type="submit"]')
  const phoneInput = form.querySelector('[name="phone"]')
  const forceInput = form.querySelector('[name="force"]')
  const phone = String(phoneInput?.value || '').replace(/\D/g, '')
  const force = Boolean(forceInput?.checked)

  hideFormError(form)
  if (phone.length < 8 || phone.length > 15) {
    showFormError(form, 'Escribe el número con código de país (entre 8 y 15 dígitos).')
    return
  }

  setLoading(submit, true, 'Generando código…')
  try {
    const data = await api.post('/api/bots/link', { phone, force })
    state.pairing = data.pairing || null
    state.pairingCode = data.code || data.pairing?.code || null
    state.linkPrefill = null
    showToast(data.code ? 'Código generado. Ingrésalo en WhatsApp.' : 'Vinculación iniciada.', 'success')
    renderLinkPage()
  } catch (error) {
    showFormError(form, error.message || 'No se pudo generar el código.')
    setLoading(submit, false)
    if (error.code === 'already_linked' && forceInput) forceInput.checked = true
  }
}

async function handleLinkCancel() {
  const pairing = state.pairing
  if (!pairing?.id) {
    resetLinkFlow()
    return
  }
  try {
    const data = await api.post(`/api/bots/link/${encodeURIComponent(pairing.id)}/cancel`, {})
    state.pairing = data.pairing || null
    stopTimers()
    renderLinkPage()
    showToast('Vinculación cancelada.', 'info')
  } catch (error) {
    showToast(error.message || 'No se pudo cancelar.', 'error')
  }
}

async function handleLinkRegenerate() {
  const pairing = state.pairing
  if (!pairing?.id) return
  try {
    const data = await api.post(`/api/bots/link/${encodeURIComponent(pairing.id)}/regenerate`, {})
    state.pairing = data.pairing || null
    state.pairingCode = data.code || data.pairing?.code || null
    stopTimers()
    renderLinkPage()
    showToast('Nuevo código generado.', 'success')
  } catch (error) {
    showToast(error.message || 'No se pudo regenerar el código.', 'error')
  }
}

function resetLinkFlow() {
  stopTimers()
  state.pairing = null
  state.pairingCode = null
  state.linkPrefill = null
  if (isLinkRoute()) renderLinkPage()
  else navigate('/link')
}

function handleBotRelink(phone) {
  stopTimers()
  state.pairing = null
  state.pairingCode = null
  state.linkPrefill = { phone, force: true }
  navigate('/link')
}

/* ── Handlers de bots ───────────────────────────────────────────────────── */
function confirmDeleteBot(phone, label) {
  confirmModal({
    title: 'Eliminar sub-bot',
    message: `Se eliminará la sesión de <b>${h(label || fmtPhone(phone))}</b> (${h(fmtPhone(phone))}), se cerrarán sus credenciales y se olvidarán los ajustes guardados. Esta acción no se puede deshacer.`,
    confirmLabel: 'Eliminar sub-bot',
    onConfirm: async () => {
      await api.del(`/api/bots/${encodeURIComponent(phone)}`)
      state.pairing = null
      stopTimers()
      showToast('Sub-bot eliminado.', 'success')
      await route()
    },
  })
}

function reconnectReason(reason) {
  const reasons = {
    'no-worker': 'El supervisor no tiene un worker disponible para esa sesión.',
    relink: 'Ese bot necesita re-vincularse desde la web.',
    pairing: 'La sesión se está vinculando ahora.',
    'no-creds': 'La sesión no tiene credenciales válidas.',
    timeout: 'La reconexión está tardando; revisa el estado en unos segundos.',
    invalid: 'La sesión no es válida.',
  }
  return reasons[reason] || 'No se pudo solicitar la reconexión.'
}

async function reconnectBot(phone) {
  try {
    const result = await api.post(`/api/bots/${encodeURIComponent(phone)}/reconnect`, {})
    if (result.ok) {
      showToast('Reconexión solicitada al supervisor.', 'success')
      setTimeout(() => {
        if (state.user) route()
      }, 1600)
    } else {
      showToast(reconnectReason(result.reason), 'warn')
    }
  } catch (error) {
    showToast(error.message || 'No se pudo reconectar.', 'error')
  }
}

async function handleRename(form) {
  const phone = form.dataset.phone
  const input = form.querySelector('[name="label"]')
  const label = String(input?.value || '').trim()
  hideFormError(form)
  try {
    await api.patch(`/api/bots/${encodeURIComponent(phone)}`, { label })
    closeModal()
    showToast('Nombre actualizado.', 'success')
    await route()
  } catch (error) {
    showFormError(form, error.message || 'No se pudo renombrar.')
  }
}

/* ── Handlers de cuenta ─────────────────────────────────────────────────── */
async function handlePasswordChange(form) {
  const current = form.querySelector('[name="current"]')?.value || ''
  const password = form.querySelector('[name="password"]')?.value || ''
  const confirm = form.querySelector('[name="confirm"]')?.value || ''
  const submit = form.querySelector('button[type="submit"]')

  hideFormError(form)
  hideFormSuccess(form)
  if (password !== confirm) {
    showFormError(form, 'Las contraseñas nuevas no coinciden.')
    return
  }

  setLoading(submit, true, 'Actualizando…')
  try {
    const data = await api.post('/api/auth/password', { current, password })
    state.csrf = data.csrf
    form.reset()
    showFormSuccess(form, 'Contraseña actualizada. Las demás sesiones fueron cerradas.')
    showToast('Contraseña actualizada.', 'success')
  } catch (error) {
    showFormError(form, error.message || 'No se pudo cambiar la contraseña.')
  } finally {
    setLoading(submit, false)
  }
}

/* ── Handlers de administración ─────────────────────────────────────────── */
async function handleUserSave(form) {
  const id = form.dataset.id
  const role = form.querySelector('[name="role"]')?.value
  const status = form.querySelector('[name="status"]')?.value
  const password = String(form.querySelector('[name="password"]')?.value || '')
  const body = { role, status }
  if (password) body.password = password
  const button = document.getElementById('user-save-btn')

  hideFormError(form)
  setLoading(button, true, 'Guardando…')
  try {
    const data = await api.patch(`/api/admin/users/${encodeURIComponent(id)}`, body)
    if (Number(id) === Number(state.user?.id) && data.user) {
      state.user.role = data.user.role
      state.user.status = data.user.status
      if (data.user.role !== 'admin') {
        closeModal()
        renderShell()
        navigate('/dashboard')
        showToast('Tu cuenta ya no tiene permisos de administrador.', 'warn')
        return
      }
    }
    closeModal()
    showToast('Usuario actualizado.', 'success')
    await renderAdmin('users')
  } catch (error) {
    showFormError(form, error.message || 'No se pudo actualizar el usuario.')
    setLoading(button, false)
  }
}

function confirmDeleteUser(id, username) {
  confirmModal({
    title: 'Eliminar usuario',
    message: `Se eliminará la cuenta <b>@${h(username)}</b> del panel. Sus sub-bots seguirán en el servidor, pero quedarán sin dueño. Esta acción no se puede deshacer.`,
    confirmLabel: 'Eliminar usuario',
    onConfirm: async () => {
      await api.del(`/api/admin/users/${encodeURIComponent(id)}`)
      showToast('Usuario eliminado.', 'success')
      await renderAdmin('users')
    },
  })
}

function confirmAdminDeleteSession(phone) {
  confirmModal({
    title: 'Eliminar sesión',
    message: `Se eliminará la sesión <b>${h(fmtPhone(phone))}</b> del servidor, incluidas sus credenciales y ajustes guardados. Si el número sigue vinculado a WhatsApp, podrá volver a vincularse desde la web.`,
    confirmLabel: 'Eliminar sesión',
    onConfirm: async () => {
      await api.del(`/api/admin/sessions/${encodeURIComponent(phone)}`)
      showToast('Sesión eliminada.', 'success')
      await renderAdmin('sessions')
    },
  })
}

async function adminReconnect(phone) {
  try {
    const result = await api.post(`/api/admin/sessions/${encodeURIComponent(phone)}/reconnect`, {})
    if (result.ok) {
      showToast('Reconexión solicitada al supervisor.', 'success')
      setTimeout(() => {
        if (state.user && isAdminRoute('sessions')) renderAdmin('sessions')
      }, 1600)
    } else {
      showToast(reconnectReason(result.reason), 'warn')
    }
  } catch (error) {
    showToast(error.message || 'No se pudo reconectar.', 'error')
  }
}

async function handleSettingsSave(form) {
  const input = form.querySelector('[name="maxSubs"]')
  const submit = form.querySelector('button[type="submit"]')
  const maxSubs = Number(input?.value || 0)
  hideFormError(form)
  if (!Number.isFinite(maxSubs) || maxSubs < 0) {
    showFormError(form, 'El límite debe ser 0 (ilimitado) o un número mayor.')
    return
  }
  setLoading(submit, true, 'Guardando…')
  try {
    const data = await api.patch('/api/admin/settings', { maxSubs })
    state.config = { ...(state.config || {}), maxSubs: data.maxSubs }
    showToast('Límite actualizado.', 'success')
    await renderAdmin('settings')
  } catch (error) {
    showFormError(form, error.message || 'No se pudo guardar el límite.')
    setLoading(submit, false)
  }
}

/* ── Delegación de eventos ──────────────────────────────────────────────── */
async function onClick(event) {
  const actionEl = event.target.closest('[data-action]')
  if (actionEl) {
    const action = actionEl.dataset.action
    const phone = actionEl.dataset.phone
    const id = actionEl.dataset.id

    if (action === 'toggle-sidebar') {
      document.getElementById('app-shell')?.classList.toggle('sidebar-open')
      return
    }
    if (action === 'close-sidebar') {
      document.getElementById('app-shell')?.classList.remove('sidebar-open')
      return
    }
    if (action === 'modal-close') {
      closeModal()
      return
    }
    if (action === 'close-toast') {
      actionEl.closest('.toast')?.remove()
      return
    }
    if (action === 'copy') {
      copyText(actionEl.dataset.copy || '')
      return
    }
    if (action === 'refresh') {
      await route()
      return
    }
    if (action === 'logout') {
      await handleLogout()
      return
    }
    if (action === 'auth-tab') {
      state.authTab = actionEl.dataset.tab === 'register' ? 'register' : 'login'
      renderAuth()
      return
    }
    if (action === 'toggle-password') {
      const input = document.getElementById(actionEl.dataset.input || '')
      if (!input) return
      const show = input.type === 'password'
      input.type = show ? 'text' : 'password'
      actionEl.innerHTML = icon(show ? 'eyeOff' : 'eye')
      return
    }
    if (action === 'bot-delete') {
      confirmDeleteBot(phone, actionEl.dataset.label || '')
      return
    }
    if (action === 'bot-reconnect') {
      await reconnectBot(phone)
      return
    }
    if (action === 'bot-relink') {
      handleBotRelink(phone)
      return
    }
    if (action === 'bot-rename') {
      openRenameModal(phone, actionEl.dataset.label || '')
      return
    }
    if (action === 'link-new') {
      resetLinkFlow()
      return
    }
    if (action === 'link-cancel') {
      await handleLinkCancel()
      return
    }
    if (action === 'link-regenerate') {
      await handleLinkRegenerate()
      return
    }
    if (action === 'admin-user-edit') {
      openUserModal(id)
      return
    }
    if (action === 'admin-user-delete') {
      confirmDeleteUser(id, actionEl.dataset.username || 'usuario')
      return
    }
    if (action === 'admin-session-reconnect') {
      await adminReconnect(phone)
      return
    }
    if (action === 'admin-session-delete') {
      confirmAdminDeleteSession(phone)
      return
    }
  }

  const nav = event.target.closest('.nav-link')
  if (nav && window.innerWidth <= 900) {
    document.getElementById('app-shell')?.classList.remove('sidebar-open')
  }
}

async function onSubmit(event) {
  const form = event.target
  if (!(form instanceof HTMLFormElement)) return
  const id = form.id

  if (id === 'auth-form') {
    event.preventDefault()
    await handleAuth(form)
    return
  }
  if (id === 'link-form') {
    event.preventDefault()
    await handleStartLink(form)
    return
  }
  if (id === 'password-form') {
    event.preventDefault()
    await handlePasswordChange(form)
    return
  }
  if (id === 'rename-form') {
    event.preventDefault()
    await handleRename(form)
    return
  }
  if (id === 'user-form') {
    event.preventDefault()
    await handleUserSave(form)
    return
  }
  if (id === 'settings-form') {
    event.preventDefault()
    await handleSettingsSave(form)
  }
}

function onKeydown(event) {
  if (event.key === 'Escape') {
    closeModal()
    document.getElementById('app-shell')?.classList.remove('sidebar-open')
  }
}

/* ── Arranque ───────────────────────────────────────────────────────────── */
async function boot() {
  try {
    const me = await api.get('/api/auth/me')
    state.user = me.user
    state.csrf = me.csrf
    let publicConfig = {}
    try {
      publicConfig = await api.get('/api/config')
    } catch {}
    state.config = { ...(state.config || {}), ...(me.config || {}), ...publicConfig }
    renderShell()
    if (!location.hash) history.replaceState(null, '', '#/dashboard')
    await route()
  } catch (error) {
    state.user = null
    try {
      state.config = { ...(state.config || {}), ...(await api.get('/api/config')) }
    } catch {}
    renderAuth()
    if (error.status && error.status !== 401) {
      showToast(error.message || 'No se pudo cargar el panel.', 'error')
    }
  }
}

document.addEventListener('click', onClick)
document.addEventListener('submit', onSubmit)
document.addEventListener('keydown', onKeydown)
window.addEventListener('hashchange', () => { route() })

boot()
