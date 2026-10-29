/**
 * Pain Panel — sub-bot premium.
 *
 * Un sub-bot es normal hasta que su dueño mira anuncios: cada anuncio suma
 * minutos de premium (configurable desde Administración). Mientras el premium
 * está activo se aplican sus personalizaciones (moneda, textos del menú y
 * canal); al caducar se dejan de aplicar al instante pero NO se borran: quedan
 * guardadas en `Serbot/<número>/config.json` y vuelven solas al recuperar
 * premium.
 *
 * Todo se guarda en el config.json del sub-bot (el mismo fichero que lee el
 * bot en WhatsApp), así que no hace falta migrar la base de datos y el cambio
 * funciona aunque el panel se reinicie.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { leerConfigSubBot, guardarConfigSubBot } from './subbot-config.js'

const META_AJUSTES = 'premium_ads_config'

export const PREMIUM_DEFECTOS = {
  enabled: true,
  // Segundos que hay que permanecer en el anuncio (se validan en el servidor).
  adSeconds: 5,
  // Minutos de premium por anuncio.
  adMinutes: 60,
  // Tope del banco de horas.
  maxHours: 24,
  // Al bajar de estas horas se vuelve a poder sumar tiempo.
  unlockHours: 10,
  // Espera mínima entre anuncios (anti abuso).
  cooldownSeconds: 5,
  smartlink: '',
  placements: Object.fromEntries(['dashboard', 'bots', 'premium', 'communities', 'link', 'account'].map((pagina) => [pagina, { header: true, footer: true }])),
  banners: {
    small: '', medium: '', native: '', square: '', tall: '',
    leaderboard: '', wide: '',
  },
  // Id de contenedor de cada anuncio (lo pone el propio bloque de Adsterra).
  contenedores: {
    small: '', medium: '', native: '', square: '', tall: '',
    leaderboard: '', wide: '',
  },
  // Opciones originales de atOptions que Adsterra necesita antes del invoke.js.
  opciones: {
    small: null, medium: null, native: null, square: null, tall: null,
    leaderboard: null, wide: null,
  },
}

const LIMITES = {
  adSeconds: [3, 60],
  adMinutes: [1, 1440],
  maxHours: [1, 720],
  unlockHours: [0, 720],
  cooldownSeconds: [0, 3600],
}

function numeroDentroDeLimites(valor, [minimo, maximo], porDefecto) {
  const numero = Number(valor)
  if (!Number.isFinite(numero)) return porDefecto
  const entero = Math.round(numero)
  if (entero < minimo) return minimo
  if (entero > maximo) return maximo
  return entero
}

/**
 * Extrae la URL del anuncio de lo que pegue el administrador. Adsterra se
 * pega normalmente como un bloque de HTML:
 *
 *   <script async src="…/60b45…/invoke.js"></script>
 *   <div id="container-60b45…"></div>
 *
 * o con `atOptions` + otro `<script src=…>`, o simplemente como una URL.
 * Devuelve `{ src, contenedor }` o `null` si no se puede interpretar.
 */
