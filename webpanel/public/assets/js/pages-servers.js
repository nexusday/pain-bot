/* Pain Panel — módulo pages-servers
 * Vista pública de servidores (carriles) donde se ejecutan los sub-bots.
 * No muestra recursos internos (CPU/RAM del host): solo nombre, descripción,
 * tier, cantidad de bots y cuál es el servidor de cada bot del usuario.
 */
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
  state,
} from './core.js'

const TIER_LABEL = {
  free: 'Free',
  premium: 'Premium',
  vip: 'VIP',
}

const TIER_TONE = {
  free: 'accent',
  premium: 'cyan',
  vip: 'amber',
}

function servidorDeBot(servidores, serverId) {
  if (serverId === null || serverId === undefined) {
    return servidores.find((s) => s.auto) || null
  }
  return servidores.find((s) => Number(s.id) === Number(serverId)) || null
}

function tarjetaServidor(servidor, misBots, esAdmin) {
  const botsAqui = misBots.filter((bot) => {
    if (servidor.auto) return bot.serverId === null || bot.serverId === undefined
    return Number(bot.serverId) === Number(servidor.id)
  })
  const ocupacion = servidor.maxSessions
    ? Math.min(100, Math.round((servidor.botCount / servidor.maxSessions) * 100))
    : null
  return `<div class="card" style="height:100%">
    <div class="card-head">
      <div class="cell-main">
        <div class="row-icon ${servidor.tier === 'premium' ? 'violet' : servidor.tier === 'vip' ? 'amber' : 'accent'}">${icon('server')}</div>
        <div class="grow">
          <div class="cell-title">${h(servidor.name)}</div>
          <div class="cell-sub">${h(servidor.dbMode === 'isolated' ? 'DB aislada' : 'DB compartida')}${servidor.auto ? ' · asignación automática' : ''}</div>
        </div>
      </div>
      ${badge(TIER_LABEL[servidor.tier] || servidor.tier, TIER_TONE[servidor.tier] || 'neutral')}
    </div>
    <div class="card-body">
      <p class="muted" style="margin:0 0 12px;line-height:1.5">${h(servidor.description || 'Sin descripción.')}</p>
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
  const porServidor = new Map()
  for (const bot of misBots) {
    const clave = bot.serverId === null || bot.serverId === undefined ? 'auto' : String(bot.serverId)
    if (!porServidor.has(clave)) porServidor.set(clave, [])
    porServidor.get(clave).push(bot)
  }
  const totalBots = Number.isFinite(Number(datos.totalLive))
    ? Number(datos.totalLive)
    : servidores.reduce((total, servidor) => total + Number(servidor.botCount || 0), 0)
  const miServidor = misBots.length
    ? servidorDeBot(servidores, misBots[0].serverId)
    : null

  content(`
    <div class="page-head">
      <div><h2>Servidores</h2><p>Los sub-bots se reparten entre servidores para mantenerse estables. Aquí ves dónde está cada uno.</p></div>
      <div class="page-actions">
        <button class="btn btn-secondary" data-action="refresh">${icon('refresh')} Actualizar</button>
        <a class="btn btn-secondary" href="#/bots">${icon('bot')} Mis bots</a>
        <a class="btn btn-primary" href="#/premium">${icon('sparkles')} Premium</a>
      </div>
    </div>

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
      </div></div>
    </div>

    <div class="stack" style="display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(280px,1fr))">
      ${servidores.length
        ? servidores.map((servidor) => tarjetaServidor(servidor, misBots, Boolean(datos.isAdmin))).join('')
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
