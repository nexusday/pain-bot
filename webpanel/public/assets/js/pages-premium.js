/* Pain Panel — módulo pages-premium
 *
 * Sub-bot premium: el tiempo se gana mirando anuncios (Adsterra). El contador
 * se valida en el servidor; aquí solo se dibuja y se avisa al terminar.
 *
 * Reglas del banco:
 *  - Cada anuncio suma `adMinutes` (por defecto 60 min).
 *  - El banco tiene un tope (`maxHours`, 24 h): al llegar, el botón se bloquea.
 *  - Se vuelve a desbloquear al bajar de `unlockHours` (10 h).
 *  - Una vez abierto, permite recargar hasta alcanzar de nuevo `maxHours`.
 *  - Al caducar el premium, las personalizaciones dejan de aplicarse al
 *    instante pero siguen guardadas: vuelven solas al recuperar tiempo.
 */
import { api } from './api.js'
import {
  content,
  errorPage,
  fmtPhone,
  h,
  icon,
  loadingPage,
  openModal,
  setPage,
  showToast,
  state,
} from './core.js'

const ESTADO = {
  datos: null,
  bloqueador: false,
  anuncio: null,
  comprobandoAds: false,
  medidas: new Map(),
  poll: null,
  escucha: null,
}

const MS_HORA = 60 * 60 * 1000

function clavePromoPremium() {
  return `pain-premium-promo:${String(state.user?.id || state.user?.username || 'user')}`
}

export function premiumPromoHTML() {
  return `<aside class="premium-floating-promo" data-premium-promo hidden>
    <button class="premium-floating-promo-close" type="button" data-action="premium-promo-close" aria-label="Cerrar">${icon('x')}</button>
    <div class="premium-floating-promo-icon">${icon('sparkles')}</div>
    <div class="premium-floating-promo-content">
      <span class="premium-invite-label">SUB-BOT PREMIUM</span>
      <h3>Haz que tu bot destaque</h3>
      <p>Personaliza tu sub-bot con funciones reales y dale una identidad propia.</p>
      <div class="premium-floating-promo-perks"><span>${icon('check')} Menú y moneda propios</span><span>${icon('check')} Canal personalizado</span><span>${icon('check')} Comandos creados con IA</span></div>
      <a class="btn premium-invite-button" href="#/premium">${icon('sparkles')} Ver Premium gratis</a>
    </div>
  </aside>`
}

export function programarPromoPremium() {
  if (state.premiumPromoTimer) clearTimeout(state.premiumPromoTimer)
  const promo = state.config?.premiumPromo
  const tieneBotNormal = Array.isArray(state.bots) && state.bots.some((bot) => !bot.premium?.active)
  if (promo?.enabled === false || !tieneBotNormal) return
  const intervalo = Math.max(1, Number(promo?.intervalMinutes) || 30) * 60_000
  let ultimo = 0
  try { ultimo = Number(localStorage.getItem(clavePromoPremium()) || 0) || 0 } catch {}
  const espera = ultimo ? Math.max(0, ultimo + intervalo - Date.now()) : 5000
  state.premiumPromoTimer = setTimeout(() => {
    const tarjeta = document.querySelector('[data-premium-promo]')
    if (!tarjeta) return
    tarjeta.hidden = false
    try { localStorage.setItem(clavePromoPremium(), String(Date.now())) } catch {}
  }, espera)
  state.premiumPromoTimer.unref?.()
}

function restanteTexto(ms) {
  if (!(ms > 0)) return 'Sin premium'
  const totalMinutos = Math.ceil(ms / 60_000)
  const horas = Math.floor(totalMinutos / 60)
  const minutos = totalMinutos % 60
  if (horas && minutos) return `${horas} h ${minutos} min`
  if (horas) return `${horas} h`
  return `${minutos} min`
}

function caducidadTexto(bot) {
  if (bot.infinite) return 'Sin caducidad · Premium ilimitado'
  const fecha = Number(bot.expiresAt)
  return Number.isFinite(fecha) && fecha > 0
    ? `Caduca el ${new Date(fecha).toLocaleString('es')}`
    : 'Sin fecha de caducidad disponible'
}

function comandoHTML(comando = {}) {
  const source = comando.source || (comando.response ? `const response = ${JSON.stringify(comando.response)}\nhandler.command = [${JSON.stringify(comando.name || '')}]\nexport default handler` : '')
  return `<details class="premium-command-item" data-command-card><summary>${icon('chevronRight')}<span class="premium-command-name">/${h(comando.name || 'sin-nombre')}</span><span class="badge success">${icon('check')} Guardado</span></summary><div class="premium-command-card card"><label class="label">Nombre del comando</label><input class="input mono" data-command-name value="${h(comando.name || '')}" placeholder="hola" /><label class="label">Instrucción para la IA</label><textarea class="input" data-command-prompt rows="3" placeholder="Qué debe hacer el comando…">${h(comando.prompt || '')}</textarea><input type="hidden" data-command-response value="${h(comando.response || '')}" /><details class="premium-source-details"><summary>${icon('chevronRight')} Mostrar / editar código</summary><textarea class="premium-source-editor" data-command-source spellcheck="false">${h(source)}</textarea></details><div class="premium-command-preview"><span class="chat-bubble muted">Plugin guardado. Puedes editar su código y volver a guardarlo.</span></div><div data-command-status class="premium-command-status"></div><div class="flex gap-8"><button type="button" class="btn btn-secondary btn-sm" data-action="premium-command-generate">${icon('refresh')} Regenerar plugin</button><button type="button" class="btn btn-ghost btn-sm" data-action="premium-command-delete">${icon('trash')} Quitar</button></div></div></details>`
}