export function extraerAnuncio(entrada) {
  const texto = String(entrada ?? '').trim()
  if (!texto || texto.length > 4000) return null

  let candidato = ''
  const conSrc = texto.match(/\bsrc\s*=\s*["']([^"']+)["']/i)
  if (conSrc) candidato = conSrc[1]
  else {
    const conUrl = texto.match(/(?:https?:)?\/\/[^\s"'<>]+/i)
    candidato = conUrl ? conUrl[0] : (/^(https?:)?\/\//i.test(texto) ? texto.split(/\s/)[0] : '')
  }
  if (!candidato) return null

  const normal = candidato.startsWith('//') ? `https:${candidato}` : candidato
  let url
  try { url = new URL(normal) } catch { return null }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null

  // El id del contenedor que espera el script (si el bloque lo trae).
  const contenedor = texto.match(/\bid\s*=\s*["'](container-[A-Za-z0-9_-]+)["']/i)
  const tieneAtOptions = /\batOptions\s*=\s*\{/i.test(texto)
  const opcion = (nombre) => {
    const match = texto.match(new RegExp(`['\\"]${nombre}['\\"]\\s*:\\s*['\\"]([^'\\"]*)['\\"]`, 'i'))
    return match ? match[1] : ''
  }
  const numero = (nombre) => {
    const match = texto.match(new RegExp(`['\\"]${nombre}['\\"]\\s*:\\s*(?:['\\"])?(\\d+)(?:['\\"])?`, 'i'))
    const numero = Number(match?.[1])
    return Number.isFinite(numero) ? Math.max(1, Math.min(2000, Math.round(numero))) : 0
  }
  const opciones = tieneAtOptions ? {
    key: opcion('key'),
    format: opcion('format') || 'iframe',
    width: numero('width'),
    height: numero('height'),
  } : null
  return { src: url.toString(), contenedor: contenedor ? contenedor[1] : '', opciones }
}

function urlAnuncio(valor) {
  const extraido = extraerAnuncio(valor)
  return extraido ? extraido.src : ''
}

function contenedorAnuncio(valor) {
  const extraido = extraerAnuncio(valor)
  return extraido ? extraido.contenedor : ''
}

/** Solo ids con forma de contenedor de Adsterra (`container-…`). */
function contenedorValido(valor) {
  const texto = String(valor || '').trim()
  return /^container-[A-Za-z0-9_-]{1,60}$/.test(texto) ? texto : ''
}

/**
 * Comprueba las entradas antes de guardarlas: un campo con texto que no se
 * entiende se rechaza con un mensaje claro (nunca se guarda vacío en silencio).
 * Un campo vacío sí está permitido: eso borra el anuncio.
 */
export function validarEntradasAnuncios(entradas = {}) {
  const etiquetas = {
    native: 'Native banner', small: 'Banner 320 × 50', medium: 'Banner 160 × 300',
    square: 'Banner 300 × 250', tall: 'Banner 160 × 600',
    leaderboard: 'Banner 728 × 90', wide: 'Banner 468 × 60',
  }
  const banners = entradas.banners && typeof entradas.banners === 'object' ? entradas.banners : {}
  for (const [clave, etiqueta] of Object.entries(etiquetas)) {
    const valor = String(banners[clave] ?? '').trim()
    if (valor && !extraerAnuncio(valor)) {
      const error = new Error(
        `${etiqueta}: no se entiende lo pegado. Pega el bloque completo de Adsterra (script + div) o solo la URL invoke.js.`
      )
      error.code = 'invalid_premium_banner'
      throw error
    }
  }
  const smartlink = String(entradas.smartlink ?? '').trim()
  if (smartlink && !extraerAnuncio(smartlink)) {
    const error = new Error('Smartlink: pega una URL (https://…).')
    error.code = 'invalid_premium_smartlink'
    throw error
  }
  return true
}

/** Ajustes de anuncios (los edita el administrador). */
export function normalizarAjustes(entrada = {}, base = PREMIUM_DEFECTOS) {
  const banners = entrada.banners && typeof entrada.banners === 'object' ? entrada.banners : {}
  return {
    enabled: entrada.enabled === undefined ? base.enabled !== false : entrada.enabled === true,
    adSeconds: numeroDentroDeLimites(entrada.adSeconds ?? base.adSeconds, LIMITES.adSeconds, PREMIUM_DEFECTOS.adSeconds),
    adMinutes: numeroDentroDeLimites(entrada.adMinutes ?? base.adMinutes, LIMITES.adMinutes, PREMIUM_DEFECTOS.adMinutes),
    maxHours: numeroDentroDeLimites(entrada.maxHours ?? base.maxHours, LIMITES.maxHours, PREMIUM_DEFECTOS.maxHours),
    unlockHours: numeroDentroDeLimites(
      entrada.unlockHours ?? base.unlockHours,
      LIMITES.unlockHours,
      PREMIUM_DEFECTOS.unlockHours
    ),
    cooldownSeconds: numeroDentroDeLimites(
      entrada.cooldownSeconds ?? base.cooldownSeconds,
      LIMITES.cooldownSeconds,
      PREMIUM_DEFECTOS.cooldownSeconds
    ),
    smartlink: urlAnuncio(entrada.smartlink ?? base.smartlink),
    placements: Object.fromEntries(Object.keys(PREMIUM_DEFECTOS.placements).map((pagina) => [pagina,
      Object.fromEntries(['header', 'footer'].map((zona) => [zona,
        typeof entrada.placements?.[pagina]?.[zona] === 'boolean'
          ? entrada.placements[pagina][zona]
          : (base.placements?.[pagina]?.[zona] ?? true),
      ])),
    ])),
    banners: {
      small: urlAnuncio(banners.small ?? base.banners?.small),
      medium: urlAnuncio(banners.medium ?? base.banners?.medium),
      native: urlAnuncio(banners.native ?? base.banners?.native),
      square: urlAnuncio(banners.square ?? base.banners?.square),
      tall: urlAnuncio(banners.tall ?? base.banners?.tall),
      leaderboard: urlAnuncio(banners.leaderboard ?? base.banners?.leaderboard),
      wide: urlAnuncio(banners.wide ?? base.banners?.wide),
    },
    // Id del contenedor que espera cada script de Adsterra. Viene del bloque
    // que pegó el administrador; al releer, los banners ya guardados están
    // limpios (solo la URL, sin el `div`), así que se conserva el id guardado
    // en lugar de recalcularlo de una URL que ya no lo trae.
    opciones: {
      small: entrada.opciones?.small || null,
      medium: entrada.opciones?.medium || null,
      native: entrada.opciones?.native || null,
      square: entrada.opciones?.square || null,
      tall: entrada.opciones?.tall || null,
      leaderboard: entrada.opciones?.leaderboard || null,
      wide: entrada.opciones?.wide || null,
    },
    contenedores: {
      small:
        contenedorAnuncio(banners.small ?? base.banners?.small) ||
        contenedorValido(entrada.contenedores?.small),
      medium:
        contenedorAnuncio(banners.medium ?? base.banners?.medium) ||
        contenedorValido(entrada.contenedores?.medium),
      native:
        contenedorAnuncio(banners.native ?? base.banners?.native) ||
        contenedorValido(entrada.contenedores?.native),
      square:
        contenedorAnuncio(banners.square ?? base.banners?.square) ||
        contenedorValido(entrada.contenedores?.square),
      tall:
        contenedorAnuncio(banners.tall ?? base.banners?.tall) ||
        contenedorValido(entrada.contenedores?.tall),
      leaderboard:
        contenedorAnuncio(banners.leaderboard ?? base.banners?.leaderboard) ||
        contenedorValido(entrada.contenedores?.leaderboard),
      wide:
        contenedorAnuncio(banners.wide ?? base.banners?.wide) ||
        contenedorValido(entrada.contenedores?.wide),
    },
  }
}

export async function leerAjustesPremium(store) {
  const crudo = await store.obtenerMeta(META_AJUSTES)
  if (!crudo) return { ...PREMIUM_DEFECTOS, banners: { ...PREMIUM_DEFECTOS.banners } }
  let datos = null
  try { datos = JSON.parse(String(crudo)) } catch { datos = null }
  if (!datos || typeof datos !== 'object') return { ...PREMIUM_DEFECTOS, banners: { ...PREMIUM_DEFECTOS.banners } }
  return normalizarAjustes(datos)
}

export async function guardarAjustesPremium(store, cambios = {}) {
  const actuales = await leerAjustesPremium(store)
  const siguientes = normalizarAjustes({ ...actuales, ...cambios }, actuales)
  // Un banner reescrito por el administrador toma el contenedor de su bloque
  // nuevo (vacío si venía sin `div`): nunca hereda el id del anterior.
  const tocados = cambios.banners && typeof cambios.banners === 'object' ? cambios.banners : {}
  for (const clave of ['small', 'medium', 'native', 'square', 'tall', 'leaderboard', 'wide']) {
    if (tocados[clave] !== undefined) {
      const anuncio = extraerAnuncio(tocados[clave])
      const mismaUrl = anuncio?.src === actuales.banners[clave] && String(tocados[clave]).trim() === anuncio?.src
      siguientes.contenedores[clave] = anuncio?.contenedor || (mismaUrl ? actuales.contenedores[clave] : '')
      siguientes.opciones[clave] = anuncio?.opciones || (mismaUrl ? actuales.opciones[clave] : null)
    }
  }
  // El tope nunca puede quedar por debajo del desbloqueo (si no, no se
  // desbloquearía nunca el botón).
  if (siguientes.unlockHours >= siguientes.maxHours) {
    siguientes.unlockHours = Math.max(0, siguientes.maxHours - 1)
  }
  await store.establecerMeta(META_AJUSTES, JSON.stringify(siguientes))
  return siguientes
}

/* ── Ediciones premium (moneda, textos y canal) ─────────────────────────── */

const TEXTO_PROHIBIDO = /(https?:\/\/|www\.|wa\.me|t\.me|chat\.whatsapp|\.com|\.net|\.org|\.lat|\.xyz)/i
const ARROBA = /@[a-z0-9_.-]{3,}/i

/** Texto corto para el menú: sin enlaces, sin menciones y en una sola línea. */
function textoMenu(valor, maximo = 40) {
  const limpio = String(valor ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim()
  if (!limpio) return ''
  if (TEXTO_PROHIBIDO.test(limpio) || ARROBA.test(limpio)) {
    const error = new Error('Los textos del menú no pueden contener enlaces, dominios ni @menciones.')
    error.code = 'invalid_premium_text'
    throw error
  }
  return limpio.slice(0, maximo)
}

/** Moneda: letras y símbolos, sin enlaces ni dígitos ambiguos. */
function textoMoneda(valor) {
  const limpio = String(valor ?? '').replace(/[\r\n\t]+/g, ' ').trim()
  if (!limpio) return ''
  if (limpio.length > 8) {
    const error = new Error('La moneda debe tener 8 caracteres como máximo (por ejemplo USD, S/ o Bs.).')
    error.code = 'invalid_premium_currency'
    throw error
  }
  if (!/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ$€£¥₽₹₺₴₦₱₩₪฿₫₡₲₵₸₼₾./\s-]+$/.test(limpio)) {
    const error = new Error('La moneda solo admite letras y símbolos (por ejemplo USD, S/, €).')
    error.code = 'invalid_premium_currency'
    throw error
  }
  return limpio
}

/**
 * Texto completo del menú. A diferencia de los campos cortos, aquí sí se
 * admiten enlaces (el menú del proyecto ya los lleva) y los saltos de línea:
 * es el texto que verá el grupo. Solo se limita el tamaño y se quitan los
 * caracteres de control.
 */
function textoMenuCompleto(valor) {
  const limpio = String(valor ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
  if (limpio.length > 4000) {
    const error = new Error('El texto del menú no puede pasar de 4000 caracteres.')
    error.code = 'invalid_premium_menu'
    throw error
  }
  return limpio.trim() ? limpio : ''
}

/** JID de canal: acepta `123@newsletter`, solo dígitos o un link de canal. */
export function normalizarCanalPremium(jid = '') {
  const valor = String(jid || '').trim()
  if (!valor) return ''
  const link = valor.match(/(?:whatsapp\.com|wa\.me)\/channel\/([A-Za-z0-9_-]+)/i)
  if (link) return `${link[1]}@newsletter`
  if (/^\d{10,}@newsletter$/.test(valor)) return valor
  if (/^\d{10,}$/.test(valor)) return `${valor}@newsletter`
  // Los códigos de invitación de WhatsApp son largos (~22): un texto corto
  // como "no-es-un-canal" no debe colarse como canal válido.
  if (/^[A-Za-z0-9_-]{16,}$/.test(valor)) return `${valor}@newsletter`
  return ''
}

function camposEdiciones(entrada = {}) {
  return {
    moneda: entrada?.moneda,
    menu: entrada && typeof entrada.menu === 'object' && entrada.menu ? entrada.menu : {},
    canal: entrada && typeof entrada.canal === 'object' && entrada.canal ? entrada.canal : {},
    comandos: Array.isArray(entrada?.comandos) ? entrada.comandos : [],
  }
}

/**
 * Normaliza las ediciones guardadas (lectura tolerante): un config tocado a
 * mano o viejo nunca debe romper el panel, así que cada campo inválido se
 * descarta por separado.
 */
export function normalizarEdiciones(entrada = {}) {
  const { moneda, menu, canal, comandos } = camposEdiciones(entrada)
  const salida = { moneda: '', menu: { creador: '', hosting: '', donar: '', texto: '' }, canal: { jid: '', nombre: '' }, comandosOcultos: [], comandos: comandos.slice(0, 50).filter((item) => item?.name && item?.response).map((item) => ({ name: String(item.name).toLowerCase(), prompt: String(item.prompt || '').slice(0, 800), response: String(item.response).slice(0, 2000), plugin: String(item.plugin || ''), source: String(item.source || '').slice(0, 20000) })) }
  const intentar = (fn, asignar) => {
    try { asignar(fn()) } catch {}
  }
  intentar(() => textoMoneda(moneda), (valor) => { salida.moneda = valor })
  intentar(() => textoMenu(menu.creador), (valor) => { salida.menu.creador = valor })
  intentar(() => textoMenu(menu.hosting), (valor) => { salida.menu.hosting = valor })
  intentar(() => textoMenu(menu.donar, 90), (valor) => { salida.menu.donar = valor })
  intentar(() => textoMenuCompleto(menu.texto), (valor) => { salida.menu.texto = valor })
  intentar(() => normalizarCanalPremium(canal.jid), (valor) => { salida.canal.jid = valor })
  intentar(() => textoMenu(canal.nombre), (valor) => { salida.canal.nombre = valor })
  salida.comandosOcultos = Array.isArray(entrada?.comandosOcultos)
    ? [...new Set(entrada.comandosOcultos.map((v) => String(v || '').trim().toLowerCase()).filter((v) => /^[\wáéíóúñ-]{1,40}$/i.test(v)))]
    : []
  return salida
}

/** Valida lo que llega del panel. Lanza error con mensaje claro. */
export function validarEdiciones(entrada = {}) {
  const { moneda, menu, canal, comandos } = camposEdiciones(entrada)
  const ediciones = {
    moneda: textoMoneda(moneda),
    menu: {
      creador: textoMenu(menu.creador),
      hosting: textoMenu(menu.hosting),
      donar: textoMenu(menu.donar, 90),
      texto: textoMenuCompleto(menu.texto),
    },
    canal: { jid: normalizarCanalPremium(canal.jid), nombre: textoMenu(canal.nombre) },
    comandosOcultos: Array.isArray(entrada?.comandosOcultos)
      ? [...new Set(entrada.comandosOcultos.map((v) => String(v || '').trim().toLowerCase()).filter((v) => /^[\wáéíóúñ-]{1,40}$/i.test(v)))]
      : [],
    comandos: comandos.slice(0, 50).filter((item) => item?.name && item?.response).map((item) => ({ name: String(item.name).toLowerCase(), prompt: String(item.prompt || '').slice(0, 800), response: String(item.response).slice(0, 2000), plugin: String(item.plugin || ''), source: String(item.source || '').slice(0, 20000) })),
  }
  if (String(canal.jid || '').trim() && !ediciones.canal.jid) {
    const error = new Error('El canal no es válido. Usa el ID del canal (1234@newsletter) o su link.')
    error.code = 'invalid_premium_channel'
    throw error
  }
  return ediciones
}

/* ── Estado por sub-bot ─────────────────────────────────────────────────── */

const MS_HORA = 60 * 60 * 1000

export function estadoPremium(root, phone, ajustes = PREMIUM_DEFECTOS, ahora = Date.now()) {
  const config = leerConfigSubBot(root, phone)
  const premium = config && typeof config.premium === 'object' && config.premium ? config.premium : {}
  const infinito = premium.adminInfinite === true
  const expiresAt = infinito ? Number.MAX_SAFE_INTEGER : (Number(premium.expiresAt) || 0)
  const restanteMs = Math.max(0, expiresAt - ahora)
  const topeMs = ajustes.maxHours * MS_HORA
  const desbloqueoMs = ajustes.unlockHours * MS_HORA
  // Histéresis: tras llenar el banco se espera al umbral de reapertura. Una
  // vez abierto, superar otra vez unlockHours NO lo cierra: solo maxHours.
  // En configs anteriores se reconoce el último llenado a partir del reclamo;
  // el pequeño margen solo compensa diferencias de reloj de aquella escritura.
  const llenoAnterior = premium.adBankLocked === undefined && Number(premium.lastClaimAt) > 0 &&
    expiresAt - Number(premium.lastClaimAt) >= topeMs - 1000
  const topeAmpliado = Number(premium.adBankMaxHours) > 0 && ajustes.maxHours > Number(premium.adBankMaxHours)
  const bloqueado = infinito || premium.adminGrant === true ? false : (restanteMs >= topeMs || (restanteMs > desbloqueoMs &&
    !topeAmpliado && (premium.adBankLocked === true || llenoAnterior))
  )
  if (!infinito && expiresAt > 0 && (premium.adBankLocked !== bloqueado ||
    (bloqueado && premium.adBankMaxHours !== ajustes.maxHours))) {
    guardarConfigSubBot(root, phone, { premium: { ...premium, adBankLocked: bloqueado, adBankMaxHours: ajustes.maxHours } })
  }
  return {
    activo: restanteMs > 0,
    infinito,
    expiresAt: restanteMs > 0 ? expiresAt : 0,
    restanteMs,
    bloqueado,
    puedeSumar: !bloqueado,
    anuncios: Math.max(0, Math.floor(Number(premium.ads) || 0)),
    ultimoAnuncio: Number(premium.lastClaimAt) || 0,
    ediciones: normalizarEdiciones(config.premiumEdits),
    canalConfigurado: Boolean(
      config.premiumEdits && typeof config.premiumEdits === 'object' &&
      Object.prototype.hasOwnProperty.call(config.premiumEdits, 'canal')
    ),
  }
}

export function sumarPremium(root, phone, minutos, ajustes, ahora = Date.now()) {
  const actual = estadoPremium(root, phone, ajustes, ahora)
  const config = leerConfigSubBot(root, phone)
  const premium = config && typeof config.premium === 'object' && config.premium ? config.premium : {}
  if (premium.adminInfinite === true) return actual
  const base = Math.max(ahora, actual.expiresAt)
  const tope = ahora + ajustes.maxHours * MS_HORA
  const expiresAt = Math.min(base + Math.round(minutos) * 60_000, tope)
  guardarConfigSubBot(root, phone, {
    premium: {
      ...premium,
      expiresAt,
      lastClaimAt: ahora,
      adBankLocked: actual.bloqueado || expiresAt >= tope,
      adBankMaxHours: ajustes.maxHours,
      ads: (Math.max(0, Math.floor(Number(premium.ads) || 0))) + 1,
    },
  })
  return estadoPremium(root, phone, ajustes, ahora)
}

/** Concesión directa de un administrador: no consume el banco de anuncios. */
export function concederPremiumAdmin(root, phone, { horas = 0, infinito = false } = {}, ahora = Date.now()) {
  const config = leerConfigSubBot(root, phone)
  const premium = config && typeof config.premium === 'object' && config.premium ? config.premium : {}
  const actual = Number(premium.expiresAt) > ahora ? Number(premium.expiresAt) : ahora
  const expiresAt = infinito ? Number.MAX_SAFE_INTEGER : actual + Math.round(Number(horas) * MS_HORA)
  guardarConfigSubBot(root, phone, {
    premium: { ...premium, expiresAt, adminInfinite: infinito, adminGrant: true, adBankLocked: false },
  })
  return { expiresAt, infinite: infinito }
}

export function guardarEdicionesPremium(root, phone, ediciones) {
  const config = leerConfigSubBot(root, phone)
  const anterior = config.premiumEdits && typeof config.premiumEdits === 'object' ? config.premiumEdits : {}
  const siguiente = { ...anterior, ...ediciones, menu: { ...(anterior.menu || {}), ...(ediciones.menu || {}) }, canal: { ...(anterior.canal || {}), ...(ediciones.canal || {}) } }
  guardarConfigSubBot(root, phone, { premiumEdits: siguiente })
  return normalizarEdiciones(siguiente)
}

export function fuentePluginComando(comando) {
  if (String(comando?.source || '').includes('handler.command') && String(comando.source).includes('export default')) return String(comando.source).trim() + '\n'
  return `const response = ${JSON.stringify(String(comando?.response || '').slice(0, 2000))}\nconst handler = async (m, { conn }) => conn.sendMessage(m.chat, { text: response }, { quoted: m })\nhandler.command = [${JSON.stringify(String(comando?.name || '').toLowerCase())}]\nexport default handler\n`
}

export function guardarPluginsComandos(root, phone, comandos) {
  const carpeta = path.join(root, String(phone), 'plugins'); fs.mkdirSync(carpeta, { recursive: true })
  return (Array.isArray(comandos) ? comandos : []).slice(0, 50).map((item) => {
    const name = String(item?.name || '').toLowerCase().replace(/[^a-z0-9áéíóúñ_-]/gi, '-').slice(0, 32)
    const plugin = `plugins/premium-${name}.js`; const comando = { ...item, name, plugin }
    fs.writeFileSync(path.join(carpeta, `premium-${name}.js`), fuentePluginComando(comando), 'utf8'); return comando
  })
}

/** Lo que ve el dueño del bot en el panel (sin rutas del servidor). */
export function premiumPublico(root, phone, ajustes = PREMIUM_DEFECTOS) {
  const estado = estadoPremium(root, phone, ajustes)
  return {
    active: estado.activo,
    infinite: estado.infinito,
    remainingMs: estado.restanteMs,
    expiresAt: estado.expiresAt,
    locked: estado.bloqueado,
    canAdd: estado.puedeSumar,
    ads: estado.anuncios,
    lastClaimAt: estado.ultimoAnuncio,
    edits: estado.ediciones,
    canalConfigurado: estado.canalConfigurado,
    // Las ediciones se guardan siempre; solo se aplican con premium activo.
    applied: estado.activo,
  }
}

/* ── Desafíos de anuncio (validados en el servidor) ─────────────────────── */

const desafios = new Map()
const VIDA_DESAFIO_MS = 10 * 60 * 1000

function limpiarDesafios() {
  const ahora = Date.now()
  for (const [token, desafio] of desafios) {
    if (ahora - desafio.creadoEn > VIDA_DESAFIO_MS) desafios.delete(token)
  }
}

/**
 * Abre un anuncio: devuelve un token de un solo uso. El tiempo se mide en el
 * servidor, así que cambiar el reloj del navegador o el contador no sirve.
 */
export function iniciarAnuncio({ userId, phone, ajustes }) {
  limpiarDesafios()
  if (!ajustes.enabled) {
    const error = new Error('Los anuncios de premium están desactivados.')
    error.code = 'premium_disabled'
    throw error
  }
  if (!ajustes.smartlink && !ajustes.banners.small && !ajustes.banners.medium && !ajustes.banners.native) {
    const error = new Error('El administrador todavía no configuró los anuncios.')
    error.code = 'premium_ads_missing'
    throw error
  }
  for (const desafio of desafios.values()) {
    if (desafio.userId === userId && desafio.phone === phone) {
      return {
        token: desafio.token,
        seconds: desafio.segundos,
        expiresAt: desafio.creadoEn + VIDA_DESAFIO_MS,
        smartlink: ajustes.smartlink,
        banners: ajustes.banners,
      }
    }
  }
  const token = crypto.randomUUID()
  const desafio = {
    token,
    userId,
    phone,
    creadoEn: Date.now(),
    // Un segundo de margen: el navegador nunca llega con exactitud al segundo.
    segundos: ajustes.adSeconds,
    requisitoMs: (ajustes.adSeconds + 1) * 1000,
  }
  desafios.set(token, desafio)
  return {
    token,
    seconds: desafio.segundos,
    expiresAt: desafio.creadoEn + VIDA_DESAFIO_MS,
    smartlink: ajustes.smartlink,
    banners: ajustes.banners,
  }
}

export function estadoDesafio(token, { userId, phone }) {
  const desafio = desafios.get(String(token || ''))
  if (!desafio) return null
  if (desafio.userId !== userId || desafio.phone !== phone) return null
  if (Date.now() - desafio.creadoEn > VIDA_DESAFIO_MS) {
    desafios.delete(desafio.token)
    return null
  }
  return desafio
}

export function consumirDesafio(token, { userId, phone }) {
  const desafio = estadoDesafio(token, { userId, phone })
  if (!desafio) {
    const error = new Error('El anuncio caducó. Vuelve a abrirlo.')
    error.code = 'premium_ad_expired'
    throw error
  }
  if (Date.now() - desafio.creadoEn < desafio.requisitoMs) {
    const error = new Error(`Todavía no pasaron ${desafio.segundos} segundos en el anuncio.`)
    error.code = 'premium_ad_too_fast'
    error.seconds = desafio.segundos
    throw error
  }
  desafios.delete(desafio.token)
  return desafio
}

/** Solo para pruebas: vacía los desafíos en memoria. */
export function reiniciarDesafios() {
  desafios.clear()
}
