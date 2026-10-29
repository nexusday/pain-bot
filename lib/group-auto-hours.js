import { esteBotCoincideConActivo, obtenerBotActivoDelGrupo } from '../plugins/modo-sub.js'

const ZONAS = {
  gm: 'UTC',
  gmt: 'UTC',
  utc: 'UTC',
  peru: 'America/Lima',
  pe: 'America/Lima',
  mexico: 'America/Mexico_City',
  mx: 'America/Mexico_City',
  colombia: 'America/Bogota',
  co: 'America/Bogota',
  ecuador: 'America/Guayaquil',
  ec: 'America/Guayaquil',
  bolivia: 'America/La_Paz',
  bo: 'America/La_Paz',
  chile: 'America/Santiago',
  cl: 'America/Santiago',
  argentina: 'America/Argentina/Buenos_Aires',
  ar: 'America/Argentina/Buenos_Aires',
  brasil: 'America/Sao_Paulo',
  brazil: 'America/Sao_Paulo',
  br: 'America/Sao_Paulo',
  venezuela: 'America/Caracas',
  ve: 'America/Caracas',
  paraguay: 'America/Asuncion',
  py: 'America/Asuncion',
  uruguay: 'America/Montevideo',
  uy: 'America/Montevideo',
  españa: 'Europe/Madrid',
  espana: 'Europe/Madrid',
  spain: 'Europe/Madrid',
  es: 'Europe/Madrid',
}

const MINUTO = 60_000
const revisiones = new WeakMap()
const conexiones = new Set()
let temporizador = null

function textoNormalizado(valor) {
  return String(valor || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function zonaValida(zona) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zona }).format()
    return true
  } catch {
    return false
  }
}

export function resolverZona(valor) {
  const clave = textoNormalizado(valor)
  const zona = ZONAS[clave] || String(valor || '').trim()
  return zonaValida(zona) ? zona : null
}

export function analizarHora(valor) {
  const texto = String(valor || '').trim().toLowerCase().replace(/\./g, '')
  const match = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/.exec(texto)
  if (!match) return null
  let hora = Number(match[1])
  const minuto = Number(match[2] || 0)
  const meridiano = match[3]
  if (minuto > 59) return null
  if (meridiano) {
    if (hora < 1 || hora > 12) return null
    if (meridiano === 'am') hora = hora === 12 ? 0 : hora
    else hora = hora === 12 ? 12 : hora + 12
  } else if (hora > 23) return null
  return { hora, minuto, total: hora * 60 + minuto, texto: `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}` }
}

export function crearHorario(zonaTexto, inicioTexto, cierreTexto) {
  const zona = resolverZona(zonaTexto)
  const inicio = analizarHora(inicioTexto)
  const cierre = analizarHora(cierreTexto)
  if (!zona) throw new Error('Zona horaria no válida. Usa Peru, Mexico, Colombia, GMT/UTC u otra zona IANA.')
  if (!inicio || !cierre) throw new Error('Hora no válida. Ejemplos: 8:00 am, 10:00 pm o 22:00.')
  if (inicio.total === cierre.total) throw new Error('La hora de apertura y cierre no pueden ser iguales.')
  return {
    enabled: true,
    timezone: zona,
    timezoneLabel: String(zonaTexto).trim(),
    open: inicio.texto,
    close: cierre.texto,
    openMinutes: inicio.total,
    closeMinutes: cierre.total,
    updatedAt: Date.now(),
  }
}

function horaLocal(zona) {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: zona,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date())
  const valores = Object.fromEntries(partes.map(({ type, value }) => [type, value]))
  return Number(valores.hour) * 60 + Number(valores.minute)
}

export function horarioEstaAbierto(horario, ahora = horaLocal(horario.timezone)) {
  if (horario.openMinutes < horario.closeMinutes) {
    return ahora >= horario.openMinutes && ahora < horario.closeMinutes
  }
  return ahora >= horario.openMinutes || ahora < horario.closeMinutes
}

export function formatearHora(minutos) {
  const hora24 = Math.floor(minutos / 60) % 24
  const minuto = minutos % 60
  const sufijo = hora24 >= 12 ? 'pm' : 'am'
  const hora12 = hora24 % 12 || 12
  return `${hora12}:${String(minuto).padStart(2, '0')} ${sufijo}`
}

export function resumenHorario(horario) {
  return `${horario.timezoneLabel || horario.timezone}: ${formatearHora(horario.openMinutes)} - ${formatearHora(horario.closeMinutes)}`
}

export function siguienteCambio(horario, ahora = horaLocal(horario.timezone)) {
  const abierto = horarioEstaAbierto(horario, ahora)
  return {
    abierto,
    hora: formatearHora(abierto ? horario.closeMinutes : horario.openMinutes),
    tipo: abierto ? 'cierre' : 'apertura',
  }
}

