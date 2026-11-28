/* Pain Panel — módulo pages-servers
 * Vista pública de servidores (carriles) donde se ejecutan los sub-bots.
 * Además de nombre, descripción y tier, muestra el rendimiento en vivo de
 * cada servidor: latencia p99, CPU, uptime, 428 y bots conectados. Así el
 * usuario puede ver qué servidor va rápido y cuál está bajo carga.
 */
import { api } from './api.js'
import {
  content,
  errorPage,
  fmtPhone,
  h,
  icon,
  loadingPage,
  setPage,
} from './core.js'

const TIER_LABEL = {
  free: 'Free',
  premium: 'Premium',
  vip: 'VIP',
}

const TIER_TONE = {
  free: 'neutral',
  premium: 'info',
  vip: 'warn',
}

function insigniaTier(tier) {
  return `<span class="badge ${TIER_TONE[tier] || 'neutral'}"><span class="dot"></span>${h(TIER_LABEL[tier] || tier || 'Free')}</span>`
}

function duracionCorta(segundos) {
  const total = Math.max(0, Math.round(Number(segundos) || 0))
  if (total < 60) return `${total} s`
  const minutos = Math.floor(total / 60)
  if (minutos < 60) return `${minutos} min`
  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `${horas} h ${minutos % 60} min`
  return `${Math.floor(horas / 24)} d ${horas % 24} h`
}

function anilloRendimiento(perf) {
  if (!perf) return ''
  const color = perf.score >= 85
    ? '#22c55e'
    : perf.score >= 65
      ? '#06b6d4'
      : perf.score >= 45
        ? '#f59e0b'
        : '#ef4444'
  const caidas = Number(perf.desconexiones428) || 0
  const caidasTono = caidas > 0 ? '#f59e0b' : 'inherit'
  return `<div class="pain-perf" style="display:flex;align-items:center;gap:12px;margin:0 0 14px">
    <div style="position:relative;width:62px;height:62px;flex:none;color:${color}" title="Salud del servidor: combina latencia, CPU y bots conectados.">
      <svg viewBox="0 0 42 42" width="62" height="62" style="transform:rotate(-90deg)">
        <circle cx="21" cy="21" r="18" fill="none" stroke="rgba(148,163,184,.18)" stroke-width="4"/>
        <circle cx="21" cy="21" r="18" fill="none" stroke="currentColor" stroke-width="4" pathLength="100" stroke-dasharray="${perf.score} 100" stroke-linecap="round"/>
      </svg>
      <div style="position:absolute;inset:0;display:grid;place-items:center;font-weight:800;font-size:17px">${perf.score}</div>
    </div>
    <div style="min-width:0">
      <div style="font-weight:700;display:flex;align-items:center;gap:6px"><span class="pain-live-dot" style="background:${color};box-shadow:0 0 0 3px ${color}26"></span>${h(perf.label)} · ${h(perf.speed)}</div>
      <div class="tiny muted" style="margin-top:3px;line-height:1.45" title="p99: latencia del 1% de operaciones más lentas. CPU: peor carril. 428: cierres pedidos por WhatsApp.">
        Latencia p99 ${perf.p99Ms} ms · CPU ${perf.cpuPercent}% · ${perf.connected}/${perf.total} conectados · ${perf.lanes} carril(es)
      </div>
      <div class="tiny muted" style="margin-top:2px;line-height:1.4">
        Activo ${duracionCorta(perf.uptimeSegundos)} · <span style="color:${caidasTono}">428: ${caidas}</span> · reintentos: ${Number(perf.reintentos) || 0}
      </div>
    </div>
  </div>`
}

function servidorDeBot(servidores, serverId) {
  if (serverId === null || serverId === undefined) {
    return servidores.find((s) => s.auto) || null
  }
  return servidores.find((s) => Number(s.id) === Number(serverId)) || null
}

