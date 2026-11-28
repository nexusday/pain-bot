/* Pain Panel — sub-bots compartidos */
import { api } from './api.js'
import {
  badge,
  content,
  errorPage,
  fmtPhone,
  h,
  icon,
  loadingPage,
  navigate,
  setPage,
  showToast,
  state,
} from './core.js'

function estadoBadge(status) {
  const mapa = {
    joined: ['En el grupo', 'green'],
    pending: ['Pendiente', 'amber'],
    rejected: ['Rechazada', 'red'],
    left: ['Salió', 'neutral'],
    blocked: ['Bloqueado', 'red'],
  }
  const [texto, tono] = mapa[status] || [status, 'neutral']
  return badge(texto, tono)
}

function formPublicar(bots) {
  const opciones = bots
    .filter((bot) => bot.status === 'linked' || bot.status === 'connected')
    .map((bot) => `<option value="${h(bot.phone)}">${h(bot.label || fmtPhone(bot.phone))}</option>`)
    .join('')
  if (!opciones) {
    return `<div class="notice warn">${icon('alert')}<div>No tienes sub-bots vinculados. <a href="#/link">Vincula uno</a> para poder compartirlo.</div></div>`
  }
  return `<form id="shared-publish-form">
    <div class="form-error">${icon('alert')}<span></span></div>
    <div class="grid-2">
      <div class="field">
        <label class="label">Sub-bot</label>
        <select name="phone" class="input">${opciones}</select>
      </div>
      <div class="field">
        <label class="label">Grupos máximos</label>
        <input name="maxGroups" class="input" type="number" min="1" max="8" value="3" />
        <div class="hint">Free compartido: 3 · Free aislado: 4 · Premium compartido: 5 · Premium aislado: 6.</div>
      </div>
    </div>
    <div class="field">
      <label class="label">Solicitudes por IP</label>
      <input name="maxPerIp" class="input" type="number" min="1" max="10" value="1" />
      <div class="hint">Cuántas solicitudes puede hacer una misma IP para este sub-bot.</div>
    </div>
    <button class="btn btn-primary" type="submit">${icon('globe')} Publicar sub-bot</button>
  </form>`
}

function tarjetaMia(bot, joins) {
  const propios = joins.filter((j) => Number(j.sharedId) === Number(bot.id))
  const activos = propios.filter((j) => j.status === 'joined')
  return `<div class="card" style="margin-bottom:14px">
    <div class="card-head">
      <div class="cell-main">
        <div class="row-icon accent">${icon('bot')}</div>
        <div class="grow">
          <div class="cell-title">${h(fmtPhone(bot.phone))}</div>
          <div class="cell-sub">${bot.joined}/${bot.maxGroups} grupos · máx. ${bot.maxAllowed} por tu tier</div>
        </div>
      </div>
      ${bot.active ? badge('Publicado', 'green') : badge('Pausado', 'neutral')}
    </div>
    <div class="card-body">
      <div class="flex gap-8" style="flex-wrap:wrap;margin-bottom:10px">
        <button class="btn btn-ghost btn-sm" data-action="shared-toggle" data-id="${bot.id}" data-active="${bot.active ? '0' : '1'}">${bot.active ? 'Pausar' : 'Publicar'}</button>
        <button class="btn btn-ghost btn-sm danger" data-action="shared-delete" data-id="${bot.id}">${icon('trash')} Quitar</button>
      </div>
      <div class="tiny muted" style="margin-bottom:6px">Solicitudes (${propios.length})</div>
      ${propios.length ? propios.map((j) => `<div style="border:1px solid var(--border,rgba(255,255,255,.08));border-radius:12px;padding:10px;margin-bottom:8px">
        <div class="flex" style="justify-content:space-between;gap:10px;flex-wrap:wrap">
          <div><b>${h(j.groupName || j.groupJid || 'Grupo')}</b><div class="tiny muted">${h(j.requester)} · ${h(j.groupLink)}</div></div>
          <div class="flex gap-8" style="align-items:center">${estadoBadge(j.status)}
            ${j.status === 'joined' ? `<button class="btn btn-ghost btn-sm danger" data-action="shared-leave" data-id="${j.id}">Salir</button>` : ''}
            ${j.status !== 'blocked' ? `<button class="btn btn-ghost btn-sm" data-action="shared-block" data-id="${j.id}">Bloquear</button>` : ''}
          </div>
        </div>
      </div>`).join('') : '<div class="hint">Todavía nadie pidió este sub-bot.</div>'}
    </div>
  </div>`
}