function obtenerHorario(chatId) {
  const chat = global.db?.data?.chats?.[chatId]
  return chat?.rab && typeof chat.rab === 'object' ? chat.rab : null
}

export function guardarHorario(chatId, horario) {
  const chat = global.db.data.chats[chatId] ||= {}
  chat.rab = horario
  return horario
}

export function desactivarHorario(chatId) {
  const horario = obtenerHorario(chatId)
  if (!horario) return null
  horario.enabled = false
  horario.updatedAt = Date.now()
  return horario
}

export function activarHorario(chatId) {
  const horario = obtenerHorario(chatId)
  if (!horario) return null
  horario.enabled = true
  horario.updatedAt = Date.now()
  return horario
}

function registrarConexion(conn) {
  if (!conn) return
  conexiones.add(conn)
  if (temporizador) return
  temporizador = setInterval(() => {
    for (const conexion of conexiones) void revisarTodosLosGrupos(conexion)
  }, 30_000)
  temporizador.unref?.()
}

async function cambiarEstado(conn, chatId, abierto, horario, motivo = 'horario') {
  const clave = `${chatId}:${abierto ? 'open' : 'close'}`
  const meta = conn.chats?.[chatId]?.metadata || await conn.groupMetadata(chatId)
  if (!meta) return false
  const yaAbierto = !meta.announce
  if (yaAbierto === abierto) {
    const mapa = revisiones.get(conn) || new Map()
    mapa.set(chatId, clave)
    revisiones.set(conn, mapa)
    return false
  }
  await conn.groupSettingUpdate(chatId, abierto ? 'not_announcement' : 'announcement')
  if (conn.chats?.[chatId]?.metadata) conn.chats[chatId].metadata.announce = !abierto
  const mapa = revisiones.get(conn) || new Map()
  mapa.set(chatId, clave)
  revisiones.set(conn, mapa)
  const siguiente = formatearHora(abierto ? horario.closeMinutes : horario.openMinutes)
  await conn.sendMessage(chatId, {
    text: abierto
      ? `🌴 𝗚𝗿𝘂𝗽𝗼 𝗮𝗯𝗶𝗲𝗿𝘁𝗼 𝗮𝘂𝘁𝗼𝗺𝗮́𝘁𝗶𝗰𝗮𝗺𝗲𝗻𝘁𝗲\n\n> *Próximo cierre:* ${siguiente}\n> *Zona:* ${horario.timezoneLabel || horario.timezone}`
      : `🌴 𝗚𝗿𝘂𝗽𝗼 𝗰𝗲𝗿𝗿𝗮𝗱𝗼 𝗮𝘂𝘁𝗼𝗺𝗮́𝘁𝗶𝗰𝗮𝗺𝗲𝗻𝘁𝗲\n\n> *Próxima apertura:* ${siguiente}\n> *Zona:* ${horario.timezoneLabel || horario.timezone}`,
    contextInfo: { ...(global.rcanal?.contextInfo || {}) },
  }).catch(error => console.error(`[rab] No se pudo avisar en ${chatId}:`, error?.message || error))
  return true
}

export async function revisarHorario(conn, chatId) {
  registrarConexion(conn)
  const horario = obtenerHorario(chatId)
  if (!horario?.enabled || !horario.timezone || !Number.isInteger(horario.openMinutes) || !Number.isInteger(horario.closeMinutes)) return false
  const botActivo = obtenerBotActivoDelGrupo(chatId)
  if (botActivo) {
    const participantes = conn.chats?.[chatId]?.metadata?.participants || []
    if (!esteBotCoincideConActivo(conn, botActivo, participantes)) return false
  }
  const abierto = horarioEstaAbierto(horario)
  try {
    return await cambiarEstado(conn, chatId, abierto, horario)
  } catch (error) {
    console.error(`[rab] No se pudo aplicar el horario de ${chatId}:`, error?.message || error)
    return false
  }
}

async function revisarTodosLosGrupos(conn) {
  const chats = global.db?.data?.chats || {}
  for (const chatId of Object.keys(chats)) {
    if (chatId.endsWith('@g.us')) await revisarHorario(conn, chatId)
  }
}

// Permite que el horario empiece a vigilarse después de un reinicio aunque
// todavía no haya llegado ningún mensaje al grupo.
const vigilarConexionGlobal = setInterval(() => {
  const conn = global.conn
  if (conn && !conexiones.has(conn)) registrarConexion(conn)
}, 30_000)
vigilarConexionGlobal.unref?.()

export function invalidarEstadoHorario(conn, chatId) {
  revisiones.get(conn)?.delete(chatId)
}
