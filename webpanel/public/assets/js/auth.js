/* Pain Panel — módulo auth */
import { api } from './api.js'
import {
  app,
  closeModal,
  h,
  hideFormError,
  icon,
  openModal,
  setLoading,
  showFormError,
  showToast,
  state,
  stopTimers,
} from './core.js'
import { renderStatsBadges } from './stats.js'
import { montarTurnstile, reiniciarTurnstile } from './turnstile.js'
import { disablePush, stopPushClient } from './push.js'

/* ── Sesión expirada ────────────────────────────────────────────────────── */
export function handleSessionExpired() {
  if (!state.user) return
  stopPushClient()
  state.adminUsers=[];state.adminRoles=[];state.adminAudit=[];state.adminPairings=[];state.adminPushUsers=[];state.adminPushSelection=new Set()
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
export function renderAuth() {
  stopTimers()
  closeModal()
  if (!app) return
  const cfg = state.config || {}
  const brand = cfg.brandName || 'PAIN BOT MD'
  const allowRegistration = cfg.allowRegistration !== false
  if (!allowRegistration && state.authTab === 'register') state.authTab = 'login'
  const tab = state.authTab
  const publicUrl = cfg.publicUrl || ''

  document.title = `Acceso · ${brand}`
  app.innerHTML = `
    <div class="auth-shell">
      <section class="auth-brand">
        <div class="brand">
          <div class="brand-mark"><img src="/assets/logo.webp" alt="" /></div>
          <div class="brand-text">
            <div class="brand-name">${h(brand)}</div>
            <div class="brand-sub">Panel de control</div>
          </div>
        </div>
        <div class="auth-hero">
          <h1 class="auth-title">Tu propio bot de WhatsApp</h1>
          <p class="auth-lead">Conecta tu número a ${h(brand)} y dale tu estilo al bot. Cambia su nombre, elige una imagen y ajusta el menú desde tu cuenta. Si necesitas revisar la conexión, también lo haces aquí.</p>
          <ul class="auth-features">
            <li><span class="fi">${icon('link')}</span><div><b>Conéctalo con un código</b><span>Introduce los 8 dígitos en Dispositivos vinculados de WhatsApp. No necesitas escanear un QR.</span></div></li>
            <li><span class="fi">${icon('settings')}</span><div><b>Dale tu toque</b><span>El nombre, la imagen y el menú de tu bot se pueden cambiar desde el panel.</span></div></li>
            <li><span class="fi">${icon('activity')}</span><div><b>Tus bots, en un solo lugar</b><span>Mira cuáles están conectados, reconecta un número o desvincúlalo cuando lo necesites.</span></div></li>
          </ul>
          <div class="auth-stats" id="auth-stats"></div>
          <div class="auth-actions">
            <button class="btn btn-primary btn-block" data-action="auth-open-login">${icon('login')} Iniciar sesión</button>
            ${allowRegistration ? `<button class="btn btn-secondary btn-block" data-action="auth-open-register">${icon('userPlus')} Registrarse</button>` : ''}
            <div class="auth-gratis" data-action="auth-open-login">${icon('zap')} Totalmente gratis</div>
          </div>
          <div class="auth-meta">
            <span>${h(publicUrl.replace(/^https?:\/\//, '') || 'Panel privado')}</span>
            <span class="sep"></span>
            <span>v${h(cfg.version || '1.0.0')}</span>
          </div>
        </div>
      </section>
    </div>`
  renderStatsBadges()
}

/* ── Modal flotante de acceso (login / registro) ────────────────────────── */
export function openAuthModal() {
  const cfg = state.config || {}
  const brand = cfg.brandName || 'PAIN BOT MD'
  const allowRegistration = cfg.allowRegistration !== false
  const tab = state.authTab

  openModal({
    title: tab === 'login' ? 'Inicia sesión' : 'Crea tu cuenta',
    subtitle: tab === 'login' ? 'Accede al panel para gestionar tus sub-bots.' : 'Regístrate para vincular tu primer número.',
    body: `
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
          <label class="label" for="auth-email">Correo</label>
          <div class="input-icon">${icon('mail')}<input class="input" id="auth-email" name="email" type="email" autocomplete="email" placeholder="tu@correo.com" required /></div>
          <div class="hint">Lo usamos para proteger y recuperar tu cuenta.</div>
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
        ${cfg.turnstileSiteKey ? `<div class="turnstile-slot" id="turnstile-slot"></div>` : ''}
        <button class="btn btn-primary btn-block auth-submit" type="submit">${tab === 'login' ? 'Entrar al panel' : 'Crear cuenta'} ${icon('arrowRight')}</button>
        ${tab === 'login' ? `<div class="auth-forgot"><button type="button" class="link-btn" data-action="auth-forgot">¿Olvidaste tu contraseña?</button></div>` : ''}
      </form>
    `,
  })
  if (cfg.turnstileSiteKey) montarTurnstile(cfg.turnstileSiteKey)
}

/* ── Recuperación de contraseña ─────────────────────────────────────────── */
export function openForgotModal(email = '') {
  const cfg = state.config || {}
  openModal({
    title: 'Recuperar contraseña',
    subtitle: 'Te enviaremos un código de 6 dígitos al correo de tu cuenta.',
    body: `<form id="forgot-form">
      <div class="form-error">${icon('alert')}<span></span></div>
      <div class="field">
        <label class="label" for="forgot-email">Correo de la cuenta</label>
        <div class="input-icon">${icon('mail')}<input class="input" id="forgot-email" name="email" type="email" value="${h(email)}" autocomplete="email" placeholder="tu@correo.com" required /></div>
        <div class="hint">Si el correo está registrado, recibirás un código. No revelamos si la cuenta existe.</div>
      </div>
      ${cfg.turnstileSiteKey ? '<div class="turnstile-slot" id="turnstile-slot"></div>' : ''}
      <button class="btn btn-primary btn-block" type="submit">${icon('mail')} Enviar código</button>
    </form>`,
  })
  if (cfg.turnstileSiteKey) montarTurnstile(cfg.turnstileSiteKey)
}

export function openResetModal(email = '') {
  openModal({
    title: 'Restablecer contraseña',
    subtitle: 'Escribe el código que llegó a tu correo y tu nueva contraseña.',
    body: `<form id="reset-form">
      <div class="form-error">${icon('alert')}<span></span></div>
      <div class="field">
        <label class="label" for="reset-email">Correo</label>
        <div class="input-icon">${icon('mail')}<input class="input" id="reset-email" name="email" type="email" value="${h(email)}" autocomplete="email" required /></div>
      </div>
      <div class="field">
        <label class="label" for="reset-code">Código de 6 dígitos</label>
        <input class="input code-input" id="reset-code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="\\d{6}" placeholder="000000" required />
        <div class="hint">Caduca en 15 minutos. Si no llegó, revisa el spam o pide otro desde «¿Olvidaste tu contraseña?».</div>
      </div>
      <div class="field">
        <label class="label" for="reset-password">Nueva contraseña</label>
        <div class="input-icon">
          ${icon('lock')}
          <input class="input" id="reset-password" name="password" type="password" autocomplete="new-password" placeholder="••••••••" minlength="8" required />
          <button type="button" class="icon-btn sm" data-action="toggle-password" data-input="reset-password" style="position:absolute;right:5px;top:5px;border:0;background:transparent" aria-label="Mostrar contraseña">${icon('eye')}</button>
        </div>
      </div>
      <div class="field">
        <label class="label" for="reset-confirm">Confirmar contraseña</label>
        <div class="input-icon">${icon('lock')}<input class="input" id="reset-confirm" name="confirm" type="password" autocomplete="new-password" placeholder="••••••••" minlength="8" required /></div>
      </div>
      <button class="btn btn-primary btn-block" type="submit">${icon('check')} Cambiar contraseña</button>
    </form>`,
  })
}

/* ── Verificación del correo después del registro ───────────────────────── */
export function openVerifyModal(email = '') {
  const cfg = state.config || {}
  openModal({
    title: 'Verifica tu correo',
    subtitle: 'Te enviamos un código de 6 dígitos. Escríbelo para activar tu cuenta.',
    body: `<form id="auth-verify-form">
      <div class="form-error">${icon('alert')}<span></span></div>
      <div class="field">
        <label class="label" for="verify-email">Correo</label>
        <div class="input-icon">${icon('mail')}<input class="input" id="verify-email" name="email" type="email" value="${h(email)}" autocomplete="email" placeholder="tu@correo.com" required /></div>
        <div class="hint">El mismo correo con el que te registraste.</div>
      </div>
      <div class="field">
        <label class="label" for="verify-code">Código de 6 dígitos</label>
        <input class="input code-input" id="verify-code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="\\d{6}" placeholder="000000" required />
        <div class="hint">Revisa la bandeja de entrada y la carpeta de spam.</div>
      </div>
      <button class="btn btn-primary btn-block" type="submit">${icon('check')} Verificar y entrar</button>
      <div class="auth-forgot"><button type="button" class="link-btn" data-action="auth-verify-resend">Reenviar código</button></div>
    </form>`,
  })
  if (!cfg.mailConfigured) {
    showToast('El envío de correos aún no está configurado. Avisa al administrador del panel.', 'warn')
  }
}

export async function handleVerifyEmail(form) {
  const email = form.querySelector('[name="email"]')?.value.trim() || ''
  const code = String(form.querySelector('[name="code"]')?.value || '').replace(/\D/g, '')
  const submit = form.querySelector('button[type="submit"]')
  hideFormError(form)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showFormError(form, 'Escribe el correo con el que te registraste.')
    return
  }
  if (!/^\d{6}$/.test(code)) {
    showFormError(form, 'El código debe tener 6 dígitos.')
    return
  }
  setLoading(submit, true, 'Verificando…')
  try {
    const data = await api.post('/api/auth/verify', { email, code })
    state.user = data.user
    state.csrf = data.csrf
    state.authTab = 'login'
    try {
      const config = await api.get('/api/config')
      state.config = { ...(state.config || {}), ...config }
    } catch {}
    entrarAlPanel()
    showToast('Correo verificado. ¡Bienvenido!', 'success')
  } catch (error) {
    showFormError(form, error.message || 'No se pudo verificar el correo.')
    setLoading(submit, false)
  }
}

