/**
 * Lotería por grupo, un sorteo por hora en punto.
 *
 * - La abre cualquiera (.loteria) o el tick del principal al cambiar la hora,
 *   solo en grupos con actividad reciente y con /games activo.
 * - Premio ANUNCIADO (seed del bot) + todo lo recaudado. El boleto cuesta
 *   según el premio (a más premio, más caro).
 * - Mínimo 3 compradores distintos o NO hay ganador y se DEVUELVE todo.
 *   Así una granja privada de 1-2 cuentas no imprime dinero.
 * - Máximo 10 boletos por persona y sorteo (la ballena tiene más chance,
 *   pero no garantiza nada).
 * - Compra, reembolso y premio son atómicos (claimAndUpdate): ni doble
 *   gasto ni doble pago aunque 6 procesos toquen a la vez.
 * - Cierre con claim (claimCommand): aunque varios procesos lo vean
 *   vencido, solo uno lo ejecuta y anuncia.
 */
import { juegosActivados } from './Modos/modo-games.js'
import { aplicarComisionPareja } from './pareja-comision.js'

const CLAVE = 'loteria'
const CLAVE_ESTADO = 'loteriaEstado'
/** Sorteos vacíos seguidos antes de pausar aperturas automáticas. */
const FRIAS_PARA_DESCANSO = 2
/** Pausa de auto-apertura cuando al grupo no le interesa (ms). */
const DESCANSO_MS = 6 * 60 * 60 * 1000
/** Rango nocturno sin aperturas automáticas "0-5" = 00:00 a 04:59. */
const RANGO_NOCTURNO = String(process.env.LOTERIA_QUIET || '0-5')
/** Offset por defecto en minutos (Lima/Bogotá/Quito = -300). */
const TZ_DEFECTO_MIN = (() => {
  const crudo = String(process.env.LOTERIA_TZ_OFFSET ?? '-5').trim()
  const m = crudo.match(/^([+-]?)(\d{1,2})(?::([03]0))?$/)
  if (!m) return -300
  const mins = Number(m[2]) * 60 + Number(m[3] || 0)
  const v = m[1] === '+' ? mins : -mins
  return Math.max(-720, Math.min(840, v))
})()

function parsearRangoNocturno() {
  const m = RANGO_NOCTURNO.match(/(\d{1,2})\s*-\s*(\d{1,2})/)
  if (!m) return { inicio: 0, fin: 5 }
  return { inicio: Number(m[1]) % 24, fin: Number(m[2]) % 24 }
}

/** Offset del grupo (minutos) o el de por defecto. */
export function obtenerTzLoteria(chatId) {
  const estado = obtenerEstadoLoteria(chatId)
  return Number.isFinite(Number(estado.tzMin)) ? Number(estado.tzMin) : TZ_DEFECTO_MIN
}

export function establecerTzLoteria(chatId, offsetMin) {
  if (!Number.isFinite(offsetMin) || offsetMin < -720 || offsetMin > 840) {
    throw new Error('Zona horaria inválida (usa horas de -12 a +14, ej. -5, -6, +1).')
  }
  const estado = obtenerEstadoLoteria(chatId)
  guardarEstadoLoteria(chatId, { ...estado, tzMin: offsetMin })
  return offsetMin
}

function horaEnZona(fecha, offsetMin) {
  return new Date(fecha.getTime() + offsetMin * 60_000).getUTCHours()
}

/** true si en el grupo es de noche (no se abren pozos, pero sí cierran). */
export function enHorarioNocturno(chatId, fecha = new Date()) {
  const { inicio, fin } = parsearRangoNocturno()
  const hora = horaEnZona(fecha, obtenerTzLoteria(chatId))
  if (inicio <= fin) return hora >= inicio && hora < fin
  return hora >= inicio || hora < fin
}

export function textoTzLoteria(chatId) {
  const min = obtenerTzLoteria(chatId)
  const signo = min < 0 ? '-' : '+'
  const abs = Math.abs(min)
  const hh = String(Math.floor(abs / 60))
  const mm = abs % 60 ? `:${String(abs % 60).padStart(2, '0')}` : ''
  return `UTC${signo}${hh}${mm}`
}

