/* Selector visual de servidor para vincular o mover un sub-bot.
 *
 * Sustituye el <select> nativo por una tarjeta que abre un modal con los
 * servidores agrupados por tier. Muestra capacidad, DB, salud y latencia para
 * que el usuario entienda qué está eligiendo, tanto en móvil como en PC.
 */
import { closeModal, h, icon, openModal } from './core.js'

const TIER_META = {
  free: { label: 'Free', tone: 'neutral' },
  premium: { label: 'Premium', tone: 'info' },
  vip: { label: 'VIP', tone: 'warn' },
}

const ORDEN_TIERS = ['free', 'premium', 'vip']
const TITULO_GRUPO = {
  free: 'Servidores Free',
  premium: 'Servidores Premium',
  vip: 'Servidores VIP',
}

function tierDe(servidor) {
  const tier = String(servidor?.tier || 'free').toLowerCase()
  return TIER_META[tier] ? tier : 'free'
}

function colorSalud(score) {
  const valor = Number(score) || 0
  if (valor >= 85) return '#22c55e'
  if (valor >= 65) return '#06b6d4'
  if (valor >= 45) return '#f59e0b'
  return '#ef4444'
}

function nombreVisible(servidor) {
  const nombre = String(servidor?.name || 'Servidor').trim()
  const tier = String(servidor?.tier || '').toUpperCase()
  if (!tier) return nombre
  const escapado = tier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return nombre.replace(new RegExp(`\\s*[·|-]\\s*${escapado}\\s*$`, 'i'), '').trim() || nombre
}

function esLleno(servidor) {
  const maximo = Number(servidor?.maxSessions) || 0
  return maximo > 0 && Number(servidor?.botCount || 0) >= maximo
}

function ocupacion(servidor) {
  const maximo = Number(servidor?.maxSessions) || 0
  if (!maximo) return null
  return Math.min(100, Math.round((Number(servidor?.botCount || 0) / maximo) * 100))
}

function metaServidor(servidor) {
  const partes = []
  const maximo = Number(servidor?.maxSessions) || 0
  const bots = Number(servidor?.botCount || 0)
  partes.push(`${bots} ${bots === 1 ? 'bot' : 'bots'}${maximo ? ` / ${maximo}` : ''}`)
  partes.push(servidor?.dbMode === 'isolated' ? 'DB aislada' : 'DB compartida')
  const rendimiento = servidor?.performance
  if (rendimiento) {
    partes.push(`Salud ${Math.round(Number(rendimiento.score) || 0)}/100`)
  }
  return partes.join(' · ')
}

function triggerHTML(servidor, includeAuto) {
  if (!servidor) {
    if (!includeAuto) {
      return `<span class="server-picker-icon">${icon('server')}</span>
        <span class="server-picker-copy">
          <span class="server-picker-name">Elige un servidor</span>
          <span class="server-picker-meta">Toca para ver capacidad, DB y salud</span>
        </span>`
    }
    return `<span class="server-picker-icon accent">${icon('sparkles')}</span>
      <span class="server-picker-copy">
        <span class="server-picker-name">Automático</span>
        <span class="server-picker-meta">El panel elige el servidor Free con espacio</span>
      </span>
      <span class="server-picker-side"><span class="badge success">Recomendado</span></span>`
  }
  const tier = tierDe(servidor)
  const meta = TIER_META[tier]
  const lleno = esLleno(servidor)
  return `<span class="server-picker-icon ${meta.tone}">${icon('server')}</span>
    <span class="server-picker-copy">
      <span class="server-picker-name">${h(nombreVisible(servidor))}</span>
      <span class="server-picker-meta">${h(metaServidor(servidor))}</span>
    </span>
    <span class="server-picker-side">
      <span class="badge ${meta.tone}">${meta.label}</span>
      ${lleno ? '<span class="badge danger">Lleno</span>' : ''}
    </span>`
}

function saludHTML(servidor) {
  const rendimiento = servidor?.performance
  if (!rendimiento) {
    return '<span class="server-option-health muted">Sin datos de rendimiento</span>'
  }
  const score = Math.round(Number(rendimiento.score) || 0)
  const p99 = Math.round(Number(rendimiento.p99Ms) || 0)
  return `<span class="server-option-health" style="color:${colorSalud(score)}">${icon('activity')} Salud ${score}/100 · p99 ${p99} ms</span>`
}

function capacidadHTML(servidor) {
  const pct = ocupacion(servidor)
  if (pct === null) {
    return `<span class="server-option-capacity"><span class="tiny muted">Sin límite de capacidad</span></span>`
  }
  const color = pct >= 90 ? 'var(--danger)' : pct >= 70 ? 'var(--warn)' : 'var(--success)'
  return `<span class="server-option-capacity">
    <span class="progress" style="height:4px"><span style="width:${pct}%;background:${color}"></span></span>
    <span class="tiny muted">${pct}% ocupado</span>
  </span>`
}

function opcionHTML(servidor, seleccionado) {
  const tier = tierDe(servidor)
  const meta = TIER_META[tier]
  const lleno = esLleno(servidor)
  const score = Number(servidor?.performance?.score)
  const rapido = Number.isFinite(score) && score >= 85
  return `<button type="button" class="server-option${seleccionado ? ' is-selected' : ''}${lleno ? ' is-full' : ''}" data-server-value="${h(String(servidor.id))}" role="option" aria-selected="${seleccionado}" ${lleno ? 'disabled' : ''}>
    <span class="server-option-icon ${meta.tone}">${icon('server')}</span>
    <span class="server-option-copy">
      <span class="server-option-head">
        <span class="server-option-title">${h(nombreVisible(servidor))}</span>
        <span class="badge ${meta.tone}">${meta.label}</span>
        ${lleno ? '<span class="badge danger">Lleno</span>' : rapido ? '<span class="badge success">Rápido</span>' : ''}
      </span>
      <span class="server-option-desc">${h(servidor.description || 'Sin descripción.')}</span>
      <span class="server-option-meta">
        <span>${icon('users')} ${Number(servidor.botCount || 0)}${Number(servidor.maxSessions) > 0 ? ` / ${Number(servidor.maxSessions)}` : ''} bots</span>
        <span>${icon('database')} ${servidor.dbMode === 'isolated' ? 'DB aislada' : 'DB compartida'}</span>
        ${saludHTML(servidor)}
      </span>
      ${capacidadHTML(servidor)}
    </span>
    <span class="server-option-check">${seleccionado ? icon('check') : icon('chevronRight')}</span>
  </button>`
}