export async function handleVerifyResend() {
  const form = document.getElementById('auth-verify-form')
  const email = form?.querySelector('[name="email"]')?.value.trim() || ''
  if (!form) return
  hideFormError(form)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showFormError(form, 'Escribe el correo con el que te registraste.')
    return
  }
  try {
    const data = await api.post('/api/auth/verify/send', { email })
    if (data.emailSent) showToast('Código reenviado. Revisa tu correo.', 'success')
    else if (data.emailReason === 'mail_not_configured') showToast('El envío de correos no está configurado. Avisa al administrador.', 'warn')
    else if (data.emailReason === 'email_code_cooldown') showToast('Espera un momento antes de pedir otro código.', 'warn')
    else if (data.emailReason === 'email_code_limit') showToast('Pediste demasiados códigos. Inténtalo más tarde.', 'warn')
    else showToast('No se pudo enviar el código.', 'warn')
  } catch (error) {
    showFormError(form, error.message || 'No se pudo reenviar el código.')
  }
}

export async function handleForgotPassword(form) {
  const email = form.querySelector('[name="email"]')?.value.trim() || ''
  const submit = form.querySelector('button[type="submit"]')
  hideFormError(form)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showFormError(form, 'Escribe un correo válido.')
    return
  }
  if (state.config?.turnstileSiteKey && !state.turnstileToken) {
    showFormError(form, 'Completa la verificación de seguridad.')
    return
  }
  setLoading(submit, true, 'Enviando…')
  try {
    const data = await api.post('/api/auth/forgot', { email, turnstileToken: state.turnstileToken || '' })
    if (data.mailConfigured === false) {
      showToast('El correo todavía no está configurado. Avisa al administrador del panel.', 'warn')
    } else {
      showToast('Si el correo está registrado, recibirás un código.', 'success')
    }
    openResetModal(email)
  } catch (error) {
    showFormError(form, error.message || 'No se pudo solicitar el código.')
    setLoading(submit, false)
    reiniciarTurnstile()
  }
}

