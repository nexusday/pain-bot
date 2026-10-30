/* Pain Panel — módulo pages-admin */
import { notificationsHTML, backupsHTML } from './admin-tools.js'
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
  esPrincipal,
  isAdminRoute,
  loadingBlock,
  navigate,
  openModal,
  puede,
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
    ['overview', 'Resumen', 'grid', 'admin.overview'],
    ['principal', 'Bot principal', 'bot', 'admin.main'],
    ['users', 'Usuarios', 'users', 'admin.users'],
    ['sessions', 'Sesiones', 'server', 'admin.sessions'],
    ['pairings', 'Vinculaciones', 'link', 'admin.pairings'],
    ['communities', 'Comunidades', 'globe', 'admin.communities'],
    ['audit', 'Auditoría', 'activity', 'admin.audit'],
    ['roles', 'Roles', 'shield', 'admin.settings.roles'],
    ['mail', 'Correo', 'mail', 'admin.settings.mail'],
    ['notifications', 'Notificaciones', 'mail', 'admin.notifications'],
    ['backups', 'Copias', 'server', 'admin.backups'],
    ['settings', 'Ajustes', 'settings', 'admin.settings'],
  ]
  return `<div class="admin-tabs">${tabs.filter(([, , , permiso]) => puede(permiso)).map(([id, label, iconName]) => `
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
  roles: ['Roles y permisos', 'Crea roles y decide qué puede hacer cada administrador'],
  mail: ['Correo y plantillas', 'Configura el SMTP y edita los mensajes que reciben los usuarios'],
  settings: ['Ajustes', 'Configuración global del panel'],
  notifications: ['Notificaciones', 'Envía novedades y consulta qué usuarios tienen avisos activos'],
  backups: ['Copias de seguridad', 'Exporta tus datos y prepara una migración segura'],
}

