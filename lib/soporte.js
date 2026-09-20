import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync
} from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { esBotPrincipal, numeroBotDe } from './staff.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIR_RAIZ = join(__dirname, '..')
const RUTA_SOPORTE_PRINCIPAL = join(DIR_RAIZ, 'storage', 'soporte.json')

const cachePorRuta = new Map()

function carpetaSerbot() {
  return join(DIR_RAIZ, global.bot || 'Serbot')
}

export function rutaSoporteDe(conn) {
  if (esBotPrincipal(conn)) return RUTA_SOPORTE_PRINCIPAL
  const num = numeroBotDe(conn)
  if (!num) return RUTA_SOPORTE_PRINCIPAL
  return join(carpetaSerbot(), num, 'soporte.json')
}

export function rutaSoporteRelativa(conn) {
  const abs = rutaSoporteDe(conn)
  const rel = abs.startsWith(DIR_RAIZ) ? abs.slice(DIR_RAIZ.length + 1) : abs
  return rel.replace(/\\/g, '/')
}

function dataVacia() {
  return { link: '', buttonText: '『 Soporte 』' }
}

function normalizar(raw) {
  const base = dataVacia()
  if (!raw || typeof raw !== 'object') return base
  return {
    link: String(raw.link || '').trim(),
    buttonText: String(raw.buttonText || base.buttonText).trim().slice(0, 24) || base.buttonText
  }
}

function asegurarArchivo(ruta) {
  const dir = dirname(ruta)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  if (!existsSync(ruta)) {
    escribir(ruta, dataVacia())
  }
}

function escribir(ruta, data) {
  const payload = normalizar(data)
  const json = JSON.stringify(payload, null, 2)
  const tmp = ruta + '.tmp'
  const dir = dirname(ruta)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(tmp, json, 'utf8')
  try {
    renameSync(tmp, ruta)
  } catch {
    writeFileSync(ruta, json, 'utf8')
  }
  cachePorRuta.set(ruta, payload)
  return payload
}

function leer(ruta, forzar = false) {
  if (!forzar && cachePorRuta.has(ruta)) {
    return normalizar(cachePorRuta.get(ruta))
  }
  asegurarArchivo(ruta)
  try {
    const raw = JSON.parse(readFileSync(ruta, 'utf8'))
    const data = normalizar(raw)
    cachePorRuta.set(ruta, data)
    return data
  } catch {
    const vacio = dataVacia()
    cachePorRuta.set(ruta, vacio)
    return vacio
  }
}

/** Normaliza invite de grupo WhatsApp a URL completa */
export function normalizarLinkGrupo(raw = '') {
  let s = String(raw || '').trim().replace(/^<|>$/g, '')
  if (!s) return null

  // chat.whatsapp.com/XXX o con https
  const invite = s.match(/(?:https?:\/\/)?(?:www\.)?chat\.whatsapp\.com\/(?:invite\/)?([A-Za-z0-9_-]{10,})/i)
  if (invite) return `https://chat.whatsapp.com/${invite[1]}`

  // Solo el código
  if (/^[A-Za-z0-9_-]{10,}$/.test(s)) {
    return `https://chat.whatsapp.com/${s}`
  }

  // Cualquier https válido (por si usan otro link)
  if (/^https?:\/\//i.test(s)) {
    try {
      new URL(s)
      return s
    } catch {
      return null
    }
  }

  return null
}

export function obtenerSoporte(conn, forzar = false) {
  return leer(rutaSoporteDe(conn), forzar)
}

export function obtenerLinkSoporte(conn) {
  const data = obtenerSoporte(conn)
  return data.link || null
}

export function guardarLinkSoporte(conn, link, buttonText) {
  const ruta = rutaSoporteDe(conn)
  const actual = leer(ruta, true)
  const normalizado = normalizarLinkGrupo(link)
  if (!normalizado) throw new Error('link_invalido')

  return escribir(ruta, {
    link: normalizado,
    buttonText: buttonText || actual.buttonText
  })
}

export function quitarLinkSoporte(conn) {
  const ruta = rutaSoporteDe(conn)
  return escribir(ruta, dataVacia())
}

/** Botón nativeFlow cta_url para sendMessageLia */
export function construirBotonSoporte(conn) {
  const data = obtenerSoporte(conn)
  if (!data.link) return null
  return {
    text: data.buttonText || '『 Soporte 』',
    url: data.link
  }
}

export {
  obtenerSoporte as getSupport,
  obtenerLinkSoporte as getSupportLink,
  guardarLinkSoporte as setSupportLink,
  quitarLinkSoporte as clearSupportLink,
  construirBotonSoporte as buildSupportButton,
  normalizarLinkGrupo as normalizeGroupLink
}
