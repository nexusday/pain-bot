/* Pain Panel — módulo pages-servers
 * Vista pública de servidores (carriles) donde se ejecutan los sub-bots.
 * Además de nombre, descripción y tier, muestra el rendimiento en vivo de
 * cada servidor: latencia p99, CPU, uptime, 428 y bots conectados. Los datos
 * se refrescan cada 3 s sin recargar la página ni volver a pedir el HTML.
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
  state,
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

const COLORES_RANKING = ['#f5c542', '#cbd5e1', '#d08a5a']
const INTERVALO_VIVO_MS = 3_000
// Último rendimiento conocido por servidor. Si un carril saturado tarda en
// publicar, la tarjeta conserva el anillo y lo marca "sin datos recientes"
// en vez de hacerlo desaparecer de golpe. Se descarta tras 5 min sin muestra.
const RETENCION_RENDIMIENTO_MS = 5 * 60_000
const ultimoRendimiento = new Map()

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

function claveServidor(servidor) {
  if (servidor.auto || servidor.id === null || servidor.id === undefined) return 'auto'
  return String(servidor.id)
}

function colorDeScore(score) {
  if (score >= 85) return '#22c55e'
  if (score >= 65) return '#06b6d4'
  if (score >= 45) return '#f59e0b'
  return '#ef4444'
}

function estadoLegible(perf) {
  const label = String(perf?.label || '')
  const speed = String(perf?.speed || '')
  if (!speed) return label
  // Evita el redundante "Lenta · Lento"; para el resto, salud + velocidad.
  if (label.toLowerCase() === 'lenta' && speed.toLowerCase() === 'lento') return label
  return `${label} · ${speed}`
}

function anilloRendimiento(perf) {
  if (!perf) return ''
  const score = Math.max(0, Math.min(100, Math.round(Number(perf.score) || 0)))
  const arco = Math.max(3, score)
  const color = colorDeScore(score)
  const caidas = Number(perf.desconexiones428) || 0
  const p99 = Math.round(Number(perf.p99Ms) || 0)
  const cpu = Math.round(Number(perf.cpuPercent) || 0)
  const conectados = Number(perf.connected) || 0
  const total = Number(perf.total) || 0
  const carriles = Number(perf.lanes) || 0
  return `<div class="pain-perf${perf.stale ? ' is-stale' : ''}" style="--pain-perf-color:${color}">
    <div class="pain-perf-ring" title="Salud del servidor: combina latencia, CPU y bots conectados.">
      <svg viewBox="0 0 42 42" width="62" height="62" class="pain-perf-svg">
        <circle class="pain-perf-track" cx="21" cy="21" r="18" fill="none" stroke="rgba(148,163,184,.18)" stroke-width="4"/>
        <circle class="pain-perf-value" cx="21" cy="21" r="18" fill="none" stroke="currentColor" stroke-width="4" pathLength="100" stroke-dasharray="${arco} 100" stroke-linecap="round"/>
      </svg>
      <div class="pain-perf-score">${score}</div>
    </div>
    <div class="pain-perf-copy">
      <div class="pain-perf-title">
        <span class="pain-live-dot" style="background:${color};box-shadow:0 0 0 3px ${color}26"></span>
        <span class="pain-perf-state">${h(estadoLegible(perf))}</span>
        <span class="pain-perf-stale">Sin datos recientes</span>
      </div>
      <div class="pain-perf-metrics">
        <span class="pain-metric" title="Latencia del 1% más lento en los últimos 15 s.">
          ${icon('clock')}
          <span class="pain-metric-body"><span class="pain-metric-label">Latencia p99</span><b class="pain-metric-value pain-perf-p99">${p99} ms</b></span>
        </span>
        <span class="pain-metric" title="CPU del carril más cargado.">
          ${icon('cpu')}
          <span class="pain-metric-body"><span class="pain-metric-label">CPU</span><b class="pain-metric-value pain-perf-cpu">${cpu}%</b></span>
        </span>
        <span class="pain-metric" title="Sesiones conectadas de las asignadas.">
          ${icon('wifi')}
          <span class="pain-metric-body"><span class="pain-metric-label">Conectados</span><b class="pain-metric-value pain-perf-connected">${conectados} de ${total}</b></span>
        </span>
        <span class="pain-metric" title="Procesos que atienden este servidor.">
          ${icon('server')}
          <span class="pain-metric-body"><span class="pain-metric-label">Carriles</span><b class="pain-metric-value pain-perf-lanes">${carriles}</b></span>
        </span>
      </div>
      <div class="pain-perf-footer">
        <span class="pain-foot-item">${icon('clock')} Tiempo activo: <b class="pain-perf-uptime">${duracionCorta(perf.uptimeSegundos)}</b></span>
        <span class="pain-foot-item pain-perf-428" style="color:${caidas > 0 ? '#f0cd7d' : 'inherit'}">${icon('alert')} Caídas 428: <b>${caidas}</b></span>
        <span class="pain-foot-item">${icon('refresh')} Reintentos: <b class="pain-perf-retries">${Number(perf.reintentos) || 0}</b></span>
      </div>
    </div>
  </div>`
}

function actualizarAnillo(slot, perf) {
  if (!perf) {
    if (slot.innerHTML) slot.innerHTML = ''
    return
  }
  const nodo = slot.querySelector('.pain-perf')
  if (!nodo) {
    slot.innerHTML = anilloRendimiento(perf)
    return
  }
  nodo.classList.toggle('is-stale', Boolean(perf.stale))
  const score = Math.max(0, Math.min(100, Math.round(Number(perf.score) || 0)))
  const arco = Math.max(3, score)
  const color = colorDeScore(score)
  nodo.style.setProperty('--pain-perf-color', color)
  const valor = nodo.querySelector('.pain-perf-value')
  if (valor) {
    valor.setAttribute('stroke-dasharray', `${arco} 100`)
    valor.setAttribute('stroke', color)
  }
  const escribir = (selector, texto) => {
    const elemento = nodo.querySelector(selector)
    if (elemento) elemento.textContent = String(texto)
  }
  escribir('.pain-perf-score', score)
  escribir('.pain-perf-state', estadoLegible(perf))
  escribir('.pain-perf-p99', `${Math.round(Number(perf.p99Ms) || 0)} ms`)
  escribir('.pain-perf-cpu', `${Math.round(Number(perf.cpuPercent) || 0)}%`)
  escribir('.pain-perf-connected', `${Number(perf.connected) || 0} de ${Number(perf.total) || 0}`)
  escribir('.pain-perf-lanes', Number(perf.lanes) || 0)
  escribir('.pain-perf-uptime', duracionCorta(perf.uptimeSegundos))
  escribir('.pain-perf-retries', Number(perf.reintentos) || 0)
  const punto = nodo.querySelector('.pain-live-dot')
  if (punto) {
    punto.style.background = color
    punto.style.boxShadow = `0 0 0 3px ${color}26`
  }
  const caidas = Number(perf.desconexiones428) || 0
  const caidasEl = nodo.querySelector('.pain-perf-428')
  if (caidasEl) {
    const valorCaidas = caidasEl.querySelector('b')
    if (valorCaidas) valorCaidas.textContent = String(caidas)
    caidasEl.style.color = caidas > 0 ? '#f0cd7d' : 'inherit'
  }
}

function servidorDeBot(servidores, serverId) {
  if (serverId === null || serverId === undefined) {
    return servidores.find((s) => s.auto) || null
  }
  return servidores.find((s) => Number(s.id) === Number(serverId)) || null
}

function resumenRed(servidores) {
  const con = servidores.filter((servidor) => servidor.performance)
  const saludMedia = con.length
    ? Math.round(con.reduce((total, servidor) => total + servidor.performance.score, 0) / con.length)
    : null
  const masRapido = con.length
    ? [...con].sort((a, b) => a.performance.p99Ms - b.performance.p99Ms || b.performance.score - a.performance.score)[0]
    : null
  const masCargado = con.length
    ? [...con].sort((a, b) => b.performance.p99Ms - a.performance.p99Ms)[0]
    : null
  return { con, saludMedia, masRapido, masCargado }
}

function tonoSalud(salud) {
  if (salud === null || salud === undefined) return ''
  return salud >= 85 ? 'green' : salud >= 65 ? 'cyan' : 'amber'
}

function claseSalud(salud) {
  return salud >= 85 ? 'success' : salud >= 65 ? 'info' : 'warn'
}

function rankingHTML(resumen) {
  if (resumen.con.length < 2) return ''
  const ranking = [...resumen.con]
    .sort((a, b) => b.performance.score - a.performance.score || a.performance.p99Ms - b.performance.p99Ms)
    .slice(0, 3)
  return `<div class="pain-rank-list">
    ${ranking.map((servidor, indice) => {
      const color = COLORES_RANKING[indice]
      return `<div class="pain-rank" title="Puesto ${indice + 1} por salud del servidor">
        <span class="pain-rank-icon" style="background:${color}1f;color:${color}">${indice === 0 ? icon('trophy') : `<b style="font-size:11px">${indice + 1}</b>`}</span>
        <div class="pain-rank-main">
          <div class="pain-rank-name">${h(servidor.name)}</div>
          <div class="pain-rank-meta tiny muted">Salud <b>${servidor.performance.score}</b> · p99 <b>${Math.round(Number(servidor.performance.p99Ms) || 0)} ms</b></div>
        </div>
      </div>`
    }).join('')}
  </div>`
}

function textoResumen(resumen) {
  if (resumen.saludMedia === null) return 'Recopilando métricas de los carriles…'
  const rapido = resumen.masRapido
  const cargado = resumen.masCargado
  return `<div>Salud media de los servidores activos: <b>${resumen.saludMedia}/100</b>.</div>
    <div style="margin-top:2px">Más rápido: <b>${h(rapido?.name || '—')}</b> · ${Math.round(Number(rapido?.performance?.p99Ms) || 0)} ms. Más cargado: <b>${h(cargado?.name || '—')}</b> · ${Math.round(Number(cargado?.performance?.p99Ms) || 0)} ms.</div>`
}

function insigniasDeServidor(servidor, resumen) {
  if (!servidor.performance || resumen.con.length < 2) return []
  const insignias = []
  if (resumen.masRapido && claveServidor(servidor) === claveServidor(resumen.masRapido)) {
    insignias.push({ label: 'Más rápido', tono: 'success', icono: 'zap', title: 'Menor latencia p99 de la red ahora mismo.' })
  }
  if (resumen.masCargado && claveServidor(servidor) === claveServidor(resumen.masCargado) && servidor.performance.score < 65) {
    insignias.push({ label: 'Más carga', tono: 'warn', icono: 'cpu', title: 'Es el servidor con mayor latencia en este momento.' })
  }
  return insignias
}

function renderInsignia(insignia) {
  return `<span class="badge ${insignia.tono}" title="${h(insignia.title || '')}">${icon(insignia.icono)}${h(insignia.label)}</span>`
}

function tarjetaServidor(servidor, misBots, insignias = []) {
  const clave = claveServidor(servidor)
  const badges = insignias.map(renderInsignia).join('')
  const botsAqui = misBots.filter((bot) => {
    if (servidor.auto) return bot.serverId === null || bot.serverId === undefined
    return Number(bot.serverId) === Number(servidor.id)
  })
  const ocupacion = servidor.maxSessions
    ? Math.min(100, Math.round((servidor.botCount / servidor.maxSessions) * 100))
    : null
  const tonoIcono = servidor.tier === 'premium' ? 'violet' : servidor.tier === 'vip' ? 'amber' : 'green'
  return `<div class="card" data-server-card="${clave}" style="height:100%">
    <div class="card-head pain-server-head">
      <div class="cell-main">
        <div class="row-icon ${tonoIcono}">${icon('server')}</div>
        <div class="grow">
          <div class="cell-title">${h(servidor.name)}</div>
          <div class="cell-sub">${h(servidor.dbMode === 'isolated' ? 'DB aislada' : 'DB compartida')}${servidor.auto ? ' · asignación automática' : ''}</div>
        </div>
      </div>
      <div class="pain-server-badges">
        <span class="pain-perf-badges" data-perf-badges="${clave}">${badges}</span>
        ${insigniaTier(servidor.tier)}
      </div>
    </div>
    <div class="card-body">
      <p class="muted" style="margin:0 0 12px;line-height:1.5">${h(servidor.description || 'Sin descripción.')}</p>
      <div class="pain-perf-slot" data-perf-slot="${clave}">${anilloRendimiento(servidor.performance)}</div>
      <div class="stats" style="grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:12px">
        <div style="border:1px solid var(--border,rgba(255,255,255,.08));border-radius:12px;padding:10px">
          <div class="tiny muted">Bots en este servidor</div>
          <div style="font-size:22px;font-weight:800" data-bot-count="${clave}">${servidor.botCount}</div>
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

function actualizarResumenRed(resumen) {
  const icono = document.getElementById('servers-network-icon')
  if (icono) icono.className = `row-icon ${tonoSalud(resumen.saludMedia)}`.trim()
  const score = document.getElementById('servers-network-score')
  if (score) {
    score.innerHTML = resumen.saludMedia === null
      ? ''
      : `<span class="badge ${claseSalud(resumen.saludMedia)}">${resumen.saludMedia}/100</span>`
  }
  const resumenEl = document.getElementById('servers-network-summary')
  if (resumenEl) {
    const html = textoResumen(resumen)
    if (resumenEl.innerHTML !== html) resumenEl.innerHTML = html
  }
  const ranking = document.getElementById('servers-network-ranking')
  if (ranking) {
    const html = rankingHTML(resumen)
    if (ranking.innerHTML !== html) ranking.innerHTML = html
  }
}

function actualizarTarjetas(performance, servidores, resumen) {
  const porClave = new Map(servidores.map((servidor) => [claveServidor(servidor), servidor]))
  const slots = document.querySelectorAll('[data-perf-slot]')
  for (const slot of slots) {
    const clave = slot.dataset.perfSlot
    actualizarAnillo(slot, performance[clave] || null)
    const badges = document.querySelector(`[data-perf-badges="${clave}"]`)
    if (badges) {
      const servidor = porClave.get(clave)
      const html = servidor ? insigniasDeServidor(servidor, resumen).map(renderInsignia).join('') : ''
      if (badges.innerHTML !== html) badges.innerHTML = html
    }
  }
}

function rendimientoEfectivo(performance) {
  const ahora = Date.now()
  const efectivo = {}
  for (const [clave, valor] of Object.entries(performance || {})) {
    if (!valor) continue
    ultimoRendimiento.set(clave, { datos: valor, en: ahora })
    efectivo[clave] = valor
  }
  for (const [clave, entrada] of ultimoRendimiento) {
    if (efectivo[clave]) continue
    if (ahora - entrada.en > RETENCION_RENDIMIENTO_MS) {
      ultimoRendimiento.delete(clave)
      continue
    }
    efectivo[clave] = { ...entrada.datos, stale: true }
  }
  return efectivo
}

function actualizarVistaEnVivo(datos) {
  const performance = rendimientoEfectivo(datos?.performance)
  const servidores = (Array.isArray(datos?.servers) ? datos.servers : [])
    .filter((servidor) => document.querySelector(`[data-perf-slot="${claveServidor(servidor)}"]`))
  const servidoresConPerf = servidores.map((servidor) => ({
    ...servidor,
    performance: performance[claveServidor(servidor)] || null,
  }))
  const resumen = resumenRed(servidoresConPerf)
  actualizarResumenRed(resumen)
  actualizarTarjetas(performance, servidoresConPerf, resumen)
  const actual = document.getElementById('servers-current-perf')
  if (actual) {
    const clave = actual.dataset.currentServer
    const perf = clave ? performance[clave] : null
    actual.innerHTML = perf
      ? `Salud ${perf.score}/100 · ${h(perf.speed)} · ${Math.round(Number(perf.p99Ms) || 0)} ms${perf.stale ? ' · sin datos recientes' : ''}`
      : ''
  }
  return true
}

let actualizandoServidores = false

async function actualizarServidoresEnVivo() {
  if (actualizandoServidores || document.hidden) return
  if (state.route.path !== '/servers') {
    detenerActualizacionServidores()
    return
  }
  actualizandoServidores = true
  try {
    const datos = await api.get('/api/servers/live')
    if (state.route.path !== '/servers') return
    actualizarVistaEnVivo(datos)
  } catch {
    // Un fallo puntual no detiene la vista: el siguiente tick reintenta.
  } finally {
    actualizandoServidores = false
  }
}

function detenerActualizacionServidores() {
  if (state.serversPoll) clearInterval(state.serversPoll)
  state.serversPoll = null
  if (state.serversVisibility) {
    document.removeEventListener('visibilitychange', state.serversVisibility)
  }
  state.serversVisibility = null
}

function iniciarActualizacionServidores() {
  detenerActualizacionServidores()
  state.serversVisibility = () => {
    if (!document.hidden) void actualizarServidoresEnVivo()
  }
  document.addEventListener('visibilitychange', state.serversVisibility)
  state.serversPoll = setInterval(() => { void actualizarServidoresEnVivo() }, INTERVALO_VIVO_MS)
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
  const resumen = resumenRed(servidores)
  ultimoRendimiento.clear()
  for (const servidor of servidores) {
    if (servidor.performance) {
      ultimoRendimiento.set(claveServidor(servidor), { datos: servidor.performance, en: Date.now() })
    }
  }

  content(`
    <style>
      @keyframes painPulse { 0%,100% { opacity: 1; transform: scale(1) } 50% { opacity: .35; transform: scale(.75) } }
      .pain-live-dot { display:inline-block; width:7px; height:7px; border-radius:50%; background:#22c55e; box-shadow:0 0 0 3px rgba(34,197,94,.15); animation: painPulse 2s ease-in-out infinite; flex:none; }
      .pain-perf-value { transition: stroke-dasharray .6s ease, stroke .3s ease; }
    </style>
    <div class="page-head">
      <div><h2>Servidores</h2><p>Los sub-bots se reparten entre servidores para mantenerse estables. Aquí ves dónde está cada uno y cómo rinde en vivo.</p></div>
      <div class="page-actions">
        <button class="btn btn-secondary" data-action="refresh">${icon('refresh')} Actualizar</button>
        <a class="btn btn-secondary" href="#/bots">${icon('bot')} Mis bots</a>
        <a class="btn btn-primary" href="#/premium">${icon('sparkles')} Premium</a>
      </div>
    </div>

    <div class="card" id="servers-network-card" style="margin-bottom:16px"><div class="card-body">
      <div class="pain-net-head">
        <div class="row-icon" id="servers-network-icon">${icon('activity')}</div>
        <div class="pain-net-main">
          <div style="font-weight:700;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            Estado de la red
            <span class="badge success"><span class="pain-live-dot"></span>En vivo</span>
            <span id="servers-network-score"></span>
          </div>
          <div class="tiny muted" id="servers-network-summary" style="margin-top:3px">Recopilando métricas de los carriles…</div>
        </div>
        <div class="pain-net-note tiny muted">Actualización automática cada 3 s. Se pausa cuando la pestaña está en segundo plano.</div>
      </div>
      <div id="servers-network-ranking"></div>
    </div></div>

    <div class="stats" style="margin-bottom:16px">
      <div class="card"><div class="card-body">
        <div class="tiny muted">Servidores activos</div>
        <div style="font-size:26px;font-weight:800" id="servers-active-count">${servidores.filter((s) => !s.auto).length}</div>
      </div></div>
      <div class="card"><div class="card-body">
        <div class="tiny muted">Bots conectados al panel</div>
        <div style="font-size:26px;font-weight:800" id="servers-total-live">${totalBots}</div>
      </div></div>
      <div class="card"><div class="card-body">
        <div class="tiny muted">Tu servidor actual</div>
        <div style="font-size:18px;font-weight:800">${h(miServidor?.name || 'Sin bot vinculado')}</div>
        <div class="tiny muted" id="servers-current-perf" data-current-server="${miServidor ? claveServidor(miServidor) : ''}" style="margin-top:3px">${miServidor?.performance ? `Salud ${miServidor.performance.score}/100 · ${h(miServidor.performance.speed)} · ${miServidor.performance.p99Ms} ms` : ''}</div>
      </div></div>
    </div>

    <div class="stack" style="display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(280px,1fr))">
      ${servidores.length
        ? servidores.map((servidor) => tarjetaServidor(servidor, misBots, insigniasDeServidor(servidor, resumen))).join('')
        : `<div class="card"><div class="empty"><div class="empty-icon">${icon('server')}</div><h4>Sin servidores configurados</h4><p>El administrador todavía no creó servidores. Los bots usan el servidor Free automático.</p></div></div>`}
    </div>

    <div class="card" style="margin-top:16px"><div class="card-body">
      <div class="flex" style="align-items:center;gap:10px;flex-wrap:wrap">
        <div class="row-icon accent">${icon('info')}</div>
        <div class="grow">
          <div style="font-weight:700">¿Cómo se elige el servidor?</div>
          <div class="tiny muted">Al vincular un bot eliges el servidor. Si no eliges ninguno, el panel lo asigna automáticamente al servidor Free compartido. Para mover un bot a un servidor Premium necesitas Premium activo (se gana mirando anuncios). El bot principal no es un subbot: tiene su propio carril privado y no aparece en esta lista.</div>
        </div>
        <a class="btn btn-secondary btn-sm" href="#/link">${icon('link')} Vincular bot</a>
      </div>
    </div></div>
  `)

  actualizarResumenRed(resumen)
  iniciarActualizacionServidores()
}