export const MIN_COMPRADORES = 5
export const MAX_BOLETOS_POR_USUARIO = 10
/** Pozo máximo: al llegar, se cierra la venta ("pozo lleno"). */
export const MAX_POZO = 900_000
/** Un sorteo cada 20 min (en punto :00, :20, :40). */
export const VENTANA_MINUTOS = 20
const VENTANA_ACTIVIDAD_MS = 2 * 60 * 60 * 1000

const TIERS = [
  { id: 'comun', peso: 55, premioMin: 5000, premioMax: 15000, boleto: 300, nombre: 'Común' },
  { id: 'raro', peso: 30, premioMin: 20000, premioMax: 50000, boleto: 800, nombre: 'Raro' },
  { id: 'epico', peso: 12, premioMin: 60000, premioMax: 150000, boleto: 2000, nombre: 'Épico' },
  { id: 'legendario', peso: 3, premioMin: 200000, premioMax: 500000, boleto: 5000, nombre: 'LEGENDARIO' },
]

function pad(n) {
  return String(n).padStart(2, '0')
}

export function idHoraActual(fecha = new Date()) {
  const inicio = new Date(fecha)
  inicio.setSeconds(0, 0)
  inicio.setMinutes(Math.floor(inicio.getMinutes() / VENTANA_MINUTOS) * VENTANA_MINUTOS)
  return `${inicio.getFullYear()}-${pad(inicio.getMonth() + 1)}-${pad(inicio.getDate())}-${pad(inicio.getHours())}${pad(inicio.getMinutes())}`
}

/** Fin de la ventana actual (siguiente :00, :20 o :40 en punto). */
export function finHoraActual(fecha = new Date()) {
  const inicio = new Date(fecha)
  inicio.setSeconds(0, 0)
  inicio.setMinutes(Math.floor(inicio.getMinutes() / VENTANA_MINUTOS) * VENTANA_MINUTOS)
  return inicio.getTime() + VENTANA_MINUTOS * 60_000
}

/** Texto "en X min" / "en X h, Y min" hasta un timestamp. */
export function faltaParaTexto(terminaEn) {
  const mins = Math.max(0, Math.ceil((Number(terminaEn) - Date.now()) / 60000))
  if (mins < 60) return `~${mins} min`
  const h = Math.floor(mins / 60)
  return `~${h} h, ${mins % 60} min`
}

export function horaCierreTexto(terminaEn) {
  const f = new Date(terminaEn)
  return `${pad(f.getHours())}:${pad(f.getMinutes())}`
}

function sortearTier() {
  const total = TIERS.reduce((s, t) => s + t.peso, 0)
  let tiro = Math.random() * total
  for (const tier of TIERS) {
    tiro -= tier.peso
    if (tiro <= 0) return tier
  }
  return TIERS[0]
}

function asegurarMapa() {
  if (!global.db?.data) return null
  if (!global.db.data[CLAVE] || typeof global.db.data[CLAVE] !== 'object' || Array.isArray(global.db.data[CLAVE])) {
    global.db.data[CLAVE] = {}
  }
  return global.db.data[CLAVE]
}

export function obtenerSorteo(chatId) {
  const mapa = global.db?.data?.[CLAVE]
  if (!mapa || typeof mapa !== 'object') return null
  const sorteo = mapa[chatId]
  return sorteo && typeof sorteo === 'object' ? sorteo : null
}

/** Interés del grupo: racha de sorteos vacíos + hasta cuándo descansar. */
export function obtenerEstadoLoteria(chatId) {
  const mapa = global.db?.data?.[CLAVE_ESTADO]
  const estado = mapa && typeof mapa === 'object' ? mapa[chatId] : null
  if (estado && typeof estado === 'object') return estado
  return { fria: 0, descansoHasta: 0 }
}