function tarjetaPublica(shared) {
  return `<div class="card" style="height:100%">
    <div class="card-head">
      <div class="cell-main">
        <div class="row-icon violet">${icon('globe')}</div>
        <div class="grow">
          <div class="cell-title">Sub-bot de ${h(shared.owner)}</div>
          <div class="cell-sub">${shared.available} plaza(s) libre(s) de ${shared.maxGroups}</div>
        </div>
      </div>
    </div>
    <div class="card-body">
      <div class="progress premium-progress"><span style="width:${shared.maxGroups ? Math.round((shared.joined / shared.maxGroups) * 100) : 0}%"></span></div>
      <div class="hint" style="margin:8px 0 12px">Pega el enlace de tu grupo. El sub-bot se une y queda activo para ese grupo automáticamente.</div>
      <form class="shared-join-form" data-id="${shared.id}">
        <div class="form-error">${icon('alert')}<span></span></div>
        <div class="field">
          <input name="groupLink" class="input" placeholder="https://chat.whatsapp.com/..." required />
        </div>
        <button class="btn btn-primary btn-block btn-sm" type="submit" ${shared.available <= 0 ? 'disabled' : ''}>${icon('link')} Unir a mi grupo</button>
      </form>
    </div>
  </div>`
}

const POR_PAGINA = 6

export async function renderShared() {
  setPage('Bots para grupos', 'Presta un sub-bot o pide uno para tu grupo')
  content(loadingPage('Cargando subbots compartidos…'))
  let datos
  let mine
  let bots
  try {
    const [publico, propios, misBots] = await Promise.all([
      api.get('/api/shared'),
      api.get('/api/shared/mine'),
      api.get('/api/bots').catch(() => ({ bots: [] })),
    ])
    datos = publico
    mine = propios
    bots = Array.isArray(misBots.bots) ? misBots.bots : []
  } catch (error) {
    content(errorPage(error.message))
    return
  }
  const shared = Array.isArray(datos.shared) ? datos.shared : []
  const mios = Array.isArray(mine.bots) ? mine.bots : []
  const joins = Array.isArray(mine.joins) ? mine.joins : []
  const totalPaginas = Math.max(1, Math.ceil(shared.length / POR_PAGINA))
  const paginaActual = Math.min(Math.max(0, Number(state.sharedPage) || 0), totalPaginas - 1)
  state.sharedPage = paginaActual
  const visibles = shared.slice(paginaActual * POR_PAGINA, paginaActual * POR_PAGINA + POR_PAGINA)

  content(`
    <div class="page-head">
      <div><h2>Bots para grupos</h2><p>Presta uno de tus sub-bots para ayudar en grupos de otras personas, o pide uno prestado para tu propio grupo.</p></div>
      <div class="page-actions">
        <button class="btn btn-secondary" data-action="refresh">${icon('refresh')} Actualizar</button>
        <a class="btn btn-secondary" href="#/servers">${icon('server')} Servidores</a>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px"><div class="card-body">
      <div class="flex" style="gap:12px;flex-wrap:wrap;align-items:flex-start">
        <div class="row-icon accent">${icon('users')}</div>
        <div class="grow">
          <div style="font-weight:700;margin-bottom:6px">¿Cómo funciona?</div>
          <div class="tiny muted" style="line-height:1.6">
            <b>Si compartes:</b> eliges un sub-bot tuyo, cuántos grupos puede atender y cuántas solicitudes acepta por IP. Verás el nombre y el enlace de cada grupo, quién lo pidió, y podrás sacar el bot o bloquear a esa persona.<br/>
            <b>Si pides:</b> pegas el enlace de tu grupo. El bot se une, queda activo solo en ese grupo y consume una de las plazas del dueño.<br/>
            <b>Límites por servidor:</b> Free compartido 3 · Free aislado 4 · Premium compartido 5 · Premium aislado 6.
          </div>
        </div>
      </div>
    </div></div>

    <div class="notice warn" style="margin-bottom:16px">${icon('alert')}<div><b>Importante:</b> no nos hacemos responsables de bloqueos, restricciones o baneos por usar el bot para spam en varios grupos. Solo garantizamos medidas de seguridad (límites por IP, por grupos y por actividad) para reducir que WhatsApp detecte el comportamiento demasiado rápido. Usa el bot con moderación y respeta las normas de cada grupo.</div></div>

    <div class="grid-2" style="align-items:start">
      <div>
        <div class="card" style="margin-bottom:16px">
          <div class="card-head"><div><h3>Publicar mi sub-bot</h3><p>Comparte un bot que ya tengas vinculado</p></div></div>
          <div class="card-body">${formPublicar(bots)}</div>
        </div>
        <div class="card">
          <div class="card-head"><div><h3>Mis subbots publicados</h3><p>${mios.length} publicación(es)</p></div></div>
          <div class="card-body">${mios.length ? mios.map((bot) => tarjetaMia(bot, joins)).join('') : '<div class="hint">Aún no publicaste ningún sub-bot.</div>'}</div>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><div><h3>Bots disponibles</h3><p>${shared.length} publicación(es) · pide uno para tu grupo</p></div></div>
        <div class="card-body">
          ${visibles.length
            ? `<div class="stack" style="display:grid;gap:14px">${visibles.map(tarjetaPublica).join('')}</div>
               ${totalPaginas > 1 ? `<div class="flex" style="justify-content:space-between;align-items:center;margin-top:16px;gap:10px;flex-wrap:wrap">
                 <button class="btn btn-ghost btn-sm" data-action="shared-page" data-dir="prev" ${paginaActual === 0 ? 'disabled' : ''}>${icon('chevronLeft')} Anterior</button>
                 <span class="tiny muted">Página ${paginaActual + 1} de ${totalPaginas}</span>
                 <button class="btn btn-ghost btn-sm" data-action="shared-page" data-dir="next" ${paginaActual >= totalPaginas - 1 ? 'disabled' : ''}>Siguiente ${icon('chevronRight')}</button>
               </div>` : ''}`
            : '<div class="empty"><div class="empty-icon">' + icon('users') + '</div><h4>No hay bots publicados</h4><p>Cuando alguien comparta el suyo aparecerá aquí.</p></div>'}
        </div>
      </div>
    </div>
  `)
}