export async function handleResetPassword(form) {
  const email = form.querySelector('[name="email"]')?.value.trim() || ''
  const code = String(form.querySelector('[name="code"]')?.value || '').replace(/\D/g, '')
  const password = String(form.querySelector('[name="password"]')?.value || '')
  const confirm = String(form.querySelector('[name="confirm"]')?.value || '')
  const submit = form.querySelector('button[type="submit"]')
  hideFormError(form)
  if (!/^\d{6}$/.test(code)) {
    showFormError(form, 'El código debe tener 6 dígitos.')
    return
  }
  if (password.length < 8) {
    showFormError(form, 'La nueva contraseña debe tener al menos 8 caracteres.')
    return
  }
  if (password !== confirm) {
    showFormError(form, 'Las contraseñas no coinciden.')
    return
  }
  setLoading(submit, true, 'Cambiando…')
  try {
    await api.post('/api/auth/reset', { email, code, password })
    closeModal()
    state.authTab = 'login'
    openAuthModal()
    showToast('Contraseña restablecida. Ya puedes iniciar sesión.', 'success')
  } catch (error) {
    showFormError(form, error.message || 'No se pudo cambiar la contraseña.')
    setLoading(submit, false)
  }
}

/* ── Handlers de autenticación ──────────────────────────────────────────── */
export async function handleAuth(form) {
  const mode = form.dataset.mode === 'register' ? 'register' : 'login'
  const username = form.querySelector('[name="username"]')?.value.trim() || ''
  const password = form.querySelector('[name="password"]')?.value || ''
  const email = form.querySelector('[name="email"]')?.value.trim() || ''
  const confirm = form.querySelector('[name="confirm"]')?.value || ''
  const invite = form.querySelector('[name="invite"]')?.value.trim() || ''
  const submit = form.querySelector('button[type="submit"]')

  const cfg = state.config || {}

  hideFormError(form)
  if (mode === 'register' && password !== confirm) {
    showFormError(form, 'Las contraseñas no coinciden.')
    return
  }
  if (mode === 'register' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showFormError(form, 'Escribe un correo válido.')
    return
  }
  if (cfg.turnstileSiteKey && !state.turnstileToken) {
    showFormError(form, 'Completa la verificación de seguridad.')
    return
  }

  setLoading(submit, true, mode === 'register' ? 'Creando cuenta…' : 'Entrando…')
  try {
    const data = mode === 'register'
      ? await api.post('/api/auth/register', { username, email, password, invite, turnstileToken: state.turnstileToken || '' })
      : await api.post('/api/auth/login', { username, password, turnstileToken: state.turnstileToken || '' })

    // Con la verificación obligatoria activa el registro no abre sesión: hay
    // que confirmar el código del correo primero.
    if (data.pendingVerification) {
      state.user = null
      state.csrf = null
      state.authTab = 'login'
      openVerifyModal(email)
      showToast(
        data.emailSent
          ? 'Cuenta creada. Te enviamos un código para verificar tu correo.'
          : 'Cuenta creada, pero no se pudo enviar el correo. Pide el código aquí o avisa al administrador.',
        data.emailSent ? 'success' : 'warn'
      )
      return
    }

    state.user = data.user
    state.csrf = data.csrf
    state.authTab = 'login'
    try {
      const config = await api.get('/api/config')
      state.config = { ...(state.config || {}), ...config }
    } catch {}
    entrarAlPanel()
    const avisoCorreo = mode === 'register' && data.emailVerified === false
    showToast(
      mode === 'register'
        ? (avisoCorreo ? 'Cuenta creada. Verifica tu correo desde Mi cuenta.' : 'Cuenta creada. Bienvenido.')
        : 'Bienvenido de vuelta.',
      'success'
    )
  } catch (error) {
    if (error.code === 'email_not_verified') {
      openVerifyModal('')
      showToast(error.message || 'Verifica tu correo para entrar.', 'warn')
      setLoading(submit, false)
      return
    }
    showFormError(form, error.message || 'No se pudo completar la operación.')
    setLoading(submit, false)
    reiniciarTurnstile()
  }
}

export async function handleLogout() {
  await disablePush(true)
  stopPushClient()
  state.adminPushUsers=[];state.adminPushSelection=new Set();state.pushQuery='';state.pushOffset=0;state.pushSelectionOwner=null
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
  state.main = null
  state.mainCode = null
  closeModal()
  renderAuth()
  showToast('Sesión cerrada.', 'info')
}

// La app registra aquí cómo entrar al panel después de un login correcto.
// Así este módulo no depende del shell ni del router.
let entrarAlPanel = () => {}

export function definirEntradaAlPanel(fn) {
  entrarAlPanel = fn
}