function guardarEstadoLoteria(chatId, estado) {
  if (!global.db?.data || typeof global.db.data !== 'object') return
  if (!global.db.data[CLAVE_ESTADO] || typeof global.db.data[CLAVE_ESTADO] !== 'object') {
    global.db.data[CLAVE_ESTADO] = {}
  }
  global.db.data[CLAVE_ESTADO][chatId] = estado
}

/** Cualquier uso manual de .loteria demuestra interés: resetea el descanso. */
export function marcarInteresLoteria(chatId) {
  const estado = obtenerEstadoLoteria(chatId)
  guardarEstadoLoteria(chatId, { ...estado, fria: 0, descansoHasta: 0 })
}

export function enDescansoLoteria(chatId, ahora = Date.now()) {
  return Number(obtenerEstadoLoteria(chatId).descansoHasta) > ahora
}

function registrarCierreLoteria(chatId, huboInteres) {
  if (huboInteres) {
    const estado = obtenerEstadoLoteria(chatId)
    guardarEstadoLoteria(chatId, { ...estado, fria: 0, descansoHasta: 0 })
    return
  }
  // Cierres vacíos en horario nocturno no cuentan: la gente duerme,
  // no es desinterés. Así no se castiga la mañana siguiente.
  if (enHorarioNocturno(chatId)) return
  const previo = obtenerEstadoLoteria(chatId)
  const fria = (Number(previo.fria) || 0) + 1
  guardarEstadoLoteria(chatId, {
    ...previo,
    fria,
    descansoHasta: fria >= FRIAS_PARA_DESCANSO ? Date.now() + DESCANSO_MS : 0,
  })
}

function crearSorteo(chatId, horaId, terminaEn) {
  const mapa = asegurarMapa()
  if (!mapa) return null
  const tier = sortearTier()
  const premio = Math.floor(tier.premioMin + Math.random() * (tier.premioMax - tier.premioMin + 1))
  mapa[chatId] = {
    horaId,
    tier: tier.id,
    nombreTier: tier.nombre,
    premioAnunciado: premio,
    precioBoleto: tier.boleto,
    terminaEn,
    boletos: {},
    pot: 0,
    anunciado: false,
  }
  return mapa[chatId]
}

/**
 * Abre el sorteo de la hora actual si no existe. Retorna
 * { sorteo, nuevo } — nuevo=true solo para quien lo creó (y debe anunciarlo).
 * Usa claim para que entre 6 procesos solo uno lo cree. Si quedó un sorteo
 * vencido de otra hora (bot caído), se cierra primero para no pisar boletos.
 */
export async function abrirSorteoActual(chatId, conn = null) {
  const ahora = new Date()
  const horaId = idHoraActual(ahora)
  const terminaEn = finHoraActual(ahora)
  const existente = obtenerSorteo(chatId)
  if (existente && existente.horaId === horaId) return { sorteo: existente, nuevo: false }
  if (existente && Date.now() >= Number(existente.terminaEn)) {
    try {
      await cerrarSorteo(conn, chatId)
    } catch {}
  }

  let adquirido = false
  try {
    adquirido = await global.db.adapter.claimCommand(
      global.db.data,
      `loteria-open:${chatId}:${horaId}`,
      Math.max(60_000, terminaEn - Date.now() + 600_000)
    )
  } catch {
    adquirido = false
  }
  if (!adquirido) {
    // Otro proceso lo creó a la vez: devolver el suyo. Si no hay ninguno,
    // el claim es resto de un sorteo ya cerrado: recuperar creando de nuevo.
    const ajeno = obtenerSorteo(chatId)
    if (ajeno && ajeno.horaId === horaId) return { sorteo: ajeno, nuevo: false }
  }
  const sorteo = crearSorteo(chatId, horaId, terminaEn)
  return { sorteo, nuevo: true }
}

