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

const IDIOMAS = new Set(['es', 'en', 'pt'])

/** `es`, `en` o `pt`. `/setlen in` es inglés y `/setlen pt` es portugués. */
export function normalizarIdioma(entrada) {
  const texto = String(entrada || '').trim().toLowerCase()
  if (['es', 'spa', 'spanish', 'español', 'espanol'].includes(texto)) return 'es'
  if (['en', 'in', 'eng', 'english', 'ingles', 'inglés', 'ing'].includes(texto)) return 'en'
  if (['pt', 'por', 'br', 'portugues', 'português', 'portuguese', 'portuges'].includes(texto)) return 'pt'
  return null
}

export function codigoVisible(lang) {
  if (lang === 'en') return 'in'
  if (lang === 'pt') return 'pt'
  return 'es'
}

export function nombreIdioma(lang) {
  if (lang === 'en') return 'english'
  if (lang === 'pt') return 'português'
  return 'español'
}

export function idiomaDe(conn) {
  if (!conn) return 'es'
  if (IDIOMAS.has(conn.lang)) return conn.lang
  const guardado = normalizarIdioma(leerConfig(rutaConfig(conn)).lang) || 'es'
  conn.lang = guardado
  return guardado
}

export function aplicarIdioma(conn) {
  if (!conn) return 'es'
  delete conn.lang
  return idiomaDe(conn)
}

export function guardarIdioma(conn, lang) {
  const ruta = rutaConfig(conn)
  const carpeta = dirname(ruta)
  if (!existsSync(carpeta)) mkdirSync(carpeta, { recursive: true })
  const datos = leerConfig(ruta)
  datos.lang = lang
  writeFileSync(ruta, JSON.stringify(datos, null, 2))
  if (conn) conn.lang = lang
  return lang
}

export function tr(conn, espanol, ingles, portugues) {
  const lang = idiomaDe(conn)
  if (lang === 'en') return ingles
  if (lang === 'pt') return portugues || espanol
  return espanol
}
