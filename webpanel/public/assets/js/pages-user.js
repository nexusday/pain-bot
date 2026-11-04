/* Pain Panel — módulo pages-user */
import { pushAccountHTML } from './push.js'
import { api } from './api.js'
import { anunciosCabeceraHTML, anunciosPieHTML, premiumPromoHTML, programarPromoPremium } from './pages-premium.js'
import { dashboardGlobalStatsHTML } from './stats.js'
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
  initials,
  isLinkRoute,
  loadingPage,
  openModal,
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
  const premium = Boolean(bot.premium?.active)
  const sub = bot.label ? fmtPhone(bot.phone) : 'WhatsApp'
  const tipo = premium ? 'SUBBOT PREMIUM' : 'SUBBOT'
  const insigniaPremium = premium
    ? '<span class="badge accent" style="font-size:9px;padding:1px 6px;margin-left:6px">PREMIUM</span>'
    : ''
  const canReconnect = ['linked', 'connected', 'unknown', 'missing'].includes(bot.status)
  const search = `${bot.phone} ${bot.label || ''} ${bot.status}`.toLowerCase()
  return `<tr data-bot-row data-search="${h(search)}">
    <td><div class="cell-main">
      <div class="row-icon ${statusIconTone(bot.status)}">${icon('bot')}</div>
      <div class="grow"><div class="cell-title">${h(label)}${insigniaPremium}</div><div class="cell-sub">${h(sub)} · ${tipo}</div></div>
    </div></td>
    <td>${badge(bot.status)}</td>
    <td>${bot.worker ? `<span class="mono tiny muted">${h(bot.worker)}</span>` : '<span class="tiny muted">—</span>'}</td>
    <td><span class="tiny muted">${fmtDate(bot.linked_at)}</span></td>
    <td><div class="actions">
      <button class="btn btn-ghost btn-sm" data-action="bot-config" data-phone="${h(bot.phone)}" title="Editar este sub-bot" aria-label="Editar este sub-bot">${icon('settings')} <span>Editar</span></button>
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
  const saved = bots.filter((bot) => bot.status === 'linked').length
  const relink = bots.filter((bot) => bot.status === 'relink').length
  const pending = bots.filter((bot) => ['pairing', 'pending'].includes(bot.status)).length
  const premiumActivos = bots.filter((bot) => bot.premium?.active).length
  const sinPremium = total - premiumActivos
  const maxSubs = Number(state.botLimit?.max || 0)
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
  const premiumActivosServidor = cuenta(servidor.premiumActive)
  const premiumGuardadosServidor = cuenta(servidor.premiumSaved)

  content(`
    ${anunciosCabeceraHTML()}
    <div class="page-head">
      <div><h2>Hola, ${h(state.user.username)}</h2><p>Estado en vivo de tu cuenta y tus sub-bots.</p></div>
      <div class="page-actions">
        <a class="btn btn-secondary" href="#/bots">${icon('bot')} Ver todos</a>
        <a class="btn btn-primary" href="#/link">${icon('plus')} Vincular bot</a>
      </div>
    </div>
    ${mainLinked ? '' : `<div class="notice" style="margin-bottom:16px">${icon('info')}<div>El <b>bot principal</b> todavía no está vinculado. Tus sub-bots funcionan igual: solo falta el número que atiende los comandos del propietario.${isAdmin ? ' Vincúlalo desde <a href="#/admin/principal"><b>Administración → Bot principal</b></a>.' : ' Avisa al administrador del servidor.'}</div></div>`}
    <div class="stats-group dashboard-account-group">
      <div class="stats-group-head"><b>Tu cuenta</b><span>Solo los números vinculados a ti</span></div>
      <div class="stats-row">
        ${statCard('Vinculados', total, 'bot', 'accent', `<span>${total === 1 ? '1 número registrado' : `${total} números registrados`}</span>`)}
        ${statCard('Conectados ahora', connected, 'wifi', connected > 0 ? 'green' : 'muted', '<span>De tu cuenta</span>')}
        ${statCard('Guardados', saved, 'server', saved > 0 ? 'cyan' : 'muted', '<span>Desconectados, con sesión</span>')}
        ${statCard('Requieren atención', relink, 'alert', 'amber', '<span>Necesitan re-vincularse</span>')}
        ${statCard('Plazas', slots, 'server', 'cyan', `<span>${maxSubs > 0 ? `${Math.max(0, maxSubs - total)} disponibles` : 'Sin límite configurado'}</span>`)}
      </div>
    </div>
    <div class="stats-group dashboard-server-group">
      <div class="stats-group-head"><b>Resumen del servidor</b><span>Actividad general de esta instancia</span></div>
      <div class="stats-row">
        ${statCard('Usuarios', usuariosTotal ?? '—', 'users', 'violet', '<span>Cuentas registradas</span>')}
        ${statCard('Vinculados', botsTotal ?? '—', 'bot', 'cyan', '<span>Registros de sub-bots</span>')}
        ${statCard('Conectados ahora', conectadosTotal ?? '—', 'wifi', (conectadosTotal || 0) > 0 ? 'green' : 'muted', '<span>Sesiones en línea</span>')}
        ${statCard('Sesiones guardadas', guardadasTotal ?? '—', 'server', 'amber', `<span>${guardadasCreds ?? '—'} con credenciales</span>`)}
        ${statCard('Premium activos', premiumActivosServidor ?? '—', 'sparkles', (premiumActivosServidor || 0) > 0 ? 'violet' : 'muted', '<span>Con plan vigente</span>')}
        ${statCard('Premium guardados', premiumGuardadosServidor ?? '—', 'zap', (premiumGuardadosServidor || 0) > 0 ? 'cyan' : 'muted', '<span>Cambios guardados, sin plan</span>')}
      </div>
    </div>
    <div id="dashboard-global-stats">${dashboardGlobalStatsHTML(servidor)}</div>
    <div class="grid-2">
      <div class="stack">
        <div class="card">
          <div class="card-head">
            <div><h3>Tus bots</h3><p>${total ? `${total} ${total === 1 ? 'sub-bot registrado' : 'sub-bots registrados'}${premiumActivos ? ` · ${premiumActivos} premium` : ''}` : 'Aún no has vinculado ningún número'}</p></div>
            <a class="btn btn-ghost btn-sm" href="#/bots">Gestionar ${icon('chevronRight')}</a>
          </div>
          <div class="card-body tight">${botsTable(bots, 5)}</div>
        </div>
        <section class="premium-invite" aria-labelledby="dashboard-premium-title">
          <div class="premium-invite-icon" aria-hidden="true">${icon('sparkles')}</div>
          <div class="premium-invite-copy">
            <span class="premium-invite-label">SUB-BOT PREMIUM · GRATIS CON ANUNCIOS</span>
            <h3 id="dashboard-premium-title">Tu sub-bot, con tu propio estilo.</h3>
            <p>¿Quieres que tu sub-bot sea Premium? Mira anuncios y gana tiempo para personalizarlo.</p>
            <div class="premium-invite-perks"><span>Menú a tu gusto</span><span>Tu moneda</span><span>Tu canal</span></div>
          </div>
          <a class="btn premium-invite-button" href="#/premium">Quiero ser Premium ${icon('chevronRight')}</a>
        </section>
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
    </div>
    ${anunciosPieHTML()}
    ${premiumPromoHTML()}
  `)
  programarPromoPremium()

  // No repintar todo el Dashboard automáticamente: eso recreaba anuncios,
  // tarjetas y formularios cada 30 s y parecía una recarga de la página.
  // Las estadísticas globales ya se actualizan con el polling ligero de stats.js.
  if (state.dashboardPoll) {
    clearInterval(state.dashboardPoll)
    state.dashboardPoll = null
  }
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
    ${anunciosCabeceraHTML()}
    <div class="page-head">
       <div><h2>Mis bots</h2><p>${bots.length} ${bots.length === 1 ? 'sub-bot vinculado' : 'sub-bots vinculados'} a tu cuenta. La tabla incluye conectados, guardados y los que requieren re-vincularse.${limite && !limite.unlimited ? ` Cupos: ${limite.used}/${limite.max} · ${limite.remaining} disponibles.` : ' Cupos ilimitados.'}</p></div>
      <div class="page-actions">
        <button class="btn btn-secondary" data-action="refresh">${icon('refresh')} Actualizar</button>
        <a class="btn btn-primary" href="#/link" ${limiteAlcanzado ? 'aria-disabled="true"' : ''}>${icon('plus')} Vincular bot</a>
      </div>
    </div>
    ${limiteAlcanzado ? `<div class="notice warn" style="margin-bottom:16px">${icon('alert')}<div>Tu cuenta ya llegó al límite de <b>${limite.max}</b> sub-bot(s). Pide al administrador del servidor que lo amplíe si necesitas más.</div></div>` : ''}
    <div class="card">
      <div class="card-head">
         <div><h3>Sub-bots vinculados</h3><p>Conectados ahora, guardados o pendientes de re-vinculación</p></div>
        <div class="input-icon" style="max-width:290px;width:100%">
          ${icon('search')}
          <input id="bots-search" class="input" placeholder="Buscar por número o nombre…" value="${h(state.botsFilter)}" />
        </div>
      </div>
      <div class="card-body tight">${botsTable(bots)}</div>
    </div>
    <section class="premium-invite" aria-labelledby="premium-invite-title">
      <div class="premium-invite-icon" aria-hidden="true">${icon('sparkles')}</div>
      <div class="premium-invite-copy">
        <span class="premium-invite-label">SUB-BOT PREMIUM · GRATIS CON ANUNCIOS</span>
        <h3 id="premium-invite-title">Tu sub-bot, con tu propio estilo.</h3>
        <p>¿Quieres que tu sub-bot sea Premium? Mira anuncios y gana tiempo para personalizarlo.</p>
        <div class="premium-invite-perks"><span>Menú a tu gusto</span><span>Tu moneda</span><span>Tu canal</span></div>
      </div>
      <a class="btn premium-invite-button" href="#/premium">Quiero ser Premium ${icon('chevronRight')}</a>
    </section>
     ${anunciosPieHTML()}${premiumPromoHTML()}`)
   programarPromoPremium()
  attachRowFilter('#bots-search', '[data-bot-row]')
}