export function textoApertura(sorteo) {
  return `
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *pozo de lotería abierto*
╰─ ✧  ✩
┊ premio  ·  \`${Number(sorteo.premioAnunciado).toLocaleString()} ${global.moneda || 'USD'}\` (${sorteo.nombreTier})
┊ boleto  ·  \`${Number(sorteo.precioBoleto).toLocaleString()} ${global.moneda || 'USD'}\`
┊ cierra  ·  \`${horaCierreTexto(sorteo.terminaEn)}\`
┊ compra  ·  \`.loteria <cantidad>\` (máx. ${MAX_BOLETOS_POR_USUARIO} por persona)
┊ mínimo  ·  \`${MIN_COMPRADORES}\` participantes o se devuelve todo
╰─────────`.trim()
}

export async function anunciarApertura(conn, chatId, sorteo) {
  if (!conn || !sorteo || sorteo.anunciado) return
  sorteo.anunciado = true
  await conn.sendMessage(chatId, {
    text: textoApertura(sorteo),
    contextInfo: { ...(global.rcanal?.contextInfo || {}) },
  }).catch(() => {})
}

/**
 * Compra atómica de boletos. Retorna { ok, ... }.
 */
export async function comprarBoletos(chatId, userJid, cantidad) {
  const n = Math.floor(Number(cantidad))
  if (!Number.isFinite(n) || n < 1) return { ok: false, error: 'Cantidad inválida.' }
  const sorteo = obtenerSorteo(chatId)
  if (!sorteo) return { ok: false, error: 'No hay sorteo abierto. Usa *.loteria* para abrirlo.' }
  if (Date.now() >= sorteo.terminaEn) return { ok: false, error: 'El sorteo ya cerró. Espera el próximo pozo.' }

  const llave = `loteria-buy:${chatId}:${sorteo.horaId}:${userJid}:${Date.now()}:${Math.floor(Math.random() * 1e9)}`
  try {
    const res = await global.db.adapter.claimAndUpdate(global.db.data, llave, 60_000, (datos) => {
      const actual = datos?.[CLAVE]?.[chatId]
      if (!actual || actual.horaId !== sorteo.horaId || Date.now() >= actual.terminaEn) {
        return { claim: false, error: 'El sorteo ya cerró.' }
      }
      // Anti-pisado: si otro proceso recreó el pozo de la misma ventana,
      // no comprar sobre el objeto equivocado (se devuelve, reintenta).
      if (Number(actual.precioBoleto) !== Number(sorteo.precioBoleto) ||
          Number(actual.premioAnunciado) !== Number(sorteo.premioAnunciado)) {
        return { claim: false, error: 'El pozo se renovó. Revisa *.loteria* e inténtalo de nuevo.' }
      }
      actual.boletos = actual.boletos && typeof actual.boletos === 'object' ? actual.boletos : {}
      const mios = Number(actual.boletos[userJid]) || 0
      if (mios + n > MAX_BOLETOS_POR_USUARIO) {
        return { claim: false, error: `Máximo ${MAX_BOLETOS_POR_USUARIO} boletos por persona (ya tienes ${mios}).` }
      }
      const costo = n * Number(actual.precioBoleto)
      const totalTrasCompra = (Number(actual.premioAnunciado) || 0) + (Number(actual.pot) || 0) + costo
      if (totalTrasCompra > MAX_POZO) {
        return { claim: false, error: `Pozo lleno (${MAX_POZO.toLocaleString()} ${global.moneda || 'USD'} máximo). Espera el próximo.` }
      }
      const usuario = (datos.users[userJid] = datos.users[userJid] || {})
      if ((Number(usuario.coins) || 0) < costo) {
        return { claim: false, error: `No te alcanza: ${n} boleto(s) = ${costo.toLocaleString()} ${global.moneda || 'USD'}.` }
      }
      usuario.coins = (Number(usuario.coins) || 0) - costo
      actual.boletos[userJid] = mios + n
      actual.pot = (Number(actual.pot) || 0) + costo
      return { claim: true, boletos: actual.boletos[userJid], costo }
    })
    if (!res?.acquired || res?.result?.claim === false) {
      return { ok: false, error: res?.result?.error || 'No se pudo comprar.' }
    }
    return { ok: true, boletos: res.result.boletos, costo: res.result.costo }
  } catch (error) {
    return { ok: false, error: 'Inténtalo de nuevo en unos segundos.' }
  }
}

