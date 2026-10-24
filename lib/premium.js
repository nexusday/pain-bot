/**
 * Premium de sub-bots (lado del bot).
 *
 * Cada sub-bot puede tener personalizaciones premium guardadas en
 * `Serbot/<número>/config.json` (`premiumEdits`). Se aplican SOLO mientras su
 * `premium.expiresAt` siga en el futuro: al caducar, la moneda, los textos del
 * menú y el canal vuelven al valor global al instante, sin borrar nada. Al
 * volver a mirar anuncios se reanudan solas.
 *
 * El reparto es por mensaje, no por proceso: todos los sub-bots de un worker
 * comparten el mismo `global.*`, así que el contexto se guarda en un
 * AsyncLocalStorage y `global.moneda` / `global.canal` / `global.rcanal` se
 * resuelven contra él. Así dos sub-bots con monedas distintas pueden atender
 * mensajes a la vez sin pisarse.
 */
import fs from 'node:fs'
import path from 'node:path'
import { AsyncLocalStorage } from 'node:async_hooks'

const contexto = new AsyncLocalStorage()
const cache = new Map()
const TTL_MS = 3000

const VACIO = Object.freeze({ activo: false, expiraEn: 0, moneda: '', menu: null, canal: null })

let monedaBase = 'USD'
let canalBase = null
let rcanalBase = null
let instalado = false

const URL_PROHIBIDA = /(https?:\/\/|www\.|wa\.me|t\.me|chat\.whatsapp)/i