function formularioEdiciones(bot, plantilla = '') {
  const ediciones = bot.edits || {}
  const menu = ediciones.menu || {}
  const canal = ediciones.canal || {}
  // Mientras el usuario no haya guardado una elección, se muestra el canal
  // oficial como valor inicial. Si guardó ambos campos vacíos, se respetan
  // vacíos para que pueda desactivar el canal.
  const canalInicial = bot.canalConfigurado
    ? canal
    : { jid: 'https://whatsapp.com/channel/0029Vb7Y87RLikgEutyMId1h', nombre: 'Nexo Community' }
  // Si el usuario ya guardó su menú se le suelta el suyo; si no, el menú
  // por defecto con {tokens} para que edite el texto real.
  const textoMenu = menu.texto || plantilla
  const tokens = ['nombre', 'usuario', 'idioma', 'rol', 'ping', 'uptime', 'comandos', 'memoria', 'panel', 'prefix']
  const comandos = Array.isArray(ediciones.comandos) ? ediciones.comandos : []
  return `<details class="premium-editor" ${bot.active ? '' : 'data-inactivo="1"'}>
    <summary class="premium-editor-summary">${icon('settings')} <b>Editar personalización Premium</b><span class="premium-editor-open-hint">Haz clic para abrir</span>
      ${bot.active
        ? '<span class="badge success"><span class="dot"></span>Aplicada</span>'
        : '<span class="badge neutral">Guardada · se aplica con premium</span>'}
    </summary>
    <form class="premium-form" data-phone="${h(bot.phone)}">
      <div class="form-error">${icon('alert')}<span></span></div>
      <div class="form-success">${icon('check')}<span></span></div>
      <div class="field"><div class="premium-command-heading"><div><label class="label">Plugins Premium de este sub-bot</label><div class="hint">La IA genera un plugin JavaScript individual. Después se guarda y se ejecuta con el prefijo real.</div></div><button type="button" class="btn btn-secondary btn-sm" data-action="premium-command-add">${icon('plus')} Agregar comando</button></div><div class="premium-command-list" data-command-list>${comandos.map(comandoHTML).join('')}</div><button type="button" class="btn btn-primary btn-sm" data-action="premium-command-save">${icon('check')} Guardar plugins</button></div>
      <div class="field">
        <label class="label" for="pm-moneda-${h(bot.phone)}">Moneda del bot</label>
        <div class="input-icon">${icon('zap')}<input id="pm-moneda-${h(bot.phone)}" class="input mono" name="moneda" maxlength="8" placeholder="USD" value="${h(ediciones.moneda || '')}" /></div>
        <div class="hint">Se usa en el menú, la economía, los juegos y el banco de <b>este</b> sub-bot. Los demás no cambian.</div>
      </div>
      <div class="field">
        <label class="label" for="pm-menu-${h(bot.phone)}">Texto del menú</label>
        <textarea id="pm-menu-${h(bot.phone)}" name="menuTexto" class="input textarea-menu" rows="18" spellcheck="false" placeholder="Escribe aquí tu menú…">${h(textoMenu)}</textarea>
        <div class="flex gap-8" style="margin-top:8px;flex-wrap:wrap">
          <button type="button" class="btn btn-ghost btn-sm" data-action="premium-menu-reset">${icon('rotate')} Menú por defecto</button>
        </div>
        <div class="hint">Es el texto completo que verá tu grupo al escribir el menú (salto de línea, negritas <span class="mono">*así*</span> y enlaces tal cual). Déjalo <b>vacío</b> y guarda para volver al menú original del bot.</div>
        <div class="hint">Valores que se rellenan solos: ${tokens.map((token) => `<code>{${token}}</code>`).join(' ')}</div>
      </div>
      <div class="field">
        <label class="label">Comandos ocultos de este sub-bot</label>
        <input class="input mono" name="comandosOcultos" maxlength="2000" placeholder="code, play, sticker" value="${h((ediciones.comandosOcultos || []).join(', '))}" />
        <div class="hint">Escribe los comandos sin prefijo, separados por comas. Se ocultan del menú y de las sugerencias solo en este sub-bot. Puedes quitarlos de aquí para volver a mostrarlos.</div>
      </div>
      <div class="grid-2-tight">
        <div class="field">
          <label class="label">Canal (ID o link)</label>
          <input class="input mono" name="canalJid" maxlength="120" placeholder="1203…@newsletter" value="${h(canalInicial.jid || '')}" />
        </div>
        <div class="field">
          <label class="label">Nombre del canal</label>
          <input class="input" name="canalNombre" maxlength="40" placeholder="Nexo Community" value="${h(canalInicial.nombre || '')}" />
        </div>
      </div>
      <button class="btn btn-primary" type="submit">${icon('check')} Guardar personalización</button>
      <div class="hint">Se guarda siempre. Si tu premium caduca, deja de mostrarse y vuelve solo al recuperar tiempo.</div>
    </form>
  </details>`
}