/* ── Vincular bot ───────────────────────────────────────────────────────── */
const LINK_TUTORIAL_STEPS = [
  {
    label: 'Prepara tu WhatsApp',
    title: 'Abre Dispositivos vinculados',
    text: 'En tu teléfono abre WhatsApp y entra al menú de ajustes. No cierres esta página mientras realizas el proceso.',
    screen: 'home',
    detail: 'WhatsApp → Ajustes',
  },
  {
    label: 'Busca la opción',
    title: 'Entra en Dispositivos vinculados',
    text: 'Toca Dispositivos vinculados. Ahí verás las sesiones que ya tienes conectadas y el botón para agregar una nueva.',
    screen: 'settings',
    detail: 'Ajustes → Dispositivos vinculados',
  },
  {
    label: 'Inicia el vínculo',
    title: 'Toca “Vincular un dispositivo”',
    text: 'Pulsa el botón de vincular. Cuando WhatsApp muestre las opciones, elige Vincular con número de teléfono.',
    screen: 'devices',
    detail: 'Dispositivos vinculados → Vincular un dispositivo',
  },
  {
    label: 'Confirma',
    title: 'Escribe el código de 8 caracteres',
    text: 'Copia el código real que aparece en este panel y escríbelo en WhatsApp. El vínculo se completará automáticamente.',
    screen: 'code',
    detail: 'Vincular con número de teléfono → Confirmar',
  },
]