/**
 * Cierra el sorteo: sortea ganador o devuelve todo si no hay quórum.
 * Idempotente (marca premiado + claim): llamar dos veces no paga doble.
 */
export async function cerrarSorteo(conn, chatId) {
  const sorteo = obtenerSorteo(chatId)
  if (!sorteo || Date.now() < sorteo.terminaEn) return { cerrado: false }

  let adquirido = false
  try {
    adquirido = await global.db.adapter.claimCommand(global.db.data, `loteria-close:${chatId}:${sorteo.horaId}`, 30 * 60_000)
  } catch {
    adquirido = false
  }
  if (!adquirido) return { cerrado: false, duplicado: true }

  const entradas = Object.entries(sorteo.boletos || {}).filter(([, n]) => Number(n) > 0)
  const enviar = (texto, menciones = []) => {
    if (!conn || typeof conn.sendMessage !== 'function') return Promise.resolve()
    return conn.sendMessage(chatId, {
      text: texto,
      contextInfo: { ...(global.rcanal?.contextInfo || {}), ...(menciones.length ? { mentionedJid: menciones } : {}) },
    }).catch(() => {})
  }

  if (entradas.length < MIN_COMPRADORES) {
    for (const [jid, count] of entradas) {
      const llave = `loteria-ref:${chatId}:${sorteo.horaId}:${jid}`
      try {
        await global.db.adapter.claimAndUpdate(global.db.data, llave, 24 * 60 * 60_000, (datos) => {
          const usuario = (datos.users[jid] = datos.users[jid] || {})
          usuario.coins = (Number(usuario.coins) || 0) + Number(count) * Number(sorteo.precioBoleto)
          return { claim: true }
        })
      } catch {}
    }
    if (global.db?.data?.[CLAVE]) delete global.db.data[CLAVE][chatId]
    registrarCierreLoteria(chatId, entradas.length > 0)
    const proximoCierre = finHoraActual(new Date())
    await enviar(
      `
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *lotería cerrada sin ganador*
╰─ ✧  ✩
┊ faltó gente  ·  \`${entradas.length}/${MIN_COMPRADORES}\` participantes
┊ boletos devueltos íntegros
┊ próximo pozo  ·  cierra \`${horaCierreTexto(proximoCierre)}\` (en ${faltaParaTexto(proximoCierre)})
╰─────────`.trim()
    )
    return { cerrado: true, ganador: null }
  }

  const totalBoletos = entradas.reduce((s, [, n]) => s + Number(n), 0)
  let tiro = Math.random() * totalBoletos
  let ganador = entradas[0][0]
  for (const [jid, count] of entradas) {
    tiro -= Number(count)
    if (tiro <= 0) {
      ganador = jid
      break
    }
  }
  const premioFinal = Math.min(
    (Number(sorteo.premioAnunciado) || 0) + (Number(sorteo.pot) || 0),
    MAX_POZO
  )
  const boletosGanador = Number(sorteo.boletos[ganador]) || 0

  try {
    await global.db.adapter.claimAndUpdate(
      global.db.data,
      `loteria-win:${chatId}:${sorteo.horaId}`,
      24 * 60 * 60_000,
      (datos) => {
        const actual = datos?.[CLAVE]?.[chatId]
        if (!actual || actual.horaId !== sorteo.horaId) return { claim: false }
        if (actual.premiado === sorteo.horaId) return { claim: false }
        const usuario = (datos.users[ganador] = datos.users[ganador] || {})
        usuario.coins = (Number(usuario.coins) || 0) + premioFinal
        actual.premiado = sorteo.horaId
        return { claim: true }
      }
    )
  } catch {}
  if (global.db?.data?.[CLAVE]) delete global.db.data[CLAVE][chatId]
  registrarCierreLoteria(chatId, true)
  await aplicarComisionPareja(ganador, premioFinal, conn, chatId, null)
  const proximoCierre = finHoraActual(new Date())
  await enviar(
    `
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *lotería cerrada*
╰─ ✧  ✩
┊ ganador  ·  \`@${String(ganador).split('@')[0]}\` (con ${boletosGanador} boleto(s))
┊ premio  ·  \`${premioFinal.toLocaleString()} ${global.moneda || 'USD'}\`
┊ vendidos  ·  \`${totalBoletos}\` boletos
┊ próximo pozo  ·  cierra \`${horaCierreTexto(proximoCierre)}\` (en ${faltaParaTexto(proximoCierre)})
╰─────────`.trim(),
    [ganador]
  )
  return { cerrado: true, ganador, premio: premioFinal }
}

