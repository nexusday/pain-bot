/* Pain Panel — módulo pages-admin */
import { api } from './api.js'
import {
  attachRowFilter,
  badge,
  confirmModal,
  content,
  emptyState,
  errorPage,
  fmtDate,
  fmtPhone,
  fmtRelative,
  fmtUptime,
  h,
  icon,
  initials,
  isAdminRoute,
  loadingBlock,
  navigate,
  openModal,
  roleBadge,
  setPage,
  showToast,
  statCard,
  state,
  statusIconTone,
  stopTimers,
} from './core.js'

/* ── Administración ─────────────────────────────────────────────────────── */
export function adminTabs(active) {
  const tabs = [
    ['overview', 'Resumen', 'grid'],
    ['principal', 'Bot principal', 'bot'],
    ['users', 'Usuarios', 'users'],
    ['sessions', 'Sesiones', 'server'],
    ['pairings', 'Vinculaciones', 'link'],
    ['communities', 'Comunidades', 'globe'],
    ['audit', 'Auditoría', 'activity'],
    ['settings', 'Ajustes', 'settings'],
  ]
  return `<div class="admin-tabs">${tabs.map(([id, label, iconName]) => `
    <a class="admin-tab ${active === id ? 'active' : ''}" href="#/admin/${id}">${icon(iconName)}${h(label)}</a>`).join('')}</div>`
}

export const ADMIN_META = {
  overview: ['Resumen', 'Estado general del panel y del sistema'],
  principal: ['Bot principal', 'Vincula, cambia o retira el número del bot principal'],
  users: ['Usuarios', 'Cuentas registradas en el panel'],
  sessions: ['Sesiones', 'Sub-bots detectados en el servidor'],
  pairings: ['Vinculaciones', 'Historial de intentos de vinculación'],
  communities: ['Comunidades', 'Comunidades de WhatsApp para los usuarios del panel'],
  audit: ['Auditoría', 'Actividad reciente del panel'],
  settings: ['Ajustes', 'Configuración global del panel'],
}