function tutorialPhoneHTML(screen) {
  const rows = screen === 'home'
    ? `<div class="tutorial-wa-row"><span class="tutorial-wa-avatar">P</span><div><b>Chats</b><small>Tus conversaciones</small></div><span class="tutorial-wa-chevron">›</span></div>
       <div class="tutorial-wa-row tutorial-wa-focus"><span class="tutorial-wa-avatar green">⚙</span><div><b>Ajustes</b><small>Cuenta, privacidad y más</small></div><span class="tutorial-wa-chevron">›</span></div>`
    : screen === 'settings'
      ? `<div class="tutorial-wa-title">Ajustes</div><div class="tutorial-wa-row"><span class="tutorial-wa-avatar green">⌁</span><div><b>Cuenta</b><small>Privacidad y seguridad</small></div></div><div class="tutorial-wa-row tutorial-wa-focus"><span class="tutorial-wa-avatar blue">▣</span><div><b>Dispositivos vinculados</b><small>Conecta WhatsApp en otros dispositivos</small></div><span class="tutorial-wa-chevron">›</span></div>`
    : screen === 'devices'
        ? `<div class="tutorial-wa-title">Dispositivos vinculados</div><div class="tutorial-wa-device"><span class="tutorial-wa-avatar green">⌁</span><div><b>Este teléfono</b><small>Activo ahora</small></div><span class="tutorial-wa-live"></span></div><div class="tutorial-wa-link tutorial-wa-focus"><span>＋</span><b>Vincular un dispositivo</b></div><div class="tutorial-wa-hint">Después elige “Vincular con número de teléfono”.</div>`
        : `<div class="tutorial-wa-title">Vincular con número de teléfono</div><div class="tutorial-wa-demo-label">EJEMPLO — este no es tu código</div><div class="tutorial-wa-code-label">Escribe aquí el código real del panel</div><div class="tutorial-wa-code">1234 5678</div><div class="tutorial-wa-hint">El código real aparece en el recuadro de vinculación. Es temporal y solo puede usarse una vez.</div>`
  return `<div class="tutorial-phone" aria-label="Simulación de WhatsApp"><div class="tutorial-phone-top"><span class="tutorial-phone-notch"></span><span>9:41</span><span>▴  Wi-Fi  ▰</span></div><div class="tutorial-wa-appbar"><span>‹</span><b>WhatsApp</b><span>⋮</span></div><div class="tutorial-wa-content">${rows}</div><div class="tutorial-wa-bottom"><span>⌂<small>Chats</small></span><span>◌<small>Novedades</small></span><span>♙<small>Comunidades</small></span><span>☎<small>Llamadas</small></span></div></div>`
}

