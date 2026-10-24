/* Pain Panel — módulo pages-user */
import { pushAccountHTML } from './push.js'
import { api } from './api.js'
import {
  attachRowFilter,
  badge,
  content,
  emptyState,
  errorPage,
  fmtDate,
  fmtPhone,
  fmtRelative,
  h,
  icon,
  isLinkRoute,
  loadingPage,
  roleBadge,
  setPage,
  showToast,
  statCard,
  state,
  statusIconTone,
  stopCountdown,
  stopPairingPolling,
  updateNavBadges,
} from './core.js'

/* ── Bots del usuario ───────────────────────────────────────────────────── */
export async function loadBots() {
  const data = await api.get('/api/bots')
  state.bots = Array.isArray(data.bots) ? data.bots : []
  state.botLimit = data.limit || null
  updateNavBadges()
  return state.bots
}

export function botRow(bot) {
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
      <button class="icon-btn sm" data-action="bot-config" data-phone="${h(bot.phone)}" title="Configurar" aria-label="Configurar sub-bot">${icon('settings')}</button>
      <button class="icon-btn sm" data-action="bot-reconnect" data-phone="${h(bot.phone)}" title="Reconectar" ${canReconnect ? '' : 'disabled'}>${icon('rotate')}</button>
      <button class="icon-btn sm" data-action="bot-relink" data-phone="${h(bot.phone)}" title="Re-vincular" aria-label="Re-vincular sub-bot">${icon('link')}</button>
      <button class="icon-btn sm" data-action="bot-rename" data-phone="${h(bot.phone)}" data-label="${h(bot.label || '')}" title="Renombrar" aria-label="Renombrar sub-bot">${icon('pencil')}</button>
      <button class="icon-btn sm danger" data-action="bot-delete" data-phone="${h(bot.phone)}" data-label="${h(label)}" title="Eliminar" aria-label="Eliminar sub-bot">${icon('trash')}</button>
    </div></td>
  </tr>`
}

export function botsTable(bots, limit = 0) {
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
export async function renderDashboard() {
  setPage('Dashboard', 'Resumen de tu cuenta y tus sub-bots')
  content(loadingPage('Cargando tu dashboard…'))
  let globalStats = null
  try {
    const [, statsData] = await Promise.all([loadBots(), api.get('/api/stats').catch(() => null)])
    globalStats = statsData || state.stats || null
    if (globalStats) state.stats = globalStats
  } catch (error) {
    content(errorPage(error.message))
    return
  }
  const isAdmin = state.user?.role === 'admin'
  if (isAdmin) {
    try {
      const data = await api.get('/api/main')
      state.main = data.main || null
    } catch {}
  }
  const bots = state.bots
  const total = bots.length
  const connected = bots.filter((bot) => bot.status === 'connected').length
  const relink = bots.filter((bot) => bot.status === 'relink').length
  const pending = bots.filter((bot) => ['pairing', 'pending'].includes(bot.status)).length
  const maxSubs = Number(state.config?.maxSubs || 0)
  const slots = maxSubs > 0 ? `${total}/${maxSubs}` : 'Ilimitado'
  const publicUrl = state.config?.publicUrl || ''
  const mainLinked = isAdmin
    ? Boolean(state.main?.linked)
    : state.config?.mainLinked !== false
  const mainPhone = state.main?.phone || ''
  // Totales de toda la instancia (no solo los de esta cuenta).
  const servidor = globalStats || {}
  const cuenta = (valor) => {
    if (valor === null || valor === undefined || valor === '') return null
    const numero = Number(valor)
    return Number.isFinite(numero) ? numero : null
  }
  const usuariosTotal = cuenta(servidor.users)
  const botsTotal = cuenta(servidor.bots)
  const conectadosTotal = cuenta(servidor.sessionsConnected)
  const guardadasTotal = cuenta(servidor.sessions)
  const guardadasCreds = cuenta(servidor.sessionsSaved)

  content(`
    <div class="page-head">
      <div><h2>Hola, ${h(state.user.username)}</h2><p>Estado en vivo de tu cuenta y tus sub-bots.</p></div>
      <div class="page-actions">
        <a class="btn btn-secondary" href="#/bots">${icon('bot')} Ver todos</a>
        <a class="btn btn-primary" href="#/link">${icon('plus')} Vincular bot</a>
      </div>
    </div>
    ${mainLinked ? '' : `<div class="notice" style="margin-bottom:16px">${icon('info')}<div>El <b>bot principal</b> todavía no está vinculado. Tus sub-bots funcionan igual: solo falta el número que atiende los comandos del propietario.${isAdmin ? ' Vincúlalo desde <a href="#/admin/principal"><b>Administración → Bot principal</b></a>.' : ' Avisa al administrador del servidor.'}</div></div>`}
    <div class="stats-group">
      <div class="stats-group-head"><b>Total del servidor</b><span>Lo que hay ahora mismo en toda la instancia</span></div>
      <div class="stats-row">
        ${statCard('Usuarios', usuariosTotal ?? '—', 'users', 'violet', '<span>Cuentas registradas</span>')}
        ${statCard('Sub-bots', botsTotal ?? '—', 'bot', 'cyan', '<span>Vinculados en el panel</span>')}
        ${statCard('Conectados', conectadosTotal ?? '—', 'wifi', (conectadosTotal || 0) > 0 ? 'green' : 'muted', '<span>Sesiones en línea</span>')}
        ${statCard('Guardadas', guardadasTotal ?? '—', 'server', 'amber', `<span>${guardadasCreds ?? '—'} con credenciales</span>`)}
      </div>
    </div>
    <div class="stats-group">
      <div class="stats-group-head"><b>Tu cuenta</b><span>Solo los números vinculados a ti</span></div>
      <div class="stats-row">
        ${statCard('Tus sub-bots', total, 'bot', 'accent', `<span>${total === 1 ? '1 número vinculado' : `${total} números vinculados`}</span>`)}
        ${statCard('Conectados', connected, 'wifi', connected > 0 ? 'green' : 'muted', '<span>De tu cuenta</span>')}
        ${statCard('Requieren atención', relink, 'alert', 'amber', '<span>Necesitan re-vincularse</span>')}
        ${statCard('Plazas', slots, 'server', 'cyan', `<span>${maxSubs > 0 ? 'Límite del servidor' : 'Sin límite configurado'}</span>`)}
      </div>
    </div>
    <div class="grid-2">
      <div class="stack">
        <div class="card">
          <div class="card-head">
            <div><h3>Tus bots</h3><p>${total ? `${total} ${total === 1 ? 'sub-bot registrado' : 'sub-bots registrados'}` : 'Aún no has vinculado ningún número'}</p></div>
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
        ${isAdmin ? `<div class="card">
          <div class="card-head">
            <div><h3>Bot principal</h3><p>La sesión principal del servidor</p></div>
            <span class="badge ${mainLinked ? 'success' : 'warn'}"><span class="dot"></span>${mainLinked ? 'Vinculado' : 'Sin vincular'}</span>
          </div>
          <div class="card-body">
            <div class="main-hero">
              <div class="main-hero-logo"><img src="/assets/logo.webp" alt="" /></div>
              <div class="main-hero-info">
                <h3>${mainPhone ? h(fmtPhone(mainPhone)) : 'Sin número'}</h3>
                <p>${state.main?.connected ? 'Conectado a WhatsApp' : 'Socket cerrado'}</p>
              </div>
            </div>
            <a class="btn btn-secondary btn-block" style="margin-top:14px" href="#/admin/principal">${icon('bot')} Gestionar el bot principal</a>
          </div>
        </div>` : ''}
        <div class="card">
          <div class="card-head"><div><h3>Acceso rápido</h3><p>Tu panel público</p></div><span class="badge success"><span class="dot"></span>En línea</span></div>
          <div class="card-body">
            <div class="field">
              <label class="label">URL del panel</label>
              <div class="input-group">
                <input class="input mono" readonly value="${h(publicUrl)}" />
                <button class="btn btn-secondary" data-action="copy" data-copy="${h(publicUrl)}" title="Copiar">${icon('copy')}</button>
              </div>
              <div class="hint">Esta es la dirección con la que entra tu equipo. El subdominio se configura en <span class="mono">config.js</span> o en las variables <span class="mono">PAIN_WEB_*</span>.</div>
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

  // Auto-actualizar datos del dashboard cada 30s (solo mientras se esté en esta ruta).
  // Evita repintar si el usuario está escribiendo en la vista y conserva la posición de scroll.
  if (state.dashboardPoll) clearInterval(state.dashboardPoll)
  state.dashboardPoll = setInterval(async () => {
    if (document.hidden) return
    if (location.hash.replace(/^#/, '') !== '/dashboard' && location.hash.replace(/^#/, '') !== '') return
    const activo = document.activeElement
    if (activo && activo.closest?.('#content')) {
      const tag = activo.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
    }
    const scrollY = window.scrollY
    try {
      await renderDashboard()
      window.scrollTo(0, scrollY)
    } catch {}
  }, 30_000)
  state.dashboardPoll.unref?.()
}

/* ── Mis bots ───────────────────────────────────────────────────────────── */
export async function renderBots() {
  setPage('Mis bots', 'Administra las sesiones de WhatsApp vinculadas a tu cuenta')
  content(loadingPage('Cargando tus bots…'))
  try {
    await loadBots()
  } catch (error) {
    content(errorPage(error.message))
    return
  }
  const bots = state.bots
  const limite = state.botLimit || null
  const limiteAlcanzado = Boolean(limite && !limite.unlimited && limite.used >= limite.max)
  content(`
    <div class="page-head">
      <div><h2>Mis bots</h2><p>${bots.length} ${bots.length === 1 ? 'sub-bot vinculado' : 'sub-bots vinculados'} a tu cuenta.${limite && !limite.unlimited ? ` Límite: ${limite.used}/${limite.max}.` : ''}</p></div>
      <div class="page-actions">
        <button class="btn btn-secondary" data-action="refresh">${icon('refresh')} Actualizar</button>
        <a class="btn btn-primary" href="#/link" ${limiteAlcanzado ? 'aria-disabled="true"' : ''}>${icon('plus')} Vincular bot</a>
      </div>
    </div>
    ${limiteAlcanzado ? `<div class="notice warn" style="margin-bottom:16px">${icon('alert')}<div>Tu cuenta ya llegó al límite de <b>${limite.max}</b> sub-bot(s). Pide al administrador del servidor que lo amplíe si necesitas más.</div></div>` : ''}
    <div class="card">
      <div class="card-head">
        <div><h3>Sub-bots</h3><p>Estado actual de cada sesión vinculada</p></div>
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
export function stepsCardHTML() {
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

export function linkFormHTML() {
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

export function pairingCardHTML() {
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
  const ttlCodigo = Number(state.config?.pairCodeTtlMs || 90_000)
  const total = status === 'code_ready' ? ttlCodigo : 180_000
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

export function renderLinkPage() {
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

export function startPairingPolling(id) {
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

export function startCountdown() {
  stopCountdown()
  if (!state.pairing) return
  const tick = () => {
    const pairing = state.pairing
    if (!pairing) return
    const text = document.getElementById('pairing-countdown')
    const bar = document.getElementById('pairing-progress')
    if (!text && !bar) return
    const ttlCodigo = Number(state.config?.pairCodeTtlMs || 90_000)
    const total = pairing.status === 'code_ready' ? ttlCodigo : 180_000
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

/* ── Comunidades de WhatsApp ────────────────────────────────────────────── */
export async function renderCommunities() {
  setPage('Comunidades', 'Entra a los grupos de la comunidad de WhatsApp')
  content(loadingPage('Cargando comunidades…'))
  try {
    const data = await api.get('/api/communities')
    const comunidades = Array.isArray(data.communities) ? data.communities : []
    content(`
      <div class="page-head">
        <div><h2>Comunidades</h2><p>${comunidades.length ? 'Entra con un clic a la comunidad que quieras.' : 'Todavía no hay comunidades publicadas.'}</p></div>
      </div>
      ${comunidades.length ? `<div class="community-grid">${comunidades.map((comunidad) => `
        <div class="community-card">
          <div class="community-head">
            <div class="community-icon">${icon('users')}</div>
            <div class="grow">
              <div class="cell-title">${h(comunidad.name)}</div>
              ${comunidad.description ? `<div class="cell-sub">${h(comunidad.description)}</div>` : ''}
            </div>
          </div>
          <a class="btn btn-primary btn-block" href="${h(comunidad.link)}" target="_blank" rel="noopener noreferrer">${icon('external')} Unirme a la comunidad</a>
          <button class="btn btn-ghost btn-sm btn-block" style="margin-top:8px" data-action="copy" data-copy="${h(comunidad.link)}">${icon('copy')} Copiar enlace</button>
        </div>`).join('')}</div>` : `<div class="card">${emptyState('globe', 'Sin comunidades todavía', 'El administrador todavía no ha publicado ninguna comunidad. Vuelve más tarde.')}</div>`}`)
  } catch (error) {
    content(errorPage(error.message))
  }
}

/* ── Mi cuenta ──────────────────────────────────────────────────────────── */
export function renderAccount() {
  setPage('Mi cuenta', 'Datos de acceso y seguridad del panel')
  const user = state.user
  const cfg = state.config || {}
  content(`
    <div class="page-head"><div><h2>Mi cuenta</h2><p>Información de tu perfil y seguridad.</p></div></div>
    <div id="account-push" style="margin-bottom:20px">${pushAccountHTML()}</div>
    <div class="grid-2">
      <div class="stack">
        <div class="card">
          <div class="card-head"><div><h3>Perfil</h3><p>Información de tu cuenta</p></div>${roleBadge(user.role, user.isPrincipal ? 'Principal' : user.roleName)}</div>
          <div class="card-body">
            <div class="system-grid">
              <div class="system-item"><div class="si-label">Usuario</div><div class="si-value" style="font-size:13px">${h(user.username)}</div></div>
              <div class="system-item"><div class="si-label">Correo</div><div class="si-value" style="font-size:13px">${h(user.email || 'Sin correo')} ${user.email ? (user.emailVerified ? '<span class="badge success" style="font-size:9px">Verificado</span>' : '<span class="badge warn" style="font-size:9px">Sin verificar</span>') : ''}</div></div>
              <div class="system-item"><div class="si-label">Registro</div><div class="si-value" style="font-size:13px">${fmtDate(user.created_at, false)}</div></div>
              <div class="system-item"><div class="si-label">Último acceso</div><div class="si-value" style="font-size:13px">${user.last_login_at ? fmtRelative(user.last_login_at) : '—'}</div></div>
            </div>
            <form id="email-form" style="margin-top:18px">
              <div class="form-error">${icon('alert')}<span></span></div>
              <div class="form-success">${icon('check')}<span></span></div>
              <div class="field">
                <label class="label" for="account-email">${user.email ? 'Cambiar correo' : 'Añadir correo'}</label>
                <div class="input-icon">${icon('mail')}<input class="input" id="account-email" name="email" type="email" autocomplete="email" placeholder="tu@correo.com" value="${h(user.email || '')}" required /></div>
                <div class="hint">Con un correo tu cuenta gana seguridad y puedes recuperar el acceso.</div>
              </div>
              <button class="btn btn-primary" type="submit">${icon('check')} Guardar correo</button>
            </form>
            ${user.email && !user.emailVerified ? `<div class="verify-box">
              <div class="verify-head">${icon('mail')}<div><b>Verifica tu correo</b><span>Enviamos un código de 6 dígitos a ${h(user.email)}.</span></div></div>
              <form id="email-verify-form">
                <div class="form-error">${icon('alert')}<span></span></div>
                <div class="form-success">${icon('check')}<span></span></div>
                <div class="field"><label class="label" for="email-code">Código de verificación</label><input class="input code-input" id="email-code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="\\d{6}" placeholder="000000" required /></div>
                <div class="flex gap-8" style="flex-wrap:wrap">
                  <button class="btn btn-primary" type="submit">${icon('check')} Verificar correo</button>
                  <button class="btn btn-secondary" type="button" data-action="email-verify-resend">${icon('refresh')} Reenviar código</button>
                </div>
                <div class="hint">Caduca en 15 minutos. Revisa también la carpeta de spam.</div>
              </form>
            </div>` : ''}
            ${user.email && user.emailVerified ? `<div class="verify-ok">${icon('shieldCheck')} <span>Tu correo está verificado. Puedes recuperar tu cuenta si olvidas la contraseña.</span></div>` : ''}
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