function tarjetaServidor(servidor, misBots, insignias = []) {
  const botsAqui = misBots.filter((bot) => {
    if (servidor.auto) return bot.serverId === null || bot.serverId === undefined
    return Number(bot.serverId) === Number(servidor.id)
  })
  const ocupacion = servidor.maxSessions
    ? Math.min(100, Math.round((servidor.botCount / servidor.maxSessions) * 100))
    : null
  const tonoIcono = servidor.tier === 'premium' ? 'violet' : servidor.tier === 'vip' ? 'amber' : 'green'
  return `<div class="card" style="height:100%">
    <div class="card-head">
      <div class="cell-main">
        <div class="row-icon ${tonoIcono}">${icon('server')}</div>
        <div class="grow">
          <div class="cell-title">${h(servidor.name)}</div>
          <div class="cell-sub">${h(servidor.dbMode === 'isolated' ? 'DB aislada' : 'DB compartida')}${servidor.auto ? ' · asignación automática' : ''}</div>
        </div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">
        ${insignias.map((texto) => `<span class="badge ${texto.tono}" title="${h(texto.title || '')}"><span class="dot"></span>${h(texto.label)}</span>`).join('')}
        ${insigniaTier(servidor.tier)}
      </div>
    </div>
    <div class="card-body">
      <p class="muted" style="margin:0 0 12px;line-height:1.5">${h(servidor.description || 'Sin descripción.')}</p>
      ${anilloRendimiento(servidor.performance)}
      <div class="stats" style="grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:12px">
        <div style="border:1px solid var(--border,rgba(255,255,255,.08));border-radius:12px;padding:10px">
          <div class="tiny muted">Bots en este servidor</div>
          <div style="font-size:22px;font-weight:800">${servidor.botCount}</div>
        </div>
        <div style="border:1px solid var(--border,rgba(255,255,255,.08));border-radius:12px;padding:10px">
          <div class="tiny muted">${servidor.maxSessions ? 'Capacidad' : 'Modo'}</div>
          <div style="font-size:22px;font-weight:800">${servidor.maxSessions ? servidor.maxSessions : 'Auto'}</div>
        </div>
      </div>
      ${ocupacion !== null
        ? `<div class="progress premium-progress" title="${ocupacion}% ocupado"><span style="width:${ocupacion}%"></span></div>
           <div class="tiny muted" style="margin-top:6px">${ocupacion}% ocupado</div>`
        : ''}
      ${botsAqui.length
        ? `<div style="margin-top:12px"><div class="tiny muted" style="margin-bottom:6px">Tus bots aquí:</div>${botsAqui.map((bot) => `<span class="badge neutral" style="margin:0 6px 6px 0">${icon('bot')} ${h(bot.label || fmtPhone(bot.phone))}</span>`).join('')}</div>`
        : `<div class="hint" style="margin-top:12px">${icon('info')} Ninguno de tus bots está en este servidor.</div>`}
      ${servidor.tier !== 'free' && !servidor.auto
        ? `<div class="hint" style="margin-top:10px">${icon('sparkles')} Servidor dedicado: requiere Premium activo para cambiar tu bot aquí.</div>`
        : ''}
    </div>
  </div>`
}