export async function renderAdmin(section) {
  const generation = state.routeGeneration
  const isCurrentAdminRoute = (name) => isAdminRoute(name) && state.routeGeneration === generation
  const meta = ADMIN_META[section] || ADMIN_META.overview
  if (!isCurrentAdminRoute(section)) return
  setPage(meta[0], meta[1])
  content(adminTabs(section) + loadingBlock())

  try {
    if (section === 'notifications') {
      const data=await api.get(`/api/admin/notifications?q=${encodeURIComponent(state.pushQuery||'')}&offset=${state.pushOffset||0}`)
       if (!isCurrentAdminRoute('notifications')) return
      content(adminTabs('notifications')+notificationsHTML(data));return
    }
    if (section === 'backups') { content(adminTabs('backups')+backupsHTML());return }
    if (section === 'overview') {
      const data = await api.get('/api/admin/overview')
       if (!isCurrentAdminRoute('overview')) return
      content(adminTabs('overview') + adminOverviewHTML(data))
      return
    }

    if (section === 'principal') {
      const data = await api.get('/api/main')
       if (!isCurrentAdminRoute('principal')) return
      state.main = data.main || null
      content(adminTabs('principal') + adminMainHTML(data.main || {}))
      vigilarVinculacionPrincipal()
      return
    }

    if (section === 'users') {
      const data = await api.get('/api/admin/users?limit=200')
      let rolesData = null
      try {
        rolesData = await api.get('/api/admin/roles')
      } catch {}
       if (!isCurrentAdminRoute('users')) return
      state.adminUsers = Array.isArray(data.users) ? data.users : []
      state.adminRoles = Array.isArray(rolesData?.roles) ? rolesData.roles : []
      content(adminTabs('users') + adminUsersHTML(data))
      attachRowFilter('#admin-users-search', '[data-user-row]')
      return
    }

    if (section === 'sessions') {
      const data = await api.get('/api/admin/sessions')
       if (!isCurrentAdminRoute('sessions')) return
      state.adminSessions = Array.isArray(data.sessions) ? data.sessions : []
      content(adminTabs('sessions') + adminSessionsHTML(data))
      document.getElementById('admin-sessions-search')?.addEventListener('input', aplicarFiltrosSesiones)
      aplicarFiltrosSesiones()
      return
    }

    if (section === 'pairings') {
      const data = await api.get('/api/admin/pairings')
       if (!isCurrentAdminRoute('pairings')) return
      state.adminPairings = Array.isArray(data.pairings) ? data.pairings : []
      content(adminTabs('pairings') + adminPairingsHTML(data))
      return
    }

    if (section === 'communities') {
      const data = await api.get('/api/admin/communities')
       if (!isCurrentAdminRoute('communities')) return
      state.adminCommunities = Array.isArray(data.communities) ? data.communities : []
      content(adminTabs('communities') + adminCommunitiesHTML(data))
      return
    }

    if (section === 'audit') {
      const data = await api.get('/api/admin/audit?limit=150')
       if (!isCurrentAdminRoute('audit')) return
      state.adminAudit = Array.isArray(data.audit) ? data.audit : []
      content(adminTabs('audit') + adminAuditHTML(data))
      return
    }

    if (section === 'roles') {
      const data = await api.get('/api/admin/roles')
       if (!isCurrentAdminRoute('roles')) return
      state.adminRoles = Array.isArray(data.roles) ? data.roles : []
      state.adminPermissions = Array.isArray(data.permissions) ? data.permissions : []
      content(adminTabs('roles') + adminRolesHTML(data))
      return
    }

    if (section === 'mail') {
      const data = await api.get('/api/admin/mail')
       if (!isCurrentAdminRoute('mail')) return
      state.adminMail = data
      content(adminTabs('mail') + adminMailHTML(data))
      return
    }

    const data = await api.get('/api/admin/settings')
     if (!isCurrentAdminRoute('settings')) return
    state.adminSettings = data
    content(adminTabs('settings') + adminSettingsHTML(data))
  } catch (error) {
    if (error.status === 403) {
      showToast(error.message || 'Necesitas permisos de administrador.', 'error')
      navigate('/dashboard')
      return
    }
     if (!isCurrentAdminRoute(section)) return
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
        ${puede('admin.settings.premium') ? `<div class="card admin-premium-shortcut">
          <div class="card-head"><div><h3>Promoción Premium</h3><p>Invita a convertir sub-bots normales en Premium</p></div><span class="badge accent">Premium</span></div>
          <div class="card-body"><p class="muted">Configura la tarjeta flotante, sus ventajas y cada cuánto vuelve a aparecer para los usuarios.</p><a class="btn btn-primary" href="#/admin/settings">${icon('sparkles')} Configurar invitación Premium</a></div>
        </div>` : ''}
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
            ${!linked && main.connected && !main.caido ? `<div class="notice" style="margin-top:14px">${icon('info')}<div>El principal todavía no está vinculado: los sub-bots que ya tengas <b>siguen conectados igual</b>. Genera un código abajo y escríbelo en WhatsApp → <b>Dispositivos vinculados → Vincular con número</b>.</div></div>` : ''}
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
      const search = [user.username, user.email || '', user.role, user.roleName || '', user.status].join(' ').toLowerCase()
      const principal = Boolean(user.isPrincipal)
      return `<tr data-user-row data-search="${h(search)}">
        <td><div class="cell-main">
          <div class="avatar" style="width:34px;height:34px;border-radius:9px">${initials(user.username)}</div>
          <div class="grow"><div class="cell-title">${h(user.username)}${self ? ' <span class="badge neutral" style="margin-left:4px">Tú</span>' : ''}${principal ? ' <span class="badge accent" style="margin-left:4px">Principal</span>' : ''}</div><div class="cell-sub">${h(user.email || 'Sin correo')}${user.email && !user.emailVerified ? ' · <span class="text-warn">Sin verificar</span>' : ''}</div></div>
        </div></td>
        <td>${roleBadge(user.role, principal ? 'Principal' : user.roleName)}</td>
        <td>${badge(user.status)}</td>
        <td><span class="tiny muted">${fmtDate(user.created_at, false)}</span></td>
        <td><span class="tiny muted">${user.last_login_at ? fmtRelative(user.last_login_at) : 'Nunca'}</span>${user.lastIp?`<div class="cell-sub mono">${h(user.lastIp)}</div>`:''}</td>
        <td><div class="actions">
          ${puede('admin.users.impersonate') ? `<button class="icon-btn sm" data-action="admin-impersonate" data-id="${user.id}" data-username="${h(user.username)}" title="Entrar como este usuario" ${self ? 'disabled' : ''}>${icon('user')}</button>` : ''}
          ${puede('admin.users.edit') ? `<button class="icon-btn sm" data-action="admin-user-edit" data-id="${user.id}" title="Editar" aria-label="Editar usuario">${icon('pencil')}</button>` : ''}
          ${puede('admin.users.delete') ? `<button class="icon-btn sm danger" data-action="admin-user-delete" data-id="${user.id}" data-username="${h(user.username)}" title="Eliminar" ${self || principal ? 'disabled' : ''}>${icon('trash')}</button>` : ''}
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
          <button class="icon-btn sm danger" data-action="admin-session-delete" data-phone="${h(phone)}" title="Eliminar" aria-label="Eliminar sesión">${icon('trash')}</button>
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
              <button class="icon-btn sm" data-action="community-edit" data-id="${comunidad.id}" title="Editar" aria-label="Editar comunidad">${icon('pencil')}</button>
              <button class="icon-btn sm" data-action="copy" data-copy="${h(comunidad.link)}" title="Copiar enlace" aria-label="Copiar enlace de la comunidad">${icon('copy')}</button>
              <button class="icon-btn sm" data-action="community-toggle" data-id="${comunidad.id}" data-active="${comunidad.active ? 1 : 0}" title="${comunidad.active ? 'Ocultar' : 'Mostrar'}" aria-label="${comunidad.active ? 'Ocultar' : 'Mostrar'} comunidad">${icon(comunidad.active ? 'eyeOff' : 'eye')}</button>
              <button class="icon-btn sm danger" data-action="community-delete" data-id="${comunidad.id}" data-name="${h(comunidad.name)}" title="Eliminar" aria-label="Eliminar comunidad">${icon('trash')}</button>
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

/** Ajustes del sub-bot premium: anuncios de Adsterra y reglas del banco. */
function adminPremiumHTML(premium) {
  const banners = premium.banners || {}
  const activo = premium.enabled !== false
  const campoBanner = (nombre, clave, etiqueta, tamano, valor) => {
    const opcion = premium.opciones?.[clave] || null
    const definido = Boolean(valor)
    const detalle = opcion?.width && opcion?.height
      ? `${opcion.width} × ${opcion.height} · atOptions detectado`
      : `${tamano} · pega el bloque completo`
    return `
    <div class="ad-config-row">
      <div class="ad-config-head">
        <div><b>${etiqueta}</b><span class="muted"> · ${detalle}</span></div>
        <span class="badge ${definido ? 'success' : 'neutral'}">${definido ? 'Configurado' : 'Sin configurar'}</span>
      </div>
      <textarea id="pm-banner-${nombre}" name="${nombre}" class="input mono ad-code-input" rows="3" placeholder="Pega aquí el bloque completo de Adsterra…" spellcheck="false">${h(valor || '')}</textarea>
      ${definido ? `<details class="ad-preview"><summary>Vista previa guardada</summary><iframe title="Vista previa ${etiqueta}" src="/api/premium/frame?b=${clave}" loading="lazy" sandbox="allow-scripts allow-same-origin allow-popups"></iframe></details>` : ''}
    </div>`
  }
  return `<div class="card">
    <div class="card-head">
      <div><h3>Sub-bot premium</h3><p>Anuncios, tiempo por anuncio y tope del banco</p></div>
      <span class="badge ${activo ? 'success' : 'neutral'}"><span class="dot"></span>${activo ? 'Activo' : 'Desactivado'}</span>
    </div>
    <div class="card-body">
      <form id="settings-premium-form">
        <div class="form-error">${icon('alert')}<span></span></div>
        <div class="form-success">${icon('check')}<span></span></div>
        <label class="check switch">
          <input type="checkbox" name="enabled" ${activo ? 'checked' : ''} />
          <span><b>Permitir premium con anuncios</b><br /><span class="muted">Si lo desactivas, las páginas premium dejan de dar horas (las que ya tienen siguen vigentes).</span></span>
        </label>
        <div class="grid-3">
          <div class="field">
            <label class="label" for="pm-minutes">Minutos por anuncio</label>
            <input id="pm-minutes" name="adMinutes" type="number" min="1" max="1440" class="input" value="${Number(premium.adMinutes || 60)}" />
          </div>
          <div class="field">
            <label class="label" for="pm-seconds">Segundos en el anuncio</label>
            <input id="pm-seconds" name="adSeconds" type="number" min="3" max="60" class="input" value="${Number(premium.adSeconds || 5)}" />
            <div class="hint">Se valida en el servidor.</div>
          </div>
          <div class="field">
            <label class="label" for="pm-cooldown">Espera entre anuncios (s)</label>
            <input id="pm-cooldown" name="cooldownSeconds" type="number" min="0" max="3600" class="input" value="${Number(premium.cooldownSeconds ?? 5)}" />
          </div>
        </div>
        <div class="field premium-promo-settings">
          <label class="check switch">
            <input type="checkbox" name="promoEnabled" ${premium.promo?.enabled !== false ? 'checked' : ''} />
            <span><b>Mostrar invitación flotante a Premium</b><br /><span class="muted">Promociona Premium a usuarios con sub-bots normales, sin cubrir el contenido ni aparecer continuamente.</span></span>
          </label>
          <label class="label" for="pm-promo-interval">Mostrar nuevamente cada (minutos)</label>
          <input id="pm-promo-interval" name="promoIntervalMinutes" type="number" min="1" max="1440" class="input" value="${Number(premium.promo?.intervalMinutes || 30)}" />
          <div class="hint">Se muestra una vez al entrar y vuelve a aparecer después de este intervalo si el usuario todavía tiene sub-bots sin Premium.</div>
        </div>
        <div class="grid-2-tight">
          <div class="field">
            <label class="label" for="pm-maxhours">Tope del banco (horas)</label>
            <input id="pm-maxhours" name="maxHours" type="number" min="1" max="720" class="input" value="${Number(premium.maxHours || 24)}" />
            <div class="hint">Al llegar, el botón de sumar tiempo se bloquea.</div>
          </div>
          <div class="field">
            <label class="label" for="pm-unlockhours">Se desbloquea al bajar de (horas)</label>
            <input id="pm-unlockhours" name="unlockHours" type="number" min="0" max="720" class="input" value="${Number(premium.unlockHours ?? 10)}" />
            <div class="hint">Debe ser menor que el tope.</div>
          </div>
        </div>
        <div class="field">
          <label class="label" for="pm-smartlink">Smartlink (se abre en una pestaña)</label>
          <div class="input-icon">${icon('external')}<input id="pm-smartlink" name="smartlink" class="input mono" value="${h(premium.smartlink || '')}" placeholder="https://www.effectiveratecpm.com/…" spellcheck="false" /></div>
        </div>
        <fieldset class="field">
          <legend class="label">Dónde mostrar los anuncios</legend>
          <p class="hint">Cabecera automática: 728 × 90 en espacios amplios, 468 × 60 en medianos y 320 × 50 en móvil, si están configurados. El pie usa 320 × 50 y no lo repite si ya aparece arriba. Desmarca ambas opciones para no mostrar anuncios en esa página.</p>
          <div class="grid-2-tight">
            ${[['dashboard', 'Dashboard'], ['bots', 'Mis bots'], ['premium', 'Premium'], ['communities', 'Comunidades'], ['link', 'Vincular bot'], ['account', 'Mi cuenta']].map(([pagina, titulo]) => `
              <div class="ad-config-row"><b>${titulo}</b>
                <label class="check"><input type="checkbox" name="ad-${pagina}-header" ${premium.placements?.[pagina]?.header !== false ? 'checked' : ''} /> Cabecera automática</label>
                <label class="check"><input type="checkbox" name="ad-${pagina}-footer" ${premium.placements?.[pagina]?.footer !== false ? 'checked' : ''} /> Banner pequeño al final</label>
              </div>`).join('')}
          </div>
          <p class="hint">Native y los formatos 300 × 250, 160 × 300 y 160 × 600 quedan guardados, pero no se insertan automáticamente: necesitan zonas más grandes. Los anuncios nunca van dentro de formularios. Durante una vinculación activa se ocultan para evitar distracciones y recargas de publicidad.</p>
        </fieldset>
        <div class="ad-config-grid">
          ${campoBanner('bannerLeaderboard', 'leaderboard', 'Banner 728 × 90', '728 × 90 · 31908120', banners.leaderboard)}
          ${campoBanner('bannerSmall', 'small', 'Banner 320 × 50', '320 × 50 · 31905924', banners.small)}
          ${campoBanner('bannerNative', 'native', 'Native banner', 'NativeBanner_1', banners.native)}
          ${campoBanner('bannerWide', 'wide', 'Banner 468 × 60', '468 × 60 · 31908121', banners.wide)}
          ${campoBanner('bannerSquare', 'square', 'Banner 300 × 250', '300 × 250 · 31908118', banners.square)}
          ${campoBanner('bannerMedium', 'medium', 'Banner 160 × 300', '160 × 300 · 31908125', banners.medium)}
          ${campoBanner('bannerTall', 'tall', 'Banner 160 × 600', '160 × 600 · 31908119', banners.tall)}
        </div>
        <div class="hint" style="margin-bottom:12px">Pega el <b>bloque completo de Adsterra</b> (el <span class="mono">script</span> con su <span class="mono">div</span>, el de <span class="mono">atOptions</span> o la URL <span class="mono">invoke.js</span>): se guarda solo lo que hace falta. Si lo que pegas no se entiende, el formulario lo avisa en vez de guardarlo vacío. Los anuncios se sirven en un iframe aislado y se comprueba que cargan de verdad (anti bloqueador).</div>
        <button class="btn btn-primary" type="submit">${icon('check')} Guardar premium</button>
      </form>
    </div>
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
            <fieldset style="border:0;padding:0;margin:0;min-width:0" ${data.canLimits ? '' : 'disabled'}>
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
            </fieldset>
          </form>
        </div>
      </div>
      <div class="card">
        <div class="card-head">
          <div><h3>Intentos de vinculación</h3><p>Para que nadie abuse del panel</p></div>
        </div>
        <div class="card-body">
          <form id="settings-limits-form">
            <fieldset style="border:0;padding:0;margin:0;min-width:0" ${data.canLimits ? '' : 'disabled'}>
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
              <label class="label" for="settings-max-login-global">Intentos globales de login</label>
              <input id="settings-max-login-global" name="maxLoginAttemptsGlobal" type="number" min="0" class="input" value="${data.maxLoginAttemptsGlobal ?? 12}" />
              <div class="hint">Intentos de login permitidos por conexión dentro de la espera configurada abajo. <b>0</b> = sin límite.</div>
            </div>
            <div class="field">
              <label class="label" for="settings-max-login-user">Intentos por usuario de login</label>
              <input id="settings-max-login-user" name="maxLoginAttemptsPerUser" type="number" min="0" class="input" value="${data.maxLoginAttemptsPerUser ?? 6}" />
              <div class="hint">Máximo de intentos por usuario de login. <b>0</b> = sin límite.</div>
            </div>
            <div class="field">
              <label class="label" for="settings-cooldown-login">Espera tras superar los intentos (minutos)</label>
              <input id="settings-cooldown-login" name="loginCooldownMinutes" type="number" min="0" class="input" value="${data.loginCooldownMinutes != null ? data.loginCooldownMinutes : Math.round((data.loginCooldownMs ?? 300000) / 60000)}" />
              <div class="hint">Cuánto tiempo hay que esperar después de gastar los intentos. <b>0</b> = sin espera.</div>
            </div>
            <div class="field">
              <label class="label" for="settings-code-ttl">Duración del código (segundos)</label>
              <input id="settings-code-ttl" name="pairCodeSeconds" type="number" min="5" class="input" value="${duracionCodigo}" />
              <div class="hint">Cuánto vive el código de 8 dígitos antes de caducar (es la cuenta atrás que ve el usuario).</div>
            </div>
            <button class="btn btn-primary" type="submit">${icon('check')} Guardar intentos</button>
            </fieldset>
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
      ${data.canTurnstile ? `<div class="card">
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
      </div>` : ''}
      ${data.canPremium ? adminPremiumHTML(data.premium || {}) : ''}
      <div class="card">
        <div class="card-head"><div><h3>Mantenimiento</h3><p>Actualizar sin reiniciar el servidor</p></div></div>
        <div class="card-body">
          <div class="system-grid">
            <div class="system-item"><div class="si-label">Rama</div><div class="si-value mono" style="font-size:13px">${h(repo.rama || '—')}</div></div>
            <div class="system-item"><div class="si-label">Commit</div><div class="si-value mono" style="font-size:13px">${h(repo.corto || '—')}</div></div>
          </div>
          <div class="notice" style="margin-top:14px">${icon('info')}<div>Trae el código del remoto y lo aplica <b>sin reiniciar el proceso</b>: los sub-bots no se desconectan, el bot y sus workers recargan sus plugins y el panel se recarga con el código nuevo. Tus cambios locales se guardan antes de actualizar.</div></div>
          ${puede('admin.update') ? `<div class="flex gap-8" style="margin-top:14px;flex-wrap:wrap">
            <button class="btn btn-primary" data-action="admin-update">${icon('refresh')} Aplicar cambios</button>
            <button class="btn btn-secondary" data-action="admin-reload">${icon('rotate')} Recargar código</button>
          </div>` : '<div class="hint" style="margin-top:12px">No tienes permiso para aplicar actualizaciones.</div>'}
          <div id="update-result" class="hint" style="margin-top:12px"></div>
        </div>
      </div>
    </div>
  </div>`
}

/* ── Roles y permisos ───────────────────────────────────────────────────── */
function permissionGroupsHTML(selected = [], scope = 'admin') {
  const activos = new Set(selected.includes('*') ? state.adminPermissions.map((p) => p.key) : selected)
  const grupos = new Map()
  for (const permiso of state.adminPermissions) {
    if (scope === 'user' && permiso.scope !== 'user') continue
    if (!grupos.has(permiso.group)) grupos.set(permiso.group, [])
    grupos.get(permiso.group).push(permiso)
  }
  return `<div class="permission-groups">${[...grupos.entries()].map(([grupo, permisos]) => `
    <div class="permission-group">
      <div class="permission-group-title">${h(grupo)}</div>
      <div class="permission-list">
        ${permisos.map((permiso) => {
          const principalOnly = Boolean(permiso.principalOnly)
          const privateLocked = permiso.key === 'admin.users.ip' && !puede('admin.users.ip')
          const checked = activos.has(permiso.key) || (scope === 'admin' && permiso.key === 'admin.access')
          return `<label class="permission-item ${principalOnly ? 'locked' : ''}">
            <input type="checkbox" data-role-permission="${h(permiso.key)}" ${checked ? 'checked' : ''} ${principalOnly || privateLocked ? 'disabled' : ''} />
            <span><b>${h(permiso.label)}</b>${principalOnly ? ' <span class="badge accent" style="font-size:9px">Solo principal</span>' : ''}<small>${h(permiso.key)}</small></span>
          </label>`
        }).join('')}
      </div>
    </div>`).join('')}</div>`
}

export function renderRolePermissions(scope) {
  const box = document.getElementById('role-permissions')
  if (!box) return
  const selected = [...box.querySelectorAll('[data-role-permission]:checked')].map((input) => input.dataset.rolePermission)
  box.innerHTML = permissionGroupsHTML(selected, scope === 'user' ? 'user' : 'admin')
}

export function adminRolesHTML(data) {
  const roles = data.roles || []
  const canManage = Boolean(data.canManage)
  return `<div class="stack">
    <div class="card">
      <div class="card-head">
        <div><h3>Roles y permisos</h3><p>Define exactamente qué puede hacer cada administrador</p></div>
        ${canManage ? `<button class="btn btn-primary" data-action="admin-role-new">${icon('plus')} Nuevo rol</button>` : ''}
      </div>
      <div class="card-body tight">
        <div class="role-list">${roles.map((rol) => {
          const esPrincipal = rol.key === 'principal'
          const bloqueado = rol.key === 'user'
          return `<div class="role-row">
            <div class="role-main">
              <div class="role-icon">${icon(esPrincipal ? 'shieldCheck' : 'shield')}</div>
              <div class="grow">
                <div class="cell-title">${h(rol.name)} ${esPrincipal ? '<span class="badge accent" style="font-size:9px">Principal</span>' : ''} ${rol.system && !esPrincipal ? '<span class="badge neutral" style="font-size:9px">Sistema</span>' : ''}</div>
                <div class="cell-sub">${h(rol.description || 'Sin descripción')}</div>
              </div>
            </div>
            <div class="role-meta">
              <span class="badge ${rol.scope === 'admin' ? 'accent' : 'neutral'}">${rol.scope === 'admin' ? 'Administrador' : 'Usuario'}</span>
              <span class="tiny muted">${Number(rol.userCount || 0)} usuario(s)</span>
              <span class="tiny muted">${rol.permissions?.includes('*') ? 'Todos los permisos' : `${rol.permissions?.length || 0} permiso(s)`}</span>
            </div>
            ${canManage && !esPrincipal && !bloqueado ? `<div class="actions">
              <button class="icon-btn sm" data-action="admin-role-edit" data-id="${rol.id}" title="Editar rol" aria-label="Editar rol">${icon('pencil')}</button>
              ${rol.system ? '' : `<button class="icon-btn sm danger" data-action="admin-role-delete" data-id="${rol.id}" data-name="${h(rol.name)}" title="Eliminar rol" aria-label="Eliminar rol">${icon('trash')}</button>`}
            </div>` : ''}
          </div>`
        }).join('')}</div>
      </div>
    </div>
    <div class="card">
      <div class="card-head"><div><h3>Cómo funcionan</h3><p>El administrador principal siempre conserva el control total</p></div></div>
      <div class="card-body">
        <div class="pairing-alert">${icon('info')}<div>El <b>principal</b> no se puede limitar ni eliminar. Los permisos de <b>Turnstile</b> y de <b>Roles</b> se pueden delegar marcando sus casillas. Los demás roles se pueden editar: marca los permisos y guarda. Si un rol tiene acceso de administrador, hereda también las funciones normales de usuario.</div></div>
      </div>
    </div>
  </div>`
}

export function openRoleModal(id = null) {
  const rol = id ? state.adminRoles.find((item) => Number(item.id) === Number(id)) : null
  if (id && !rol) {
    showToast('No se encontró el rol. Actualiza la lista.', 'error')
    return
  }
  const esNuevo = !rol
  const scope = rol?.scope === 'user' ? 'user' : 'admin'
  const seleccionados = rol?.permissions || (scope === 'admin' ? ['admin.access'] : [])
  openModal({
    title: esNuevo ? 'Nuevo rol' : 'Editar rol',
    subtitle: esNuevo ? 'Crea un rol y elige sus permisos' : (rol?.name || ''),
    wide: true,
    body: `<form id="role-form" data-id="${rol?.id || ''}">
      <div class="form-error">${icon('alert')}<span></span></div>
      <div class="grid-2">
        <div class="field">
          <label class="label" for="role-name">Nombre del rol</label>
          <input id="role-name" name="name" class="input" maxlength="40" value="${h(rol?.name || '')}" placeholder="Ej: Soporte, Moderador, Admin 2…" required />
        </div>
        <div class="field">
          <label class="label" for="role-scope">Tipo de rol</label>
          <select id="role-scope" name="scope" class="select" ${esNuevo ? '' : 'disabled'}>
            <option value="admin" ${scope === 'admin' ? 'selected' : ''}>Administrador</option>
            <option value="user" ${scope === 'user' ? 'selected' : ''}>Usuario</option>
          </select>
          <div class="hint">Los roles de administrador pueden entrar al panel de administración si tienen el permiso de acceso.</div>
        </div>
      </div>
      <div class="field">
        <label class="label" for="role-description">Descripción <span class="muted">(opcional)</span></label>
        <input id="role-description" name="description" class="input" maxlength="180" value="${h(rol?.description || '')}" placeholder="Para qué sirve este rol" />
      </div>
      <div class="label" style="margin-top:4px">Permisos</div>
      <div id="role-permissions">${permissionGroupsHTML(seleccionados, scope)}</div>
    </form>`,
    footer: `<button class="btn btn-ghost" data-action="modal-close">Cancelar</button><button class="btn btn-primary" id="role-save-btn" type="submit" form="role-form">${esNuevo ? 'Crear rol' : 'Guardar cambios'}</button>`,
  })
}

/* ── Correo y plantillas ────────────────────────────────────────────────── */
export function adminMailHTML(data) {
  const config = data.config || {}
  const plantillas = data.templates || {}
  const variables = data.variables || []
  const variablesHTML = variables.map((variable) => `<span class="variable-chip" title="${h(variable.label)}"><b>{{${h(variable.key)}}}</b><span>${h(variable.label)}</span></span>`).join('')
  return `<div class="stack">
    <div class="card">
      <div class="card-head">
        <div><h3>Servidor de correo (SMTP)</h3><p>Se usa para verificar cuentas y recuperar contraseñas</p></div>
        <span class="badge ${config.configured ? 'success' : 'warn'}"><span class="dot"></span>${config.configured ? 'Configurado' : 'Incompleto'}</span>
      </div>
      <div class="card-body">
        <form id="mail-settings-form">
          <div class="form-error">${icon('alert')}<span></span></div>
          <div class="form-success">${icon('check')}<span></span></div>
          <div class="mail-grid">
            <div class="field"><label class="label" for="mail-host">Servidor SMTP</label><input id="mail-host" name="host" class="input mono" value="${h(config.host || '')}" placeholder="mail.spacemail.com" autocomplete="off" /></div>
            <div class="field"><label class="label" for="mail-port">Puerto</label><input id="mail-port" name="port" type="number" min="1" max="65535" class="input" value="${h(config.port || 465)}" /></div>
            <div class="field"><label class="label" for="mail-encryption">Cifrado</label>
              <select id="mail-encryption" name="encryption" class="select">
                <option value="ssl" ${config.encryption === 'ssl' ? 'selected' : ''}>SSL</option>
                <option value="starttls" ${config.encryption === 'starttls' ? 'selected' : ''}>STARTTLS</option>
                <option value="none" ${config.encryption === 'none' ? 'selected' : ''}>Sin cifrado</option>
              </select>
            </div>
            <div class="field"><label class="label" for="mail-mailer">Tipo</label>
              <select id="mail-mailer" name="mailer" class="select">
                <option value="smtp" ${config.mailer === 'smtp' ? 'selected' : ''}>SMTP</option>
              </select>
            </div>
            <div class="field"><label class="label" for="mail-user">Usuario SMTP</label><input id="mail-user" name="user" class="input mono" value="${h(config.user || '')}" placeholder="usuario@tu-dominio.com" autocomplete="off" /></div>
            <div class="field"><label class="label" for="mail-password">Contraseña SMTP</label>
              <div class="input-icon">${icon('key')}<input id="mail-password" name="password" type="password" class="input" value="" placeholder="${config.passwordSet ? '•••••••••• (guardada)' : 'Escribe la contraseña'}" autocomplete="new-password" /><button type="button" class="icon-btn sm" data-action="toggle-password" data-input="mail-password" style="position:absolute;right:5px;top:5px;border:0;background:transparent" aria-label="Mostrar u ocultar">${icon('eye')}</button></div>
              <div class="hint">Nunca se muestra la contraseña guardada. Déjala vacía para conservarla.</div>
            </div>
            <div class="field"><label class="label" for="mail-from">Correo remitente</label><input id="mail-from" name="from" type="email" class="input mono" value="${h(config.from || '')}" placeholder="avisos@tu-dominio.com" /></div>
            <div class="field"><label class="label" for="mail-from-name">Nombre remitente</label><input id="mail-from-name" name="fromName" class="input" value="${h(config.fromName || '')}" placeholder="Notificaciones del panel" /></div>
          </div>
          <label class="check switch" style="margin-top:14px">
            <input type="checkbox" name="requireEmailVerification" ${data.requireEmailVerification ? 'checked' : ''} />
            <span><b>Exigir correo verificado para entrar y vincular sub-bots</b><small>Las cuentas nuevas deben confirmar el código que reciben por correo antes de iniciar sesión. Necesita el SMTP configurado.</small></span>
          </label>
          <div class="variables-title" style="margin-top:20px;padding-top:16px;border-top:1px solid var(--line)">${icon('mail')} Códigos por correo</div>
          <p class="hint" style="margin-top:6px">Cuántos códigos de verificación y recuperación se pueden enviar y cuánto duran. Se aplican al instante, sin reiniciar.</p>
          <div class="mail-grid">
            <div class="field">
              <label class="label" for="mail-code-max">Códigos por hora y cuenta</label>
              <input id="mail-code-max" name="emailCodeMaxPerHour" type="number" min="1" class="input" value="${h(data.emailCodeMaxPerHour ?? 10)}" />
              <div class="hint">Máximo de códigos que recibe una misma cuenta en una hora.</div>
            </div>
            <div class="field">
              <label class="label" for="mail-code-cooldown">Espera entre códigos (segundos)</label>
              <input id="mail-code-cooldown" name="emailCodeCooldownSeconds" type="number" min="5" class="input" value="${h(data.emailCodeCooldownSeconds ?? 60)}" />
              <div class="hint">Tiempo que debe pasar antes de enviar otro código a la misma cuenta.</div>
            </div>
            <div class="field">
              <label class="label" for="mail-code-ttl">Duración del código (segundos)</label>
              <input id="mail-code-ttl" name="emailCodeTtlSeconds" type="number" min="60" class="input" value="${h(data.emailCodeTtlSeconds ?? 900)}" />
              <div class="hint">Cuánto vive el código antes de caducar (900 s = 15 minutos).</div>
            </div>
            <div class="field">
              <label class="label" for="mail-code-attempts">Intentos por código</label>
              <input id="mail-code-attempts" name="emailCodeMaxAttempts" type="number" min="1" class="input" value="${h(data.emailCodeMaxAttempts ?? 5)}" />
              <div class="hint">Fallos permitidos antes de invalidar el código y pedir uno nuevo.</div>
            </div>
          </div>
          <div class="flex gap-8" style="margin-top:16px;flex-wrap:wrap">
            <button class="btn btn-primary" type="submit">${icon('check')} Guardar correo</button>
            <button class="btn btn-secondary" type="button" data-action="mail-test-open">${icon('mail')} Enviar prueba</button>
          </div>
        </form>
        <form id="mail-test-form" style="margin-top:16px;display:none">
          <div class="field"><label class="label" for="mail-test-to">Correo de destino de la prueba</label><input id="mail-test-to" name="to" type="email" class="input" value="${h(state.user?.email || '')}" placeholder="tu@correo.com" required /><div class="hint">Se enviará un mensaje de prueba con la plantilla «Correo de prueba».</div></div>
          <button class="btn btn-secondary" type="submit">${icon('mail')} Enviar prueba</button>
        </form>
      </div>
    </div>
    <div class="card">
      <div class="card-head"><div><h3>Mensajes de correo</h3><p>Edita el asunto, el HTML y la versión en texto plano</p></div></div>
      <div class="card-body">
        <div class="variables-box"><div class="variables-title">${icon('info')} Variables disponibles</div><div class="variables-list">${variablesHTML}</div></div>
        <form id="mail-templates-form">
          <div class="form-error">${icon('alert')}<span></span></div>
          <div class="form-success">${icon('check')}<span></span></div>
          ${Object.entries(plantillas).map(([key, plantilla]) => `<details class="mail-template" ${key === 'verify' ? 'open' : ''}>
            <summary><span>${icon('mail')} ${h(plantilla.label || key)}</span><span class="tiny muted">${h(key)}</span></summary>
            <div class="mail-template-body" data-template-key="${h(key)}">
              <p class="hint" style="margin-top:0">${h(plantilla.description || '')}</p>
              <div class="field"><label class="label">Asunto</label><input class="input" name="subject-${h(key)}" value="${h(plantilla.subject || '')}" maxlength="200" /></div>
              <div class="field"><label class="label">HTML</label><textarea class="textarea mono" name="html-${h(key)}" rows="10" spellcheck="false">${h(plantilla.html || '')}</textarea></div>
              <div class="field"><label class="label">Texto plano <span class="muted">(para clientes sin HTML)</span></label><textarea class="textarea" name="text-${h(key)}" rows="6">${h(plantilla.text || '')}</textarea></div>
            </div>
          </details>`).join('')}
          <button class="btn btn-primary" type="submit" style="margin-top:14px">${icon('check')} Guardar mensajes</button>
        </form>
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
  const roles = state.adminRoles.length
    ? state.adminRoles
    : [
      { id: 'user', name: 'Usuario', scope: 'user', permissions: [] },
      { id: 'admin', name: 'Administrador', scope: 'admin', permissions: [] },
    ]
  const puedeRoles = puede('admin.users.roles') && !user.isPrincipal
  const puedeLimite = puede('admin.users.limit')
  const puedePremium = puede('admin.users.premium')
  const opciones = roles.filter((rol) => rol.key !== 'principal').map((rol) => {
    const selected = user.roleId
      ? Number(rol.id) === Number(user.roleId)
      : (rol.scope === 'admin' ? user.role === 'admin' : user.role !== 'admin')
    return `<option value="${h(rol.id)}" ${selected ? 'selected' : ''}>${h(rol.name)}${rol.scope === 'admin' ? ' · administrador' : ''}</option>`
  }).join('')
  openModal({
    title: 'Editar usuario',
    subtitle: '@' + user.username,
    body: `<form id="user-form" data-id="${user.id}">
      <div class="form-error">${icon('alert')}<span></span></div>
      <div class="field"><label class="label">Usuario</label><input class="input" value="${h(user.username)}" disabled /></div>
      <div class="field"><label class="label" for="user-role">Rol</label>
        <select id="user-role" name="roleId" class="select" ${puedeRoles ? '' : 'disabled'}>
          ${opciones}
        </select>
        <div class="hint">${user.isPrincipal ? 'El rol del administrador principal no se puede cambiar.' : (puedeRoles ? 'Los permisos de cada rol se editan en la pestaña Roles.' : 'No tienes permiso para asignar roles.')}</div>
      </div>
       <div class="field"><label class="label" for="user-status">Estado</label>
        <select id="user-status" name="status" class="select" ${user.isPrincipal ? 'disabled' : ''}>
          <option value="active" ${user.status === 'active' ? 'selected' : ''}>Activo</option>
          <option value="banned" ${user.status === 'banned' ? 'selected' : ''}>Bloqueado</option>
        </select>
       </div>
       <div class="field"><label class="label" for="user-max-subs">Máximo de sub-bots</label><input id="user-max-subs" name="maxSubs" type="number" min="0" max="1000" class="input" value="${user.maxSubs === null || user.maxSubs === undefined ? '' : h(user.maxSubs)}" placeholder="Límite global" ${puedeLimite ? '' : 'disabled'} /><div class="hint">Vacío usa el límite global. 0 significa sin límite para esta cuenta.</div></div>
       <div class="field"><label class="label">Correo</label><input class="input" value="${h(user.email || 'Sin correo')}" disabled /><div class="hint">${user.email ? (user.emailVerified ? 'Correo verificado.' : 'Correo pendiente de verificación.') : 'Esta cuenta no tiene correo.'}</div></div>
       <div class="field"><label class="label" for="user-password">Nueva contraseña <span class="muted">(opcional)</span></label><input id="user-password" name="password" type="password" class="input" autocomplete="new-password" minlength="8" placeholder="Déjalo vacío para no cambiarla" /><div class="hint">Mínimo 8 caracteres. Al bloquear al usuario se cierran sus sesiones.</div></div>
        ${user.bots?.length ? `<div class="field"><label class="label">Premium de sus sub-bots</label><div class="admin-user-bots">${user.bots.map((bot) => `<div class="admin-user-bot-row"><div class="grow"><b>${h(bot.label || bot.phone)}</b><span class="cell-sub">${h(bot.phone)} · ${bot.premium?.active ? 'Activo' : 'Sin Premium'}</span></div>${puedePremium ? `<div class="premium-duration-controls"><input class="input input-sm user-premium-value" type="number" min="1" max="87600" value="24" aria-label="Duración Premium" /><select class="select input-sm user-premium-unit" aria-label="Unidad de duración"><option value="hours">Horas</option><option value="days">Días</option></select><button type="button" class="btn btn-secondary btn-sm" data-action="admin-user-premium" data-user-id="${user.id}" data-phone="${h(bot.phone)}">+ Conceder</button><button type="button" class="btn btn-ghost btn-sm" data-action="admin-user-premium-infinite" data-user-id="${user.id}" data-phone="${h(bot.phone)}" title="Premium infinito">∞</button></div>` : '<span class="hint">Sin permiso</span>'}</div>`).join('')}</div><div class="hint">Elige horas o días. La concesión directa no consume el banco de anuncios.</div></div>` : '<div class="notice info">Este usuario todavía no tiene sub-bots vinculados.</div>'}
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