export function openLinkTutorial() {
  let paso = 0
  const pintar = (root) => {
    const item = LINK_TUTORIAL_STEPS[paso]
    const view = root.querySelector('[data-tutorial-view]')
    if (!view) return
    view.innerHTML = `<div class="link-tutorial-scene"><div class="link-tutorial-copy"><div class="tutorial-eyebrow">PASO ${paso + 1} DE ${LINK_TUTORIAL_STEPS.length} · ${h(item.label)}</div><h4>${h(item.title)}</h4><p>${h(item.text)}</p><div class="tutorial-route"><span>${icon('phone')}</span><b>${h(item.detail)}</b></div></div>${tutorialPhoneHTML(item.screen)}</div><div class="tutorial-progress" aria-label="Progreso del tutorial">${LINK_TUTORIAL_STEPS.map((_, i) => `<span class="${i <= paso ? 'is-active' : ''}"></span>`).join('')}</div>`
    const back = root.querySelector('[data-tutorial-back]')
    const next = root.querySelector('[data-tutorial-next]')
    if (back) back.disabled = paso === 0
    if (next) next.innerHTML = paso === LINK_TUTORIAL_STEPS.length - 1 ? `${icon('check')} Ya sé cómo vincular` : `Siguiente ${icon('arrowRight')}`
  }
  openModal({
    title: 'Tutorial de vinculación',
    subtitle: 'Una guía visual rápida para conectar tu número de WhatsApp.',
    wide: true,
    body: `<div class="link-tutorial" data-tutorial-view></div>`,
    footer: `<button class="btn btn-ghost" data-tutorial-back>${icon('chevronRight')} Anterior</button><button class="btn btn-primary" data-tutorial-next>Siguiente ${icon('arrowRight')}</button>`,
    onMount(root) {
      pintar(root)
      root.querySelector('[data-tutorial-back]')?.addEventListener('click', () => { if (paso > 0) { paso--; pintar(root) } })
      root.querySelector('[data-tutorial-next]')?.addEventListener('click', () => {
        if (paso < LINK_TUTORIAL_STEPS.length - 1) { paso++; pintar(root) }
        else { root.querySelector('[data-action="modal-close"]')?.click() }
      })
    },
  })
}