export async function renderServers() {
  setPage('Servidores', 'Dónde se ejecutan los sub-bots del panel')
  content(loadingPage('Cargando servidores…'))
  let datos
  try {
    datos = await api.get('/api/servers')
  } catch (error) {
    content(errorPage(error.message))
    return
  }
  const servidores = Array.isArray(datos.servers) ? datos.servers : []
  const misBots = Array.isArray(datos.myBots) ? datos.myBots : []
  const totalBots = Number.isFinite(Number(datos.totalLive))
    ? Number(datos.totalLive)
    : servidores.reduce((total, servidor) => total + Number(servidor.botCount || 0), 0)
  const miServidor = misBots.length
    ? servidorDeBot(servidores, misBots[0].serverId)
    : null
  const conRendimiento = servidores.filter((servidor) => servidor.performance)
  const saludMedia = conRendimiento.length
    ? Math.round(conRendimiento.reduce((total, servidor) => total + servidor.performance.score, 0) / conRendimiento.length)
    : null
  const masRapido = conRendimiento.length
    ? [...conRendimiento].sort((a, b) => a.performance.p99Ms - b.performance.p99Ms)[0]
    : null
  const masCargado = conRendimiento.length
    ? [...conRendimiento].sort((a, b) => b.performance.p99Ms - a.performance.p99Ms)[0]
    : null
  const ranking = conRendimiento.length > 1
    ? [...conRendimiento].sort((a, b) => b.performance.score - a.performance.score || a.performance.p99Ms - b.performance.p99Ms).slice(0, 3)
    : []
  const medallas = ['🥇', '🥈', '🥉']
  const insigniasDe = (servidor) => {
    if (!servidor.performance || conRendimiento.length < 2) return []
    const insignias = []
    if (masRapido && servidor.id === masRapido.id) {
      insignias.push({ label: 'Más rápido', tono: 'success', title: 'Menor latencia p99 de la red ahora mismo.' })
    }
    if (masCargado && servidor.id === masCargado.id && servidor.performance.score < 65) {
      insignias.push({ label: 'Más carga', tono: 'warn', title: 'Es el servidor con mayor latencia en este momento.' })
    }
    return insignias
  }

  content(`
    <style>
      @keyframes painPulse { 0%,100% { opacity: 1; transform: scale(1) } 50% { opacity: .35; transform: scale(.75) } }
      .pain-live-dot { display:inline-block; width:7px; height:7px; border-radius:50%; background:#22c55e; box-shadow:0 0 0 3px rgba(34,197,94,.15); animation: painPulse 2s ease-in-out infinite; }
    </style>
    <div class="page-head">
      <div><h2>Servidores</h2><p>Los sub-bots se reparten entre servidores para mantenerse estables. Aquí ves dónde está cada uno y cómo rinde en vivo.</p></div>
      <div class="page-actions">
        <button class="btn btn-secondary" data-action="refresh">${icon('refresh')} Actualizar</button>
        <a class="btn btn-secondary" href="#/bots">${icon('bot')} Mis bots</a>
        <a class="btn btn-primary" href="#/premium">${icon('sparkles')} Premium</a>
      </div>
    </div>

    ${saludMedia !== null ? `<div class="card" style="margin-bottom:16px"><div class="card-body">
      <div class="flex" style="gap:14px;flex-wrap:wrap;align-items:center">
        <div class="row-icon ${saludMedia >= 85 ? 'green' : saludMedia >= 65 ? 'cyan' : 'amber'}">${icon('activity')}</div>
        <div class="grow">
          <div style="font-weight:700">Estado de la red <span class="badge ${saludMedia >= 85 ? 'success' : saludMedia >= 65 ? 'info' : 'warn'}" style="margin-left:6px">${saludMedia}/100</span></div>
          <div class="tiny muted" style="margin-top:3px">Salud media de los servidores activos · Más rápido: <b>${h(masRapido?.name || '—')}</b> (${masRapido?.performance?.p99Ms ?? '—'} ms) · Más cargado: <b>${h(masCargado?.name || '—')}</b> (${masCargado?.performance?.p99Ms ?? '—'} ms)</div>
        </div>
        <div class="tiny muted">La salud combina latencia (p99), carga de CPU y bots conectados. Se actualiza cada minuto.</div>
      </div>
      ${ranking.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-top:12px">
        ${ranking.map((servidor, indice) => `<div style="display:flex;align-items:center;gap:8px;border:1px solid var(--line);border-radius:10px;padding:8px 10px;min-width:0" title="Puesto ${indice + 1} por salud del servidor">
          <span style="font-size:16px">${medallas[indice]}</span>
          <span style="font-weight:650;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" class="grow">${h(servidor.name)}</span>
          <span class="tiny muted" style="white-space:nowrap">${servidor.performance.score} · ${servidor.performance.p99Ms} ms</span>
        </div>`).join('')}
      </div>` : ''}
    </div></div>` : ''}

    <div class="stats" style="margin-bottom:16px">
      <div class="card"><div class="card-body">
        <div class="tiny muted">Servidores activos</div>
        <div style="font-size:26px;font-weight:800">${servidores.filter((s) => !s.auto).length}</div>
      </div></div>
      <div class="card"><div class="card-body">
        <div class="tiny muted">Bots conectados al panel</div>
        <div style="font-size:26px;font-weight:800">${totalBots}</div>
      </div></div>
      <div class="card"><div class="card-body">
        <div class="tiny muted">Tu servidor actual</div>
        <div style="font-size:18px;font-weight:800">${h(miServidor?.name || 'Sin bot vinculado')}</div>
        ${miServidor?.performance ? `<div class="tiny muted" style="margin-top:3px">Salud ${miServidor.performance.score}/100 · ${h(miServidor.performance.speed)} · ${miServidor.performance.p99Ms} ms</div>` : ''}
      </div></div>
    </div>

    <div class="stack" style="display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(280px,1fr))">
      ${servidores.length
        ? servidores.map((servidor) => tarjetaServidor(servidor, misBots, insigniasDe(servidor))).join('')
        : `<div class="card"><div class="empty"><div class="empty-icon">${icon('server')}</div><h4>Sin servidores configurados</h4><p>El administrador todavía no creó servidores. Los bots usan el servidor Free automático.</p></div></div>`}
    </div>

    <div class="card" style="margin-top:16px"><div class="card-body">
      <div class="flex" style="align-items:center;gap:10px;flex-wrap:wrap">
        <div class="row-icon accent">${icon('info')}</div>
        <div class="grow">
          <div style="font-weight:700">¿Cómo se elige el servidor?</div>
          <div class="tiny muted">Al vincular un bot eliges el servidor. Si no eliges ninguno, el panel lo asigna automáticamente al servidor Free compartido. Para mover un bot a un servidor Premium necesitas Premium activo (se gana mirando anuncios).</div>
        </div>
        <a class="btn btn-secondary btn-sm" href="#/link">${icon('link')} Vincular bot</a>
      </div>
    </div></div>
  `)
}