/**
 * Selector de servidor dentro de la tarjeta del bot.
 * - Free: solo puede quedarse en el servidor compartido.
 * - Premium: puede elegir entre los servidores activos (free/premium).
 * - Si el servidor elegido tiene DB aislada, se ofrecen exportar/importar.
 */
function seccionServidorPremium(bot, servidores = [], premium = false) {
  if (!servidores.length) {
    return `<div class="notice" style="margin-top:12px">${icon('server')}<div><b>Servidores dedicados:</b> el administrador todavía no creó ninguno. Cuando lo haga, aparecerá aquí para que elijas dónde ejecutar tu bot.</div></div>`
  }
  const actual = servidores.find((s) => Number(s.id) === Number(bot.serverId)) || null
  const opciones = servidores.map((s) => {
    const etiqueta = `${s.name} · ${String(s.tier || 'free').toUpperCase()}${s.dbMode === 'isolated' ? ' · DB aislada' : ''}`
    return `<option value="${s.id}" ${Number(s.id) === Number(bot.serverId) ? 'selected' : ''}>${h(etiqueta)}</option>`
  }).join('')
  const aislada = actual?.dbMode === 'isolated'
  return `<div class="premium-server" style="margin-top:14px;border-top:1px solid var(--border,rgba(255,255,255,.08));padding-top:14px">
    <div class="flex" style="align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
      <div>
        <div style="font-weight:700">${icon('server')} Servidor del bot</div>
        <div class="tiny muted">${actual ? `Actualmente en <b>${h(actual.name)}</b> (${h(String(actual.tier || 'free').toUpperCase())})` : 'Servidor automático (Free compartido)'}</div>
      </div>
      ${premium
        ? ''
        : '<span class="badge neutral">Premium requerido para cambiar</span>'}
    </div>
    <div class="flex gap-8" style="margin-top:10px;flex-wrap:wrap">
      <select class="input" data-premium-server-select="${h(bot.phone)}" ${premium ? '' : 'disabled'} style="max-width:320px">${opciones}</select>
      <button class="btn btn-secondary btn-sm" data-action="premium-server-change" data-phone="${h(bot.phone)}" ${premium ? '' : 'disabled'}>${icon('refresh')} Cambiar servidor</button>
    </div>
    ${aislada
      ? `<div class="flex gap-8" style="margin-top:10px;flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm" data-action="premium-server-export" data-phone="${h(bot.phone)}" data-server="${actual.id}">${icon('download')} Exportar DB aislada</button>
          <label class="btn btn-ghost btn-sm" style="cursor:pointer">${icon('upload')} Importar DB
            <input type="file" accept=".sqlite,.db,.painbackup" data-premium-server-import="${h(bot.phone)}" data-server="${actual.id}" style="display:none" />
          </label>
        </div>
        <div class="hint" style="margin-top:6px">${icon('shieldCheck')} La DB aislada guarda solo los datos de este servidor. Expórtala antes de cambiar o borrar el servidor.</div>`
      : ''}
  </div>`
}

function tarjetaBot(bot, reglas, plantilla, servidores = []) {
  const restante = Number(bot.remainingMs || 0)
  const porcentaje = bot.infinite ? 100 : Math.min(100, Math.round((restante / (reglas.maxHours * MS_HORA)) * 100))
  const premium = Boolean(bot.active)
  const nombre = bot.label || fmtPhone(bot.phone)
  const detalle = bot.label ? `${fmtPhone(bot.phone)} · ` : ''
  return `<div class="card premium-card" data-premium-card="${h(bot.phone)}">
    <div class="card-head">
      <div class="cell-main">
        <div class="row-icon ${premium ? 'violet' : 'muted'}">${icon(premium ? 'sparkles' : 'bot')}</div>
        <div class="grow">
          <div class="cell-title">${h(nombre)}</div>
          <div class="cell-sub">${h(detalle)}${premium ? 'SUBBOT PREMIUM' : 'SUBBOT'}</div>
        </div>
      </div>
      ${premium
        ? '<span class="badge accent"><span class="dot"></span>Premium</span>'
        : '<span class="badge neutral">Normal</span>'}
    </div>
    <div class="card-body">
      <div class="premium-time">
         <div><b>${premium ? (bot.infinite ? 'Ilimitado' : restanteTexto(restante)) : 'Sin premium activo'}</b><span>${premium ? caducidadTexto(bot) : 'Mira un anuncio para activarlo'}</span></div>
        <div class="progress premium-progress"><span style="width:${porcentaje}%"></span></div>
      </div>
      ${bot.locked
        ? `<div class="notice warn">${icon('alert')}<div>Este bot alcanzó el máximo de <b>${reglas.maxHours} h</b>. El botón se reabre cuando le queden <b>${reglas.unlockHours} h o menos</b>; después podrás volver a llenarlo hasta <b>${reglas.maxHours} h</b>.</div></div>`
        : ''}
      <div class="premium-actions">
        <button class="btn btn-primary" data-action="premium-ad" data-phone="${h(bot.phone)}"
          ${bot.locked || !bot.canAdd ? 'disabled' : ''}>
          ${icon('sparkles')} Ver anuncio y ganar ${reglas.adMinutes} min
        </button>
        <span class="tiny muted" id="premium-timer-${h(bot.phone)}" data-seconds="${reglas.adSeconds}">Duración del anuncio: ${reglas.adSeconds} s</span>
        ${bot.canGrantInfinite ? (bot.infinite
          ? `<span class="badge accent">∞ Premium infinito activo</span>`
          : `<button class="btn btn-secondary" data-action="premium-infinite" data-phone="${h(bot.phone)}">${icon('sparkles')} Activar Premium infinito</button>`)
           : ''}
        ${bot.canGrantDuration && !bot.infinite ? `<span class="premium-duration-inline"><input class="input input-sm premium-days-value" type="number" min="1" max="3650" value="30" aria-label="Días Premium" /><button class="btn btn-secondary" data-action="premium-duration" data-phone="${h(bot.phone)}">${icon('clock')} Activar días</button></span>` : ''}
       </div>
      ${seccionServidorPremium(bot, servidores, premium)}
      ${formularioEdiciones(bot, plantilla)}
    </div>
  </div>`
}