function texto(valor, maximo = 40) {
  const limpio = String(valor ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim()
  if (!limpio) return ''
  if (URL_PROHIBIDA.test(limpio)) return ''
  return limpio.slice(0, maximo)
}

/** Texto largo (el menú completo): conserva los saltos de línea y los enlaces. */
function textoLargo(valor, maximo = 4000) {
  const limpio = String(valor ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .slice(0, maximo)
  return limpio.trim() ? limpio : ''
}

function monedaValida(valor) {
  const limpio = String(valor ?? '').replace(/[\r\n\t]+/g, ' ').trim()
  if (!limpio || limpio.length > 8) return ''
  if (URL_PROHIBIDA.test(limpio)) return ''
  if (!/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ$€£¥₽₹₺₴₦₱₩₪฿₫₡₲₵₸₼₾./\s-]+$/.test(limpio)) return ''
  return limpio
}

function jidNewsletter(valor) {
  const limpio = String(valor || '').trim()
  if (!/^\d{10,}@newsletter$/.test(limpio)) return ''
  return limpio
}

/** Arma el `rcanal` (etiqueta de canal) igual que el resto del bot. */
export function construirRcanalPremium(jid = '', name = '') {
  return {
    contextInfo: {
      isForwarded: true,
      forwardedNewsletterMessageInfo: {
        newsletterJid: jid,
        serverMessageId: 100,
        newsletterName: name || 'Canal',
      },
    },
  }
}

function rutaConfigSubBot(phone) {
  return path.join(process.cwd(), global.bot || 'Serbot', String(phone), 'config.json')
}

function interpretarConfig(config) {
  if (!config || typeof config !== 'object') return VACIO
  const premium = config.premium && typeof config.premium === 'object' ? config.premium : {}
  const expiraEn = Number(premium.expiresAt) || 0
  if (!(expiraEn > Date.now())) return VACIO
  const ediciones = config.premiumEdits && typeof config.premiumEdits === 'object' ? config.premiumEdits : {}
  const menu = ediciones.menu && typeof ediciones.menu === 'object' ? ediciones.menu : {}
  const canal = ediciones.canal && typeof ediciones.canal === 'object' ? ediciones.canal : {}
  const jid = jidNewsletter(canal.jid)
  return {
    activo: true,
    expiraEn,
    moneda: monedaValida(ediciones.moneda),
    menu: {
      creador: texto(menu.creador),
      hosting: texto(menu.hosting),
      donar: texto(menu.donar, 90),
      // Texto completo del menú: si existe, manda él sobre el resto.
      texto: textoLargo(menu.texto),
    },
    canal: jid ? { jid, nombre: texto(canal.nombre) || 'Canal' } : null,
  }
}

/** Datos premium del sub-bot `phone` (con caché corta por mensaje). */
export function premiumDeTelefono(phone) {
  const limpio = String(phone || '').replace(/\D/g, '')
  if (!limpio) return VACIO
  const ahora = Date.now()
  const anterior = cache.get(limpio)
  if (anterior && ahora - anterior.leido < TTL_MS) return anterior.datos
  let datos = VACIO
  try {
    datos = interpretarConfig(JSON.parse(fs.readFileSync(rutaConfigSubBot(limpio), 'utf8')))
  } catch {
    datos = VACIO
  }
  cache.set(limpio, { leido: ahora, datos })
  return datos
}

/** Teléfono del socket de un sub-bot (carpeta de sesión o JID). */
export function telefonoDeConexion(conn) {
  try {
    if (conn?.pathAYBot) {
      const carpeta = String(conn.pathAYBot).split(/[\\/]/).filter(Boolean).pop() || ''
      const digitos = carpeta.replace(/\D/g, '')
      if (digitos) return digitos
    }
    for (const valor of [conn?.botNumber, conn?.phoneNumber, conn?.user?.jid, conn?.user?.id, conn?.authState?.creds?.me?.id]) {
      const digitos = String(valor || '').split('@')[0].split(':')[0].replace(/\D/g, '')
      if (digitos) return digitos
    }
  } catch {}
  return ''
}

/**
 * Ejecuta el manejo de un mensaje dentro del contexto de ese sub-bot.
 * Todo lo que se lea de `global.moneda` / `global.canal` / `global.rcanal`
 * dentro de `fn` (incluidas promesas y timers encadenados) ve sus datos.
 */
export function ejecutarEnContextoBot(conn, fn) {
  const telefono = telefonoDeConexion(conn)
  if (!telefono) return fn()
  return contexto.run({ telefono }, fn)
}

function premiumEnContexto() {
  const almacen = contexto.getStore()
  if (!almacen?.telefono) return null
  return premiumDeTelefono(almacen.telefono)
}

/** Resuelve el `global.moneda` efectivo del mensaje en curso. */
export function monedaEfectiva() {
  const premium = premiumEnContexto()
  if (premium?.activo && premium.moneda) return premium.moneda
  return monedaBase
}

/** Resuelve el `global.canal` efectivo del mensaje en curso. */
export function canalEfectivo() {
  const premium = premiumEnContexto()
  if (premium?.activo && premium.canal) return premium.canal
  return canalBase
}

/** Resuelve el `global.rcanal` (etiqueta de canal) del mensaje en curso. */
export function rcanalEfectivo() {
  const premium = premiumEnContexto()
  if (premium?.activo && premium.canal) return construirRcanalPremium(premium.canal.jid, premium.canal.nombre)
  return rcanalBase
}

/** Textos premium del menú, o null si no hay premium activo. */
export function textosMenuPremium() {
  const premium = premiumEnContexto()
  if (!premium?.activo || !premium.menu) return null
  const { creador, hosting, donar, texto: menuTexto } = premium.menu
  if (!creador && !hosting && !donar && !menuTexto) return null
  return { creador, hosting, donar, ...(menuTexto ? { texto: menuTexto } : {}) }
}

/** Canal premium de un socket concreto (para seguirlo al conectar). */
export function canalPremiumDeConexion(conn) {
  const premium = premiumDeTelefono(telefonoDeConexion(conn))
  if (!premium?.activo || !premium.canal?.jid) return null
  return premium.canal
}

/**
 * Instala `moneda`, `canal` y `rcanal` como propiedades del contexto global.
 * Se llama una vez desde config.js, ANTES de asignar los valores por defecto,
 * de modo que esas asignaciones siguen funcionando (van al setter).
 */
export function instalarContextoPremium({ moneda = 'USD' } = {}) {
  monedaBase = String(moneda || 'USD')
  if (instalado) return
  instalado = true
  const definicion = (nombre, leer, escribir) => {
    try {
      Object.defineProperty(globalThis, nombre, {
        configurable: true,
        enumerable: true,
        get: leer,
        set: escribir,
      })
    } catch {}
  }
  definicion('moneda', monedaEfectiva, (valor) => { monedaBase = String(valor || 'USD') })
  definicion('canal', canalEfectivo, (valor) => { canalBase = valor })
  definicion('rcanal', rcanalEfectivo, (valor) => { rcanalBase = valor })
}

/** Vacía la caché de configs (tests y recargas en caliente). */
export function limpiarCachePremium() {
  cache.clear()
}
