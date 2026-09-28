import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { esBotPrincipal, numeroBotDe } from './staff.js'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')

function rutaConfig(conn) {
  if (conn?.pathAYBot) return join(conn.pathAYBot, 'config.json')
  if (!conn || esBotPrincipal(conn)) return join(RAIZ, 'storage', 'main-config.json')
  const num = String(conn.botNumber || conn.phoneNumber || numeroBotDe(conn) || '').replace(/\D/g, '')
  if (!num) return join(RAIZ, 'storage', 'main-config.json')
  return join(RAIZ, global.bot || 'Serbot', num, 'config.json')
}

function leerConfig(ruta) {
  if (!existsSync(ruta)) return {}
  try {
    const datos = JSON.parse(readFileSync(ruta, 'utf8'))
    return datos && typeof datos === 'object' && !Array.isArray(datos) ? datos : {}
  } catch {
    return {}
  }
}

/** `ios` o `android`. Por defecto android (carrusel y botones). */
export function normalizarModoMenu(entrada) {
  const texto = String(entrada || '').trim().toLowerCase()
  if (['ios', 'i', 'iphone', 'apple'].includes(texto)) return 'ios'
  if (['android', 'a', 'and', 'droid'].includes(texto)) return 'android'
  return null
}

export function modoMenuDe(conn) {
  if (!conn) return 'android'
  if (conn.menuModo === 'ios' || conn.menuModo === 'android') return conn.menuModo
  const guardado = normalizarModoMenu(leerConfig(rutaConfig(conn)).menuModo) || 'android'
  conn.menuModo = guardado
  return guardado
}

export function esModoIos(conn) {
  return modoMenuDe(conn) === 'ios'
}

export function guardarModoMenu(conn, modo) {
  const ruta = rutaConfig(conn)
  const carpeta = dirname(ruta)
  if (!existsSync(carpeta)) mkdirSync(carpeta, { recursive: true })
  const datos = leerConfig(ruta)
  datos.menuModo = modo
  writeFileSync(ruta, JSON.stringify(datos, null, 2))
  if (conn) conn.menuModo = modo
  return modo
}