export function stepsCardHTML() {
  return `<div class="card">
     <div class="card-head"><div><h3>Cómo vincular</h3><p>Sigue estos pasos en tu teléfono</p></div><button class="btn btn-secondary btn-sm" type="button" data-action="link-tutorial">${icon('play')} Ver tutorial</button></div>
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
    ${active ? '' : anunciosCabeceraHTML('link')}
    <div class="page-head">
      <div><h2>Vincular un sub-bot</h2><p>La sesión queda registrada en tu cuenta y el supervisor la conecta automáticamente.</p></div>
      <div class="page-actions"><a class="btn btn-secondary" href="#/bots">${icon('bot')} Mis bots</a></div>
    </div>
    <div class="link-layout">
      <div>${state.pairing ? pairingCardHTML() : linkFormHTML()}</div>
      <div>${stepsCardHTML()}</div>
    </div>
    ${active ? '' : anunciosPieHTML('link')}`)

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
      ${anunciosCabeceraHTML('communities')}
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
        </div>`).join('')}</div>` : `<div class="card">${emptyState('globe', 'Sin comunidades todavía', 'El administrador todavía no ha publicado ninguna comunidad. Vuelve más tarde.')}</div>`}
      ${anunciosPieHTML('communities')}`)
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
    ${anunciosCabeceraHTML('account')}
    <div class="page-head"><div><h2>Mi cuenta</h2><p>Información de tu perfil y seguridad.</p></div></div>
    <div id="account-push" style="margin-bottom:20px">${pushAccountHTML()}</div>
    <div class="grid-2">
      <div class="stack">
        <div class="card">
          <div class="card-head"><div><h3>Perfil</h3><p>Información de tu cuenta</p></div>${roleBadge(user.role, user.isPrincipal ? 'Principal' : user.roleName)}</div>
           <div class="card-body">
             <div class="account-profile-photo">
               <div class="account-photo-preview">${user.profileImage ? `<img src="${h(user.profileImage)}?v=${encodeURIComponent(user.emailVerifiedAt || '')}" alt="Foto de perfil" />` : initials(user.username)}</div>
               <div class="account-photo-copy"><b>Foto de perfil</b><span>JPG, PNG, WebP o GIF · máximo 10 MB</span>${user.emailVerified ? `<form id="profile-image-form"><label class="btn btn-secondary btn-sm">${icon('image')} Elegir foto<input name="image" type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden /></label><button class="btn btn-primary btn-sm" type="submit" disabled>Guardar foto</button>${user.profileImage ? '<button class="btn btn-ghost btn-sm" type="button" data-action="profile-image-remove">Quitar</button>' : ''}<span class="account-photo-status" id="profile-image-status">Elige una imagen para ver la vista previa.</span></form>` : '<span class="text-warn">Verifica tu correo para añadir una foto.</span>'}</div>
             </div>
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
    </div>
    ${anunciosPieHTML('account')}`)
}