function opcionAutoHTML(includeAuto, seleccionado) {
  if (!includeAuto) return ''
  return `<button type="button" class="server-option server-option-auto${seleccionado ? ' is-selected' : ''}" data-server-value="" role="option" aria-selected="${seleccionado}">
    <span class="server-option-icon accent">${icon('sparkles')}</span>
    <span class="server-option-copy">
      <span class="server-option-head">
        <span class="server-option-title">Automático</span>
        <span class="badge success">Recomendado</span>
      </span>
      <span class="server-option-desc">El panel asigna el servidor Free que tenga espacio. Ideal si no necesitas uno específico.</span>
      <span class="server-option-meta"><span>${icon('shieldCheck')} Sin elegir un servidor manualmente</span></span>
    </span>
    <span class="server-option-check">${seleccionado ? icon('check') : icon('chevronRight')}</span>
  </button>`
}

function gruposHTML(servers, selectedId) {
  const grupos = new Map()
  for (const servidor of servers) {
    const tier = tierDe(servidor)
    if (!grupos.has(tier)) grupos.set(tier, [])
    grupos.get(tier).push(servidor)
  }
  return ORDEN_TIERS.map((tier) => {
    const lista = grupos.get(tier)
    if (!lista?.length) return ''
    return `<div class="server-option-group">
      <div class="server-option-group-title">${TITULO_GRUPO[tier]}</div>
      ${lista.map((servidor) => opcionHTML(servidor, String(selectedId || '') === String(servidor.id))).join('')}
    </div>`
  }).join('')
}

export function selectorServidorHTML({
  inputId,
  inputName = '',
  inputAttrs = '',
  selectedId = '',
  servers = [],
  includeAuto = true,
  disabled = false,
}) {
  const lista = Array.isArray(servers) ? servers : []
  const servidor = selectedId !== null && selectedId !== undefined && selectedId !== ''
    ? lista.find((item) => String(item.id) === String(selectedId)) || null
    : null
  const attrs = [
    inputName ? `name="${h(inputName)}"` : '',
    inputAttrs,
  ].filter(Boolean).join(' ')
  return `<input type="hidden" id="${h(inputId)}" ${attrs} value="${servidor ? h(String(servidor.id)) : ''}" />
    <button type="button" id="${h(inputId)}-trigger" class="server-picker-trigger" data-server-picker data-server-picker-input="${h(inputId)}" data-server-picker-auto="${includeAuto ? '1' : '0'}" aria-haspopup="dialog" ${disabled ? 'disabled' : ''}>
      ${triggerHTML(servidor, includeAuto)}
      <span class="server-picker-chevron">${icon('chevronDown')}</span>
    </button>`
}

export function abrirSelectorServidor({
  servers = [],
  selectedId = '',
  includeAuto = true,
  title = 'Elegir servidor',
  subtitle = 'Dónde se ejecutará tu sub-bot',
  onSelect,
} = {}) {
  const lista = Array.isArray(servers) ? servers : []
  openModal({
    title,
    subtitle,
    wide: true,
    body: `<div class="server-option-list" role="listbox" aria-label="Servidores disponibles">
      ${opcionAutoHTML(includeAuto, !selectedId)}
      ${gruposHTML(lista, selectedId)}
      ${!lista.length && !includeAuto ? '<div class="server-option-empty">No hay servidores disponibles.</div>' : ''}
    </div>`,
    footer: '<button class="btn btn-ghost" data-action="modal-close">Cancelar</button>',
    onMount(root) {
      root.querySelectorAll('.server-option').forEach((boton) => {
        boton.addEventListener('click', () => {
          if (boton.disabled) return
          const valor = boton.dataset.serverValue || ''
          const servidor = valor
            ? lista.find((item) => String(item.id) === String(valor)) || null
            : null
          closeModal()
          onSelect?.(valor, servidor)
        })
      })
    },
  })
}

export function bindSelectorServidor(trigger, { servers = [], includeAuto = true } = {}) {
  if (!trigger || trigger.dataset.serverPickerBound === '1') return
  trigger.dataset.serverPickerBound = '1'
  const input = document.getElementById(trigger.dataset.serverPickerInput || '')
  if (!input) return

  const renderTrigger = (servidor) => {
    trigger.innerHTML = `${triggerHTML(servidor || null, includeAuto)}<span class="server-picker-chevron">${icon('chevronDown')}</span>`
  }

  trigger.addEventListener('click', () => {
    if (trigger.disabled) return
    abrirSelectorServidor({
      servers,
      includeAuto,
      selectedId: input.value,
      onSelect(valor, servidor) {
        input.value = valor
        input.dispatchEvent(new Event('change', { bubbles: true }))
        renderTrigger(servidor)
      },
    })
  })
}

export function bindServerPickers(servers = []) {
  document.querySelectorAll('[data-server-picker]').forEach((trigger) => {
    bindSelectorServidor(trigger, {
      servers,
      includeAuto: trigger.dataset.serverPickerAuto !== '0',
    })
  })
}