export async function renderAdmin(section) {
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

    if (section === 'principal') {
      const data = await api.get('/api/main')
      if (!isAdminRoute('principal')) return
      state.main = data.main || null
      content(adminTabs('principal') + adminMainHTML(data.main || {}))
      vigilarVinculacionPrincipal()
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
      document.getElementById('admin-sessions-search')?.addEventListener('input', aplicarFiltrosSesiones)
      aplicarFiltrosSesiones()
      return
    }

    if (section === 'pairings') {
      const data = await api.get('/api/admin/pairings')
      if (!isAdminRoute('pairings')) return
      state.adminPairings = Array.isArray(data.pairings) ? data.pairings : []
      content(adminTabs('pairings') + adminPairingsHTML(data))
      return
    }

    if (section === 'communities') {
      const data = await api.get('/api/admin/communities')
      if (!isAdminRoute('communities')) return
      state.adminCommunities = Array.isArray(data.communities) ? data.communities : []
      content(adminTabs('communities') + adminCommunitiesHTML(data))
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

export function adminOverviewHTML(data) {
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

export function adminMainHTML(main) {
  const code = state.mainCode || ''
  const linked = Boolean(main.linked)
  const vivo = linked && main.connected
  const estado = !main.available
    ? { label: 'No disponible', cls: 'neutral' }
    : vivo
      ? { label: 'Vinculado', cls: 'success' }
      : main.stale
        ? { label: 'Sesión caída', cls: 'danger' }
        : main.connected
          ? { label: 'Esperando vinculación', cls: 'warn' }
          : { label: 'Conectando', cls: 'warn' }

  const acciones = vivo
    ? `<button class="btn btn-secondary" data-action="main-relink">${icon('rotate')} Cambiar número</button>
       <button class="btn btn-danger" data-action="main-unlink">${icon('power')} Desvincular</button>`
    : main.stale || main.phone
      ? `<button class="btn btn-danger" data-action="main-unlink">${icon('power')} Quitar el número</button>`
      : ''

  return `
    <div class="grid-2">
      <div class="stack">
        <div class="card">
          <div class="card-head">
            <div><h3>Sesión del bot principal</h3><p>El número que responde los comandos del owner</p></div>
            <span class="badge ${estado.cls}"><span class="dot"></span>${estado.label}</span>
          </div>
          <div class="card-body">
            <div class="main-hero">
              <div class="main-hero-logo"><img src="/assets/logo.webp" alt="" /></div>
              <div class="main-hero-info">
                <h3>${main.phone ? h(fmtPhone(main.phone)) : 'Sin número vinculado'}</h3>
                <p>${main.name ? h(main.name) + ' · ' : ''}${main.connected ? 'Conectado a WhatsApp' : 'Socket cerrado'}</p>
              </div>
              <div class="main-hero-actions">${acciones}</div>
            </div>

            ${!main.available ? `<div class="notice warn" style="margin-top:14px">${icon('alert')}<div>El panel no tiene acceso al socket del bot principal. En un servidor normal esto no debería ocurrir: revisa que el panel se esté ejecutando en el proceso principal.</div></div>` : ''}
            ${main.caido ? `<div class="notice danger" style="margin-top:14px">${icon('alert')}<div><b>El bot principal se desconectó</b> (WhatsApp cerró la sesión${main.caido.motivo ? `, código ${h(main.caido.motivo)}` : ''}). El panel web y los sub-bots <b>siguen funcionando</b>: vuelve a vincular el número aquí abajo y el bot principal reconecta solo.</div></div>` : ''}
            ${main.stale ? `<div class="notice danger" style="margin-top:14px">${icon('alert')}<div><b>La sesión del principal está caída</b> (${h(main.phone || 'el número')}). Al generar el código se borra la sesión vieja y se crea una nueva <b>dentro del mismo proceso</b>: no hace falta reiniciar el bot ni se corta el panel.</div></div>` : ''}
            ${!linked && main.connected && !main.caido ? `<div class="notice" style="margin-top:14px">${icon('info')}<div>Mientras el principal no esté vinculado, los sub-bots no pueden conectarse. Genera un código abajo y escríbelo en WhatsApp → <b>Dispositivos vinculados → Vincular con número</b>.</div></div>` : ''}
            ${!linked && !main.connected && !main.stale ? `<div class="notice" style="margin-top:14px">${icon('info')}<div>El bot principal se está conectando con WhatsApp. En cuanto abra, el botón de abajo genera el código: <b>no hace falta reiniciar nada</b>.</div></div>` : ''}
            ${linked ? `<div class="notice" style="margin-top:14px">${icon('info')}<div>Al desvincular se borran las credenciales locales, pero <b>el panel web sigue en marcha</b>: los usuarios no se cortan y los sub-bots reconectan solos.</div></div>` : ''}
          </div>
        </div>

        ${!vivo ? `<div class="card">
          <div class="card-head"><div><h3>Vincular el principal</h3><p>Código de 8 dígitos, sin QR</p></div></div>
          <div class="card-body">
            <form id="main-link-form">
              <div class="form-error">${icon('alert')}<span></span></div>
              <div class="field">
                <label class="label" for="main-phone">Número de WhatsApp</label>
                <div class="input-icon">${icon('phone')}<input id="main-phone" name="phone" class="input" inputmode="numeric" autocomplete="tel" placeholder="5215512345678" required /></div>
                <div class="hint">Código de país, sin <b>+</b>, espacios ni guiones.</div>
              </div>
              <button class="btn btn-primary" type="submit" ${main.available === false ? 'disabled' : ''}>${icon('key')} Generar código</button>
              ${main.available === false
                ? '<div class="hint" style="margin-top:10px">El panel no tiene acceso al socket del principal.</div>'
                : main.starting
                  ? '<div class="hint" style="margin-top:10px">El bot principal está conectando con WhatsApp. El botón espera a que esté listo: no hace falta reiniciar nada.</div>'
                  : ''}
            </form>
            ${code ? `<div class="code-box" style="margin-top:18px">
              <div class="code-kicker">Código de vinculación</div>
              <div class="code-value">${h(code)}</div>
              <div class="code-sub">Escríbelo en WhatsApp → Dispositivos vinculados.</div>
              <div class="code-actions">
                <button class="btn btn-secondary btn-sm" data-action="copy" data-copy="${h(code)}">${icon('copy')} Copiar código</button>
                <button class="btn btn-ghost btn-sm" data-action="main-clear-code">${icon('x')} Ocultar</button>
              </div>
            </div>` : ''}
          </div>
        </div>` : ''}
      </div>

      <div class="stack">
        <div class="card">
          <div class="card-head"><div><h3>Cómo funciona</h3><p>Lo que pasa en cada acción</p></div></div>
          <div class="card-body">
            <ol class="steps">
              <li><span class="step-num">1</span><div><b>Vincular</b><span>El panel pide un código al socket del principal y lo muestra durante 90 segundos.</span></div></li>
              <li><span class="step-num">2</span><div><b>Confirmar en WhatsApp</b><span>Al aceptar, las credenciales se guardan y el principal queda en línea.</span></div></li>
              <li><span class="step-num">3</span><div><b>Desvincular</b><span>Se cierra la sesión en WhatsApp y se borran las credenciales del servidor.</span></div></li>
              <li><span class="step-num">4</span><div><b>Recuperar</b><span>Si la sesión se cae, el panel crea un socket nuevo dentro del mismo proceso: la web nunca se reinicia.</span></div></li>
            </ol>
          </div>
        </div>
        <div class="card">
          <div class="card-head"><div><h3>Sesión principal</h3><p>Datos técnicos</p></div></div>
          <div class="card-body">
            <div class="system-grid">
              <div class="system-item"><div class="si-label">Estado</div><div class="si-value" style="font-size:13px">${h(estado.label)}</div></div>
              <div class="system-item"><div class="si-label">Credenciales</div><div class="si-value" style="font-size:13px">${main.hasLocalCreds ? 'En el servidor' : 'Sin credenciales'}</div></div>
              <div class="system-item"><div class="si-label">Socket</div><div class="si-value" style="font-size:13px">${main.connected ? 'Abierto' : 'Cerrado'}</div></div>
              <div class="system-item"><div class="si-label">Sub-bots</div><div class="si-value" style="font-size:13px">${linked ? 'Pueden conectarse' : 'En espera'}</div></div>
            </div>
            <div class="hint" style="margin-top:12px">Carpeta de credenciales: <span class="mono">${h(String(main.authDir || 'sessions'))}</span></div>
          </div>
        </div>
      </div>
    </div>`
}

export function workersList(workers) {
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

export const ACTION_LABELS = {
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
  'main.code': 'Código del principal',
  'main.unlink': 'Principal desvinculado',
  'main.restart': 'Bot reiniciado',
  'admin.impersonate': 'Entró como usuario',
  'admin.stop_impersonating': 'Volvió a su cuenta',
}

export function actionLabel(action) {
  return ACTION_LABELS[action] || String(action || 'Evento')
}

export function actionTone(action) {
  const value = String(action || '')
  if (['auth.login', 'auth.register', 'bot.linked'].includes(value)) return 'ok'
  if (['bot.link_expired', 'bot.link_cancelled', 'bot.reconnect', 'admin.user_update', 'admin.settings', 'main.code', 'main.restart'].includes(value)) return 'warn'
  if (value.includes('delete') || value.includes('error') || value.includes('unlink')) return 'bad'
  return ''
}

export function parseMeta(meta) {
  if (!meta) return {}
  if (typeof meta === 'object') return meta
  try { return JSON.parse(meta) } catch { return {} }
}

export function auditTimeline(items) {
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

export function usersTable(users) {
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
          <button class="icon-btn sm" data-action="admin-impersonate" data-id="${user.id}" data-username="${h(user.username)}" title="Entrar como este usuario" ${self ? 'disabled' : ''}>${icon('user')}</button>
          <button class="icon-btn sm" data-action="admin-user-edit" data-id="${user.id}" title="Editar">${icon('pencil')}</button>
          <button class="icon-btn sm danger" data-action="admin-user-delete" data-id="${user.id}" data-username="${h(user.username)}" title="Eliminar" ${self ? 'disabled' : ''}>${icon('trash')}</button>
        </div></td>
      </tr>`
    }).join('')}</tbody>
  </table></div>`
}

export function adminUsersHTML(data) {
  return `<div class="card">
    <div class="card-head">
      <div><h3>Usuarios</h3><p>${data.total ?? 0} cuenta(s) registrada(s)</p></div>
      <div class="input-icon" style="max-width:290px;width:100%">${icon('search')}<input id="admin-users-search" class="input" placeholder="Buscar usuario o correo…" /></div>
    </div>
    <div class="card-body tight">${usersTable(data.users || [])}</div>
  </div>`
}

export function sessionsTable(sessions) {
  if (!sessions?.length) {
    return emptyState('server', 'Sin sesiones', 'No hay carpetas de sub-bots en el servidor todavía.')
  }
  return `<div class="table-wrap"><table class="table">
    <thead><tr>
      <th class="check-col"><input type="checkbox" class="row-check" data-session-check-all aria-label="Seleccionar todas las sesiones visibles" /></th>
      <th>Sesión</th><th>Dueño</th><th>Estado</th><th>Worker</th><th class="right">Acciones</th></tr></thead>
    <tbody>${sessions.map((session) => {
      const phone = session.folder || session.phone
      const search = [phone, session.owner || '', session.label || '', session.status].join(' ').toLowerCase()
      const details = []
      if (session.archived) details.push('solo ajustes')
      else if (session.hasCreds) details.push('credenciales')
      else details.push('sin credenciales')
      if (session.label) details.push(session.label)
      const canReconnect = ['linked', 'connected'].includes(session.status)
      const marcado = state.selectedSessions.has(phone)
      return `<tr data-session-row data-session-phone="${h(phone)}" data-status="${h(session.status)}" data-search="${h(search)}">
        <td class="check-col"><input type="checkbox" class="row-check" data-session-check="${h(phone)}" ${marcado ? 'checked' : ''} aria-label="Seleccionar ${h(phone)}" /></td>
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

export const FILTROS_SESION = [
  ['all', 'Todas'],
  ['connected', 'Conectadas'],
  ['linked', 'Vinculadas'],
  ['relink', 'Re-vincular'],
  ['pairing', 'Vinculando'],
  ['pending', 'Pendientes'],
  ['missing', 'Sin archivos'],
]

export function adminSessionsHTML(data) {
  const sessions = data.sessions || []
  const counts = {
    total: sessions.length,
    connected: sessions.filter((session) => session.status === 'connected').length,
    relink: sessions.filter((session) => session.status === 'relink').length,
    pairing: sessions.filter((session) => session.status === 'pairing').length,
  }
  const activos = FILTROS_SESION.filter(([id]) => id !== 'all' && id !== 'linked')
  return `<div class="stats">
    ${statCard('Sesiones', counts.total, 'server', 'accent')}
    ${statCard('Conectadas', counts.connected, 'wifi', 'green')}
    ${statCard('Re-vincular', counts.relink, 'alert', 'amber')}
    ${statCard('Vinculando', counts.pairing, 'link', 'cyan')}
  </div>
  <div class="card">
    <div class="card-head">
      <div><h3>Todas las sesiones</h3><p>Detectadas por el supervisor y los workers</p></div>
      <div class="input-icon" style="max-width:290px;width:100%">${icon('search')}<input id="admin-sessions-search" class="input" placeholder="Buscar número o dueño…" /></div>
    </div>
    <div class="filter-bar">
      <div class="filter-chips">
        ${FILTROS_SESION.map(([id, label]) => {
          const total = id === 'all'
            ? sessions.length
            : sessions.filter((session) => session.status === id).length
          return `<button class="chip ${state.sessionFilter === id ? 'active' : ''}" data-action="session-filter" data-filter="${id}">${h(label)} <span class="chip-count">${total}</span></button>`
        }).join('')}
      </div>
      <div class="selection-bar">
        <span id="selection-count" class="hint">0 seleccionadas</span>
        <button class="btn btn-ghost btn-sm" data-action="session-select-all">${icon('check')} Seleccionar visibles</button>
        <button class="btn btn-ghost btn-sm" data-action="session-clear">${icon('x')} Limpiar</button>
        <button class="btn btn-danger btn-sm" data-action="session-delete-selected" id="session-delete-selected" disabled>${icon('trash')} Eliminar seleccionadas</button>
      </div>
    </div>
    <div class="card-body tight">${sessionsTable(sessions)}</div>
  </div>`
}

/* ── Selección y filtros de sesiones ────────────────────────────────────── */
export function filasSesionVisibles() {
  return [...document.querySelectorAll('[data-session-row]')].filter((fila) => fila.style.display !== 'none')
}

export function aplicarFiltroSesiones(filtro) {
  state.sessionFilter = filtro || 'all'
  document.querySelectorAll('[data-action="session-filter"]').forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.filter === state.sessionFilter)
  })
  aplicarFiltrosSesiones()
}

export function aplicarFiltrosSesiones() {
  const input = document.getElementById('admin-sessions-search')
  const q = String(input?.value || '').trim().toLowerCase()
  document.querySelectorAll('[data-session-row]').forEach((fila) => {
    const estado = fila.dataset.status || ''
    const coincideEstado = state.sessionFilter === 'all' || estado === state.sessionFilter
    const coincideTexto = !q || String(fila.dataset.search || '').includes(q)
    fila.style.display = coincideEstado && coincideTexto ? '' : 'none'
  })
  actualizarSeleccion()
}

export function actualizarSeleccion() {
  const contador = document.getElementById('selection-count')
  const total = state.selectedSessions.size
  if (contador) contador.textContent = `${total} seleccionada${total === 1 ? '' : 's'}`
  const boton = document.getElementById('session-delete-selected')
  if (boton) boton.disabled = total === 0
  const marcadas = document.querySelectorAll('[data-session-check]:checked').length
  const selectAll = document.querySelector('[data-session-check-all]')
  if (selectAll) {
    const visibles = filasSesionVisibles().length
    selectAll.checked = visibles > 0 && marcadas === visibles
    selectAll.indeterminate = marcadas > 0 && marcadas < visibles
  }
}

export function alternarSeleccionSesion(phone, marcado) {
  if (!phone) return
  if (marcado) state.selectedSessions.add(phone)
  else state.selectedSessions.delete(phone)
  actualizarSeleccion()
}

export async function eliminarSesionesSeleccionadas() {
  const phones = [...state.selectedSessions]
  if (!phones.length) {
    showToast('No hay sesiones seleccionadas.', 'warn')
    return
  }
  confirmModal({
    title: 'Eliminar sesiones',
    message: `Se eliminarán <b>${phones.length}</b> sesión(es) del servidor, con sus credenciales y ajustes. Se borran por oleadas de 5 para no saturar el proceso. Esta acción no se puede deshacer.`,
    confirmLabel: `Eliminar ${phones.length} sesión(es)`,
    onConfirm: async () => {
      const data = await api.post('/api/admin/sessions/bulk', { phones, batchSize: 5 })
      state.selectedSessions.clear()
      showToast(`${data.eliminados} sesión(es) eliminadas.`, 'success')
      await renderAdmin('sessions')
    },
  })
}

export function pairingsTable(pairings, { compact = false } = {}) {
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

export function adminPairingsHTML(data) {
  return `<div class="card">
    <div class="card-head"><div><h3>Vinculaciones recientes</h3><p>Últimos 100 intentos registrados</p></div><a class="btn btn-ghost btn-sm" href="#/admin/overview">Resumen ${icon('chevronRight')}</a></div>
    <div class="card-body tight">${pairingsTable(data.pairings || [])}</div>
  </div>`
}

export function adminCommunitiesHTML(data) {
  const comunidades = data.communities || []
  return `<div class="grid-2">
    <div class="card">
      <div class="card-head"><div><h3>Nueva comunidad</h3><p>Nombre y enlace de invitación</p></div></div>
      <div class="card-body">
        <form id="community-form">
          <div class="form-error">${icon('alert')}<span></span></div>
          <div class="field">
            <label class="label" for="community-name">Nombre</label>
            <input id="community-name" name="name" class="input" maxlength="80" placeholder="Pain Community" required />
          </div>
          <div class="field">
            <label class="label" for="community-link">Enlace de invitación</label>
            <input id="community-link" name="link" class="input" type="url" placeholder="https://chat.whatsapp.com/..." required />
            <div class="hint">El enlace que compartes para que la gente entre al grupo de la comunidad.</div>
          </div>
          <div class="field">
            <label class="label" for="community-description">Descripción <span class="muted">(opcional)</span></label>
            <input id="community-description" name="description" class="input" maxlength="300" placeholder="Avisos, soporte y novedades" />
          </div>
          <button class="btn btn-primary" type="submit">${icon('plus')} Crear comunidad</button>
        </form>
      </div>
    </div>
    <div class="card">
      <div class="card-head">
        <div><h3>Comunidades</h3><p>${comunidades.length} en total</p></div>
      </div>
      <div class="card-body tight">
        ${comunidades.length ? `<div class="community-list">${comunidades.map((comunidad) => `
          <div class="community-row${comunidad.active ? '' : ' off'}">
            <div class="grow">
              <div class="cell-title">${h(comunidad.name)}</div>
              <div class="cell-sub mono truncate">${h(comunidad.link)}</div>
              ${comunidad.description ? `<div class="hint" style="margin-top:4px">${h(comunidad.description)}</div>` : ''}
            </div>
            <div class="actions">
              <button class="icon-btn sm" data-action="community-edit" data-id="${comunidad.id}" title="Editar">${icon('pencil')}</button>
              <button class="icon-btn sm" data-action="copy" data-copy="${h(comunidad.link)}" title="Copiar enlace">${icon('copy')}</button>
              <button class="icon-btn sm" data-action="community-toggle" data-id="${comunidad.id}" data-active="${comunidad.active ? 1 : 0}" title="${comunidad.active ? 'Ocultar' : 'Mostrar'}">${icon(comunidad.active ? 'eyeOff' : 'eye')}</button>
              <button class="icon-btn sm danger" data-action="community-delete" data-id="${comunidad.id}" data-name="${h(comunidad.name)}" title="Eliminar">${icon('trash')}</button>
            </div>
          </div>`).join('')}</div>` : emptyState('globe', 'Sin comunidades', 'Crea la primera comunidad para que tus usuarios puedan unirse desde el panel.')}
      </div>
    </div>
  </div>`
}

export function adminAuditHTML(data) {
  return `<div class="card">
    <div class="card-head"><div><h3>Auditoría</h3><p>Eventos más recientes del panel</p></div><span class="badge neutral"><span class="dot"></span>${(data.audit || []).length} evento(s)</span></div>
    <div class="card-body">${auditTimeline(data.audit || [])}</div>
  </div>`
}

export function adminSettingsHTML(data) {
  const maxSubs = Number(data.maxSubs || 0)
  const maxPorUsuario = Number(data.maxSubsPerUser || 0)
  const maxPorIp = Number(data.maxBotsPerIp || 0)
  const intentosHora = Number(data.maxPairAttemptsPerHour || 0)
  const intentosDia = Number(data.maxPairAttemptsPerDay || 0)
  const intentosIp = Number(data.maxPairAttemptsPerIpPerHour || 0)
  const esperaSegundos = Number(data.pairCooldownSeconds || 0)
  const duracionCodigo = Number(data.pairCodeSeconds || 90)
  const repo = data.repo || {}
  return `<div class="grid-2">
    <div class="stack">
      <div class="card">
        <div class="card-head"><div><h3>Límites de sub-bots</h3><p>Se aplican a todo el servidor</p></div></div>
        <div class="card-body">
          <form id="settings-form">
            <div class="form-error">${icon('alert')}<span></span></div>
            <div class="field">
              <label class="label" for="settings-max">Máximo de sub-bots del servidor</label>
              <input id="settings-max" name="maxSubs" type="number" min="0" class="input" value="${maxSubs}" />
              <div class="hint">Usa <b>0</b> para ilimitado. El valor se guarda en <span class="mono">storage/maxsubs.json</span>.</div>
            </div>
            <div class="field">
              <label class="label" for="settings-max-user">Máximo de sub-bots por cuenta</label>
              <input id="settings-max-user" name="maxSubsPerUser" type="number" min="0" class="input" value="${maxPorUsuario}" />
              <div class="hint">Cuántas cuentas puede vincular cada usuario del panel. <b>0</b> = sin límite.</div>
            </div>
            <div class="field">
              <label class="label" for="settings-max-ip">Máximo de cuentas por IP</label>
              <input id="settings-max-ip" name="maxBotsPerIp" type="number" min="0" class="input" value="${maxPorIp}" />
              <div class="hint">Cuentas distintas que se pueden vincular desde la misma conexión. <b>0</b> = sin límite.</div>
            </div>
            <button class="btn btn-primary" type="submit">${icon('check')} Guardar límites</button>
          </form>
        </div>
      </div>
      <div class="card">
        <div class="card-head">
          <div><h3>Intentos de vinculación</h3><p>Para que nadie abuse del panel</p></div>
        </div>
        <div class="card-body">
          <form id="settings-limits-form">
            <div class="form-error">${icon('alert')}<span></span></div>
            <div class="field">
              <label class="label" for="settings-attempts-hour">Intentos por hora y usuario</label>
              <input id="settings-attempts-hour" name="maxPairAttemptsPerHour" type="number" min="0" class="input" value="${intentosHora}" />
              <div class="hint">Códigos que puede pedir un usuario en una hora. <b>0</b> = sin límite.</div>
            </div>
            <div class="field">
              <label class="label" for="settings-attempts-day">Intentos por día y usuario</label>
              <input id="settings-attempts-day" name="maxPairAttemptsPerDay" type="number" min="0" class="input" value="${intentosDia}" />
              <div class="hint">Códigos por día. <b>0</b> = sin límite.</div>
            </div>
            <div class="field">
              <label class="label" for="settings-attempts-ip">Intentos por hora y IP</label>
              <input id="settings-attempts-ip" name="maxPairAttemptsPerIpPerHour" type="number" min="0" class="input" value="${intentosIp}" />
              <div class="hint">Códigos por hora desde la misma conexión. <b>0</b> = sin límite.</div>
            </div>
            <div class="field">
              <label class="label" for="settings-cooldown">Espera entre códigos del mismo número (segundos)</label>
              <input id="settings-cooldown" name="pairCooldownSeconds" type="number" min="0" class="input" value="${esperaSegundos}" />
              <div class="hint">Espera antes de volver a pedir un código para el mismo número. <b>0</b> = sin espera.</div>
            </div>
            <div class="field">
              <label class="label" for="settings-code-ttl">Duración del código (segundos)</label>
              <input id="settings-code-ttl" name="pairCodeSeconds" type="number" min="15" class="input" value="${duracionCodigo}" />
              <div class="hint">Cuánto vive el código de 8 dígitos antes de caducar (es la cuenta atrás que ve el usuario).</div>
            </div>
            <button class="btn btn-primary" type="submit">${icon('check')} Guardar intentos</button>
          </form>
        </div>
      </div>
    </div>
    <div class="stack">
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
      <div class="card">
        <div class="card-head">
          <div><h3>Cloudflare Turnstile</h3><p>Captcha anti-bots en el acceso</p></div>
          <span class="badge ${data.turnstileEnabled ? 'success' : 'neutral'}"><span class="dot"></span>${data.turnstileEnabled ? 'Activo' : 'Inactivo'}</span>
        </div>
        <div class="card-body">
          <form id="settings-turnstile-form">
            <div class="form-error">${icon('alert')}<span></span></div>
            <div class="field">
              <label class="label" for="turnstile-site">Site key</label>
              <div class="input-icon">${icon('globe')}<input id="turnstile-site" name="siteKey" class="input mono" value="${h(data.turnstileSiteKey || '')}" placeholder="0x4AAAAAAA…" autocomplete="off" spellcheck="false" /></div>
            </div>
            <div class="field">
              <label class="label" for="turnstile-secret">Secret key</label>
              <div class="input-icon">
                ${icon('key')}
                <input id="turnstile-secret" name="secretKey" class="input mono" type="password" value="${h(data.turnstileSecretKey || '')}" placeholder="0x4AAAAAAA…" autocomplete="off" spellcheck="false" />
                <button type="button" class="icon-btn sm" data-action="toggle-password" data-input="turnstile-secret" style="position:absolute;right:5px;top:5px;border:0;background:transparent" aria-label="Mostrar u ocultar la clave">${icon('eye')}</button>
              </div>
              <div class="hint">Si dejas la clave vacía al guardar, se conserva la actual. Se activa al tener <b>site key</b> y <b>secret key</b>. Créalas en Cloudflare → Turnstile.</div>
            </div>
            <button class="btn btn-primary" type="submit">${icon('check')} Guardar Turnstile</button>
          </form>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><div><h3>Mantenimiento</h3><p>Actualizar sin reiniciar el servidor</p></div></div>
        <div class="card-body">
          <div class="system-grid">
            <div class="system-item"><div class="si-label">Rama</div><div class="si-value mono" style="font-size:13px">${h(repo.rama || '—')}</div></div>
            <div class="system-item"><div class="si-label">Commit</div><div class="si-value mono" style="font-size:13px">${h(repo.corto || '—')}</div></div>
          </div>
          <div class="notice" style="margin-top:14px">${icon('info')}<div>Trae el código del remoto y lo aplica <b>sin reiniciar el proceso</b>: los sub-bots no se desconectan, el bot y sus workers recargan sus plugins y el panel se recarga con el código nuevo. Tus cambios locales se guardan antes de actualizar.</div></div>
          <div class="flex gap-8" style="margin-top:14px;flex-wrap:wrap">
            <button class="btn btn-primary" data-action="admin-update">${icon('refresh')} Actualizar en caliente</button>
            <button class="btn btn-secondary" data-action="admin-reload">${icon('rotate')} Recargar código</button>
          </div>
          <div id="update-result" class="hint" style="margin-top:12px"></div>
        </div>
      </div>
    </div>
  </div>`
}

export function openUserModal(id) {
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

export function openRenameModal(phone, label) {
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

/** Mientras hay un código pendiente, comprueba si el principal se vinculó. */
export function vigilarVinculacionPrincipal() {
  if (state.mainPoll) {
    clearInterval(state.mainPoll)
    state.mainPoll = null
  }
  if (!state.mainCode || state.main?.linked) return
  state.mainPoll = setInterval(async () => {
    try {
      const data = await api.get('/api/main')
      if (!data.main) return
      state.main = data.main
      if (data.main.linked) {
        stopTimers()
        state.mainCode = null
        showToast('¡Bot principal vinculado!', 'success')
        if (isAdminRoute('principal')) renderAdmin('principal')
      }
    } catch {}
  }, 3000)
}