export async function cambiarServidorPremium(boton) {
  const phone = boton.dataset.phone
  const selector = document.querySelector(`[data-premium-server-select="${CSS.escape(phone)}"]`)
  const serverId = selector?.value ? Number(selector.value) : null
  if (!phone || !serverId) return
  boton.disabled = true
  try {
    const data = await api.post(`/api/bots/${encodeURIComponent(phone)}/server`, { serverId })
    showToast(data.hot
      ? 'Servidor cambiado. El bot se está moviendo en caliente.'
      : 'Servidor guardado. Se aplicará al reiniciar el supervisor.', 'success')
    await renderPremium()
  } catch (error) {
    showToast(error.message || 'No se pudo cambiar de servidor.', 'error')
    boton.disabled = false
  }
}

export async function exportarDbServidor(boton) {
  const serverId = Number(boton.dataset.server)
  if (!serverId) return
  boton.disabled = true
  try {
    const data = await api.get(`/api/admin/servers/${serverId}/export`)
    const binario = Uint8Array.from(atob(data.data), (c) => c.charCodeAt(0))
    const blob = new Blob([binario], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = data.filename || `pain-server-${serverId}.sqlite`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    showToast('DB exportada.', 'success')
  } catch (error) {
    showToast(error.message || 'No se pudo exportar la DB.', 'error')
  } finally {
    boton.disabled = false
  }
}

export async function importarDbServidor(input) {
  const serverId = Number(input.dataset.server)
  const archivo = input.files?.[0]
  if (!serverId || !archivo) return
  if (archivo.size > 64 * 1024 * 1024) {
    showToast('El archivo supera los 64 MB. Exporta una DB más pequeña.', 'error')
    input.value = ''
    return
  }
  const confirmado = window.confirm('Se reemplazará la DB aislada de este servidor y se reiniciarán sus carriles. ¿Continuar?')
  if (!confirmado) { input.value = ''; return }
  try {
    const base64 = await new Promise((resolve, reject) => {
      const lector = new FileReader()
      lector.onload = () => resolve(String(lector.result || '').split(',')[1] || '')
      lector.onerror = () => reject(new Error('No se pudo leer el archivo.'))
      lector.readAsDataURL(archivo)
    })
    await api.post(`/api/admin/servers/${serverId}/import`, { data: base64 })
    showToast('DB importada. Los carriles del servidor se están reiniciando.', 'success')
  } catch (error) {
    showToast(error.message || 'No se pudo importar la DB.', 'error')
  } finally {
    input.value = ''
  }
}

export async function activarPremiumInfinito(boton) {
  try {
    boton.disabled = true
    await api.post('/api/premium/infinite', { phone: boton.dataset.phone })
    showToast('Premium infinito activado para este sub-bot.', 'success')
    await renderPremium()
  } catch (error) {
    boton.disabled = false
    showToast(error.message || 'No se pudo activar Premium infinito.', 'error')
  }
}

export async function activarPremiumDias(boton) {
  const card = boton.closest('[data-premium-card]')
  const dias = Number(card?.querySelector('.premium-days-value')?.value || 30)
  try {
    boton.disabled = true
    await api.post('/api/premium/duration', { phone: boton.dataset.phone, days: dias })
    showToast(`Premium activado por ${dias} día(s).`, 'success')
    await renderPremium()
  } catch (error) {
    boton.disabled = false
    showToast(error.message || 'No se pudo activar Premium por días.', 'error')
  }
}

// Orden de las zonas en el tablero: primero el banner corto (en su propia
// fila) y debajo, en dos columnas, el native y el vertical.
const ORDEN_ANUNCIOS = [
  ['native', 'Native'],
  ['small', '320 × 50'],
  ['wide', '468 × 60'],
  ['leaderboard', '728 × 90'],
  ['square', '300 × 250'],
  ['medium', '160 × 300'],
  ['tall', '160 × 600'],
]

function marcoAnuncio(clave, etiqueta, conMarca = false) {
  return `<div class="premium-ad-slot premium-ad-${clave}">
    <iframe title="Anuncio ${etiqueta}"${conMarca ? ` data-ad-slot="${clave}"` : ''} src="/api/premium/frame?b=${clave}" referrerpolicy="no-referrer-when-downgrade" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" loading="eager"></iframe>
  </div>`
}

function bloqueAnuncios(datos) {
  const banners = datos.ads?.banners || {}
  // Solo se muestran formatos cómodos en el flujo principal. Los formatos
  // altos no se apilan: el vertical va a la derecha en escritorio.
  const disponibles = [] // Los banners se distribuyen en cabecera y pie, no en una galería.
  if (!disponibles.length) return ''
  const horizontales = disponibles.filter(([clave]) => ['small', 'leaderboard', 'native', 'wide', 'square'].includes(clave))
  const laterales = disponibles.filter(([clave]) => ['medium', 'tall'].includes(clave))
  return `<div class="premium-ad-area" aria-label="Anuncios">
    <div class="premium-ad-main-flow">
      ${horizontales.map(([clave, etiqueta]) => marcoAnuncio(clave, etiqueta, true)).join('')}
    </div>
    ${laterales.length ? `<aside class="premium-ad-side">${laterales.map(([clave, etiqueta]) => marcoAnuncio(clave, etiqueta, true)).join('')}</aside>` : ''}
    <div class="premium-ad-status" id="premium-adblock-wall" ${ESTADO.bloqueador ? '' : 'hidden'}>
      ${icon('alert')}<span><b>No pudimos mostrar el anuncio.</b> Permite los anuncios para este sitio y recarga la página.</span>
    </div>
  </div>`
}

/**
 * Tablero de anuncios para otras páginas (Dashboard y Mis bots). Usa las zonas
 * que el administrador configuró; si no hay ninguna, no pinta nada.
 */
function prepararZonaAnuncio(selector, fallback = false) {
  setTimeout(() => {
    if (medirBloqueador()) mostrarAvisoBloqueador()
    const zona = document.querySelector(selector)
    if (!zona || zona.dataset.observando) return
    zona.dataset.observando = '1'
    let marco = zona.querySelector('iframe')
    let temporizador
    const finalizar = () => {
      clearTimeout(temporizador)
      window.removeEventListener('message', recibir)
    }
    const fallo = () => {
      if (!zona.isConnected) return finalizar()
      if (fallback && state.config?.adsBanners?.small && anchoDisponibleAnuncios() >= 320) {
        fallback = false
        zona.innerHTML = marcoAnuncio('small', '320 × 50')
        marco = zona.querySelector('iframe')
        // El pequeño pasa a la cabecera: no repetirlo al final.
        document.querySelector('.ads-inline')?.remove()
        temporizador = setTimeout(fallo, 10000)
      } else {
        zona.remove()
        finalizar()
      }
    }
    const recibir = (evento) => {
      if (evento.source !== marco?.contentWindow || evento.data?.pain !== 'ad') return
      if (!zona.isConnected) return finalizar()
      if (evento.data.reason === 'script_error') mostrarAvisoBloqueador('script_error')
      if (evento.data.ok === true) {
        zona.classList.add('ad-ready')
        finalizar()
      } else {
        clearTimeout(temporizador)
        fallo()
      }
    }
    window.addEventListener('message', recibir)
    temporizador = setTimeout(fallo, 10000)
  }, 0)
}

function paginaAnuncios() {
  return window.location.hash.split('/')[1]?.split('?')[0] || 'dashboard'
}

function anchoDisponibleAnuncios() {
  const contenido = document.querySelector('.content')
  if (contenido?.clientWidth > 0) {
    const estilo = window.getComputedStyle(contenido)
    return Math.max(0, contenido.clientWidth - (parseFloat(estilo.paddingLeft) || 0) - (parseFloat(estilo.paddingRight) || 0))
  }
  // Antes de montar el contenido, respetar los mismos márgenes del CSS.
  const principal = document.querySelector('main')?.clientWidth || window.innerWidth
  return Math.max(0, principal - (window.innerWidth <= 900 ? 32 : 48))
}

export function anunciosCabeceraHTML(pagina = paginaAnuncios()) {
  if (state.config?.adsPlacements?.[pagina]?.header === false) return ''
  const banners = state.config?.adsBanners || {}
  const ancho = anchoDisponibleAnuncios()
  const formato = ancho >= 728 && banners.leaderboard ? ['leaderboard', '728 × 90']
    : ancho >= 468 && banners.wide ? ['wide', '468 × 60']
      : ancho >= 320 && banners.small ? ['small', '320 × 50'] : null
  if (!formato) return ''
  prepararZonaAnuncio('.ads-header', formato[0] !== 'small')
  return `<div class="ads-header ad-pending" aria-label="Anuncio superior">
    ${marcoAnuncio(...formato)}
  </div>`
}

export function anunciosPieHTML(pagina = paginaAnuncios()) {
  if (state.config?.adsPlacements?.[pagina]?.footer === false) return ''
  const banners = state.config?.adsBanners || {}
  // En Dashboard/Mis bots no mostramos los formatos altos: reservarían hasta
  // 300px aunque el proveedor tarde o bloquee la carga. Los formatos grandes
  // quedan disponibles en la página Premium, donde el usuario los solicita.
  const cabecera = anunciosCabeceraHTML(pagina)
  const disponibles = banners.small && !cabecera.includes('premium-ad-small') && anchoDisponibleAnuncios() >= 320
    ? [['small', '320 × 50']] : []
  if (!disponibles.length) return ''
  prepararZonaAnuncio('.ads-inline')
  return `<div class="ads-inline ad-pending" aria-label="Anuncio">
    ${disponibles.map(([clave, etiqueta]) => marcoAnuncio('small', etiqueta)).join('')}
  </div>`
}

/**
 * Guía visual del flujo Free → Premium → Servidor dedicado.
 * Se muestra arriba de la página para que el usuario entienda el orden.
 */
function guiaPremiumHTML(bots, datos, servidores) {
  const tieneBots = bots.length > 0
  const tienePremium = bots.some((bot) => bot.active)
  const tieneServidor = Boolean(servidores?.length)
  const pasos = [
    {
      titulo: 'Empieza en Free',
      desc: 'Vincula tu número. Se ejecuta en el servidor Free compartido, sin costo.',
      listo: tieneBots,
      icono: 'bot',
    },
    {
      titulo: 'Mira un anuncio',
      desc: `Cada anuncio suma ${datos.rules?.adMinutes ?? '?'} min de Premium. Permanece ${datos.rules?.adSeconds ?? '?'} s en el anuncio.`,
      listo: tienePremium,
      icono: 'sparkles',
    },
    {
      titulo: 'Activa el Premium',
      desc: 'Con Premium activo el bot puede salir del servidor Free y usar recursos dedicados.',
      listo: tienePremium,
      icono: 'shieldCheck',
    },
    {
      titulo: 'Elige servidor Premium',
      desc: tieneServidor
        ? 'Elige abajo el servidor dedicado. El cambio se aplica en caliente, sin reiniciar los demás bots.'
        : 'El administrador todavía no creó servidores Premium. Vuelve más tarde.',
      listo: false,
      icono: 'server',
    },
  ]
  return `<div class="card premium-guide" style="margin-bottom:18px">
    <div class="card-head">
      <div><h3>Cómo funciona el Premium</h3><p>Free primero, luego anuncios, luego servidor dedicado. No pierdes nada al cambiar.</p></div>
    </div>
    <div class="card-body">
      <div style="display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(210px,1fr))">
        ${pasos.map((paso, indice) => `
          <div style="border:1px solid var(--border,rgba(255,255,255,.08));border-radius:14px;padding:14px;display:flex;gap:12px;align-items:flex-start;background:${paso.listo ? 'rgba(34,197,94,.08)' : 'transparent'}">
            <div style="flex:none;width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:${paso.listo ? 'rgba(34,197,94,.18)' : 'rgba(148,163,184,.12)'};color:${paso.listo ? '#22c55e' : 'inherit'}">${icon(paso.listo ? 'check' : paso.icono)}</div>
            <div style="min-width:0">
              <div style="font-weight:700;margin-bottom:2px">${indice + 1}. ${h(paso.titulo)}</div>
              <div class="tiny muted" style="line-height:1.45">${h(paso.desc)}</div>
            </div>
          </div>`).join('')}
      </div>
      <div class="hint" style="margin-top:12px">${icon('shieldCheck')} Tu moneda, menú, canal y horas Premium se guardan aunque cambies de servidor. Solo cambia dónde se ejecuta el socket.</div>
    </div>
  </div>`
}

export async function renderPremium() {
  setPage('Premium', 'Gana horas de sub-bot premium mirando anuncios')
  content(loadingPage('Cargando tu premium…'))
  let datos
  let servidores = []
  try {
    const [datosPremium, datosServidores] = await Promise.all([
      api.get('/api/premium'),
      api.get('/api/servers').catch(() => ({ servers: [] })),
    ])
    datos = datosPremium
    servidores = Array.isArray(datosServidores?.servers) ? datosServidores.servers : []
  } catch (error) {
    content(errorPage(error.message))
    return
  }
  ESTADO.datos = datos
  const reglas = datos.rules || {}
  const bots = Array.isArray(datos.bots) ? datos.bots : []
  const premiumActivos = bots.filter((bot) => bot.active).length
  content(`
    ${anunciosCabeceraHTML()}
    <div class="page-head">
       <div><h2>Sub-bot premium</h2><p>${bots.length
         ? `${premiumActivos} de ${bots.length} ${bots.length === 1 ? 'sub-bot' : 'sub-bots'} con premium activo. Cada bot tiene su propio tiempo y personalización.`
        : 'Vincula un sub-bot para empezar.'}</p></div>
      <div class="page-actions">
        <button class="btn btn-secondary" data-action="refresh">${icon('refresh')} Actualizar</button>
        <a class="btn btn-secondary" href="#/bots">${icon('bot')} Mis bots</a>
      </div>
    </div>
    ${datos.enabled === false
      ? `<div class="notice warn">${icon('alert')}<div>El premium está desactivado por el administrador del servidor.</div></div>`
      : ''}
    ${datos.enabled !== false && datos.adsAvailable === false
      ? `<div class="notice warn">${icon('alert')}<div>El administrador todavía no configuró los anuncios. Vuelve más tarde.</div></div>`
      : ''}
    ${guiaPremiumHTML(bots, datos, servidores)}
    <div class="premium-rules">
      <div class="premium-rule">${icon('sparkles')}<div><b>${reglas.adMinutes} min por anuncio</b><span>Hay que permanecer ${reglas.adSeconds} s en el anuncio.</span></div></div>
      <div class="premium-rule">${icon('server')}<div><b>Máximo ${reglas.maxHours} h</b><span>Al llegar al tope el botón se bloquea.</span></div></div>
      <div class="premium-rule">${icon('refresh')}<div><b>Se reabre con ${reglas.unlockHours} h restantes</b><span>Desde ahí puedes seguir sumando hasta volver al máximo de ${reglas.maxHours} h.</span></div></div>
      <div class="premium-rule">${icon('shieldCheck')}<div><b>Sin perder nada</b><span>Tu moneda, menú y canal quedan guardados al caducar.</span></div></div>
    </div>

    ${bots.length
      ? `<div class="stack premium-bots">${bots.map((bot) => tarjetaBot(bot, reglas, datos.menuTemplate || '', servidores)).join('')}</div>`
      : `<div class="card">${`<div class="empty"><div class="empty-icon">${icon('bot')}</div><h4>Sin sub-bots todavía</h4><p>Vincula tu primer número y luego vuelve aquí para desbloquear el premium.</p><a class="btn btn-primary" href="#/link">${icon('plus')} Vincular bot</a></div>`}</div>`}
    ${anunciosPieHTML()}
  `)
  iniciarVigilancia()
  vigilarAnuncios()
}

/* ── Anti-bloqueador y contador ─────────────────────────────────────────── */

function medirBloqueador() {
  const cebo = document.createElement('div')
  cebo.className = 'adsbox ad-banner pub_300x250 text-ad'
  cebo.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:1px;height:1px'
  document.body.appendChild(cebo)
  const alto = cebo.offsetHeight
  const estilo = getComputedStyle(cebo)
  cebo.remove()
  return alto === 0 || estilo.display === 'none' || estilo.visibility === 'hidden'
}

let avisoBloqueadorMostrado = false

function mostrarAvisoBloqueador(motivo = 'blocked') {
  if (avisoBloqueadorMostrado) return
  avisoBloqueadorMostrado = true
  openModal({
    dismissible: false,
    title: 'No pudimos cargar los anuncios',
    subtitle: 'Comprueba tu conexión y permite este sitio',
    body: `<div class="notice">${icon('shieldCheck')}<div><b>Los anuncios financian nuestros sub-bots y las horas de Premium para que puedas usarlos completamente gratis.</b></div></div>
      <p class="muted">Puede deberse a un bloqueador de anuncios, una VPN o proxy, una protección de privacidad o un problema temporal de conexión. Permite los anuncios para este sitio y, si usas VPN o proxy, desactívalo temporalmente; después vuelve a intentarlo.</p>
      <p class="hint">Después pulsa el botón de abajo: recargaremos la página y volveremos a comprobarlo. Tus bots y las horas Premium que ya ganaste no se eliminan.</p>`,
    footer: `<button class="btn btn-primary" id="ads-recheck">${icon('refresh')} Ya desactivé el bloqueador · Reintentar anuncios</button>`,
    onMount(root) {
      const boton = root.querySelector('#ads-recheck')
      boton?.addEventListener('click', () => {
        boton.disabled = true
        boton.textContent = 'Recargando…'
        window.location.reload()
      })
      boton?.focus()
    },
  })
}

function pintarEstadoBloqueador() {
  if (ESTADO.bloqueador) mostrarAvisoBloqueador()
  const insignia = document.getElementById('premium-adblock-badge')
  const muro = document.getElementById('premium-adblock-wall')
  if (insignia) {
    insignia.className = `badge ${ESTADO.bloqueador ? 'warn' : 'success'}`
    insignia.innerHTML = ESTADO.bloqueador ? 'Bloqueador activo' : 'Anuncios visibles'
  }
  if (muro) muro.hidden = !ESTADO.bloqueador
  document.querySelectorAll('[data-action="premium-ad"]').forEach((boton) => {
    if (ESTADO.bloqueador) boton.disabled = true
  })
}

function vigilarAnuncios() {
  if (!ESTADO.escucha) {
    ESTADO.escucha = (evento) => {
      const datos = evento.data
      if (!datos || datos.pain !== 'ad') return
      const iframe = Array.from(document.querySelectorAll('iframe[data-ad-slot]'))
        .find((marco) => marco.contentWindow === evento.source)
      if (!iframe) return
      const clave = iframe.dataset.adSlot
      ESTADO.medidas.set(clave, { ok: datos.ok === true, alto: Number(datos.alto) || 0 })
      // El formato conserva su altura: no usar la altura del documento como tamaño del banner.
      // Un fallo puntual de red no basta para acusar de bloqueador: la
      // decisión se toma una sola vez, en el temporizador de abajo.
    }
    window.addEventListener('message', ESTADO.escucha)
  }
  ESTADO.medidas.clear()
  ESTADO.bloqueador = medirBloqueador()
  if (ESTADO.bloqueador) {
    ESTADO.bloqueador = true
    pintarEstadoBloqueador()
  } else {
    // Si los iframes no miden nada en 7 s, también es un bloqueador: el script
    // del anuncio nunca llegó a ejecutarse.
    setTimeout(() => {
      const medidas = Array.from(ESTADO.medidas.values())
      const conAnuncio = medidas.some((medida) => medida.ok)
      if (medirBloqueador()) {
        ESTADO.bloqueador = true
        pintarEstadoBloqueador()
      } else if (!ESTADO.bloqueador) {
        pintarEstadoBloqueador()
      }
    }, 7000)
  }
}

function iniciarCuenta(boton, phone, segundos, token) {
  const etiqueta = document.getElementById(`premium-timer-${phone}`)
  const fin = Date.now() + segundos * 1000
  boton.disabled = true
  const tick = () => {
    const falta = Math.max(0, fin - Date.now())
    if (etiqueta) {
      etiqueta.innerHTML = falta > 0
        ? `Espera <b>${Math.ceil(falta / 1000)} s</b> en el anuncio…`
        : 'Listo, reclamando tu tiempo…'
    }
    if (falta <= 0) {
      clearInterval(intervalo)
      reclamar(phone, token, boton, etiqueta)
    }
  }
  const intervalo = setInterval(tick, 250)
  tick()
}

async function reclamar(phone, token, boton, etiqueta, intento = 0) {
  try {
    const datos = await api.post('/api/premium/ad/claim', { phone, token, blocked: ESTADO.bloqueador })
    showToast(`¡Listo! Ganaste ${datos.grantedMinutes} min de premium.`, 'success')
    ESTADO.anuncio = null
    await renderPremium()
  } catch (error) {
    // El reloj del servidor manda: si aún no pasó el tiempo, reintenta una vez.
    if (error.code === 'premium_ad_too_fast' && intento < 2) {
      setTimeout(() => reclamar(phone, token, boton, etiqueta, intento + 1), 1200)
      return
    }
    if (error.code === 'premium_adblock') {
      ESTADO.bloqueador = true
      pintarEstadoBloqueador()
    }
    showToast(error.message || 'No se pudo reclamar el anuncio.', 'error')
    if (boton) boton.disabled = false
    if (etiqueta) etiqueta.textContent = `Duración del anuncio: ${ESTADO.datos?.rules?.adSeconds || 5} s`
  }
}

export async function iniciarAnuncioPremium(boton) {
  const phone = boton.dataset.phone
  if (!phone) return
  if (ESTADO.bloqueador) {
    showToast('Desactiva el bloqueador de anuncios para ganar premium.', 'error')
    return
  }
  // La pestaña del anuncio se abre en el clic (si no, el navegador la bloquea).
  // Sin `noopener` para conservar la referencia; el `opener` se corta abajo,
  // antes de mandarla al anuncio, para que Adsterra no vea esta pestaña.
  let ventana = null
  if (ESTADO.datos?.ads?.smartlink) {
    try { ventana = window.open('about:blank', '_blank') } catch { ventana = null }
    if (ventana) {
      try { ventana.opener = null } catch {}
      try { ventana.document.write('<p style="font:14px system-ui;padding:24px">Abriendo el anuncio…</p>') } catch {}
    }
  }
  boton.disabled = true
  try {
    const datos = await api.post('/api/premium/ad/start', { phone })
    ESTADO.anuncio = { phone, token: datos.token, fin: Date.now() + datos.seconds * 1000 }
    if (ventana && datos.smartlink) ventana.location.href = datos.smartlink
    else if (ventana) ventana.close()
    iniciarCuenta(boton, phone, datos.seconds, datos.token)
  } catch (error) {
    try { ventana?.close() } catch {}
    boton.disabled = false
    showToast(error.message || 'No se pudo abrir el anuncio.', 'error')
  }
}

export async function guardarPremiumEdiciones(form) {
  const phone = form.dataset.phone
  const boton = form.querySelector('button[type="submit"]')
  const error = form.querySelector('.form-error')
  const ok = form.querySelector('.form-success')
  if (error) error.classList.remove('show')
  if (ok) ok.classList.remove('show')
  const valor = (nombre) => String(form.querySelector(`[name="${nombre}"]`)?.value || '').trim()
  boton.disabled = true
  try {
    await api.patch(`/api/premium/${encodeURIComponent(phone)}`, {
      moneda: valor('moneda'),
      // Menú completo: vacío = vuelve al menú por defecto del bot.
      menu: { texto: String(form.querySelector('[name="menuTexto"]')?.value ?? '') },
      canal: { jid: valor('canalJid'), nombre: valor('canalNombre') },
      comandosOcultos: valor('comandosOcultos').split(',').map((v) => v.trim().toLowerCase()).filter(Boolean),
    })
    if (ok) {
      ok.classList.add('show')
      ok.querySelector('span').textContent = 'Personalización guardada. Se aplica mientras tengas premium.'
    }
    form.removeAttribute('data-premium-dirty')
    showToast('Personalización guardada.', 'success')
  } catch (fallo) {
    if (error) {
      error.classList.add('show')
      error.querySelector('span').textContent = fallo.message || 'No se pudo guardar.'
    }
    showToast(fallo.message || 'No se pudo guardar.', 'error')
  } finally {
    boton.disabled = false
  }
}

function iniciarVigilancia() {
  if (ESTADO.poll) clearInterval(ESTADO.poll)
  // Refresca el tiempo restante sin repintar mientras el usuario escribe.
  ESTADO.poll = setInterval(async () => {
    if (document.hidden) return
    if (location.hash.replace(/^#/, '') !== '/premium') return
    if (document.querySelector('.premium-form[data-premium-dirty="1"], .premium-form[data-premium-busy="1"]')) return
    const activo = document.activeElement
    if (activo && activo.closest?.('#content') && ['INPUT', 'TEXTAREA', 'SELECT'].includes(activo.tagName)) return
    if (ESTADO.anuncio) return
    await renderPremium().catch(() => {})
  }, 30_000)
  ESTADO.poll.unref?.()
}