/** Grupos con mensajes en la ventana (para no spamear grupos muertos). */
function construirChatsActivos(ventanaMs = VENTANA_ACTIVIDAD_MS) {
  const activos = new Set()
  const usuarios = global.db?.data?.users
  if (!usuarios || typeof usuarios !== 'object') return activos
  const ahora = Date.now()
  for (const usuario of Object.values(usuarios)) {
    if (!usuario || typeof usuario !== 'object') continue
    if ((Number(usuario.lastMsgAt) || 0) < ahora - ventanaMs) continue
    const chat = usuario.lastMsgChat
    if (typeof chat === 'string' && chat.endsWith('@g.us')) activos.add(chat)
  }
  return activos
}

let ultimaAperturaHora = ''
let cacheActivos = new Set()

/**
 * Tick del principal (cada ~30s): abre pozos al cambiar la hora y
 * cierra los vencidos. Los cierres desde grupos con actividad los
 * resuelve cualquier proceso vía maybeCerrarSorteo (mejor anuncio).
 */
export async function tickLoteria(conn) {
  if (!global.db?.data || !conn?.user) return
  try {
    await global.db.adapter.refresh(global.db.data)
  } catch {}
  const ahora = new Date()
  const horaId = idHoraActual(ahora)

  if (horaId !== ultimaAperturaHora) {
    ultimaAperturaHora = horaId
    cacheActivos = construirChatsActivos()
    const terminaEn = finHoraActual(ahora)
    const chats = Object.keys(global.db.data.chats || {}).filter((id) => id.endsWith('@g.us'))
    for (const chatId of chats) {
      try {
        if (!juegosActivados(chatId)) continue
        if (!cacheActivos.has(chatId)) continue
        if (enDescansoLoteria(chatId)) continue
        if (enHorarioNocturno(chatId, ahora)) continue
        const { sorteo, nuevo } = await abrirSorteoActual(chatId)
        if (nuevo && sorteo) {
          sorteo.terminaEn = terminaEn
          await anunciarApertura(conn, chatId, sorteo)
        }
      } catch {}
    }
  }

  const mapa = global.db.data[CLAVE]
  if (!mapa || typeof mapa !== 'object') return
  for (const chatId of Object.keys(mapa)) {
    try {
      const sorteo = mapa[chatId]
      if (!sorteo || Date.now() < Number(sorteo.terminaEn)) continue
      await cerrarSorteo(conn, chatId)
    } catch {}
  }
}

/**
 * Cierre perezoso: cualquier mensaje en un grupo con sorteo vencido lo
 * cierra con el bot presente (mejor anuncio que el principal si no es
 * miembro). Barato: una lectura de mapa + comparar timestamps.
 */
export async function maybeCerrarSorteo(conn, chatId) {
  try {
    const sorteo = obtenerSorteo(chatId)
    if (!sorteo || Date.now() < Number(sorteo.terminaEn)) return false
    const res = await cerrarSorteo(conn, chatId)
    return Boolean(res?.cerrado)
  } catch {
    return false
  }
}

export {
  asegurarMapa as ensureLotteryMap,
  obtenerSorteo as getDraw,
  abrirSorteoActual as openCurrentDraw,
  comprarBoletos as buyTickets,
  cerrarSorteo as closeDraw,
  tickLoteria as lotteryTick,
  maybeCerrarSorteo as maybeCloseDraw,
}