export async function cambiarPaginaShared(direccion) {
  const actual = Math.max(0, Number(state.sharedPage) || 0)
  state.sharedPage = direccion === 'prev' ? Math.max(0, actual - 1) : actual + 1
  await renderShared()
}

export async function publicarShared(form) {
  const body = {
    phone: form.querySelector('[name="phone"]')?.value,
    maxGroups: Number(form.querySelector('[name="maxGroups"]')?.value) || 3,
    maxPerIp: Number(form.querySelector('[name="maxPerIp"]')?.value) || 1,
  }
  try {
    await api.post('/api/shared', body)
    showToast('Sub-bot publicado.', 'success')
    await renderShared()
  } catch (error) {
    showToast(error.message || 'No se pudo publicar.', 'error')
  }
}

export async function unirShared(form) {
  const id = Number(form.dataset.id)
  const groupLink = form.querySelector('[name="groupLink"]')?.value
  try {
    const data = await api.post(`/api/shared/${id}/join`, { groupLink })
    showToast(`Sub-bot unido a ${data.group?.name || 'tu grupo'}.`, 'success')
    await renderShared()
  } catch (error) {
    showToast(error.message || 'No se pudo unir el sub-bot.', 'error')
  }
}

export async function accionShared(action, id, dataset = {}) {
  try {
    if (action === 'shared-toggle') {
      await api.patch(`/api/shared/${id}`, { active: dataset.active === '1' })
      showToast('Publicación actualizada.', 'success')
    } else if (action === 'shared-delete') {
      if (!window.confirm('¿Quitar esta publicación? El sub-bot saldrá de la lista.')) return
      await api.del(`/api/shared/${id}`)
      showToast('Publicación eliminada.', 'success')
    } else if (action === 'shared-leave') {
      await api.post(`/api/shared/joins/${id}/leave`, {})
      showToast('El sub-bot salió del grupo.', 'success')
    } else if (action === 'shared-block') {
      await api.post(`/api/shared/joins/${id}/block`, {})
      showToast('Solicitante bloqueado.', 'success')
    }
    await renderShared()
  } catch (error) {
    showToast(error.message || 'No se pudo completar la acción.', 'error')
  }
}
