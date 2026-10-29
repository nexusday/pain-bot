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

const VACIO = Object.freeze({ activo: false, expiraEn: 0, moneda: '', menu: null, canal: null, comandosOcultos: [] })

let monedaBase = 'USD'
let canalBase = null
let rcanalBase = null
let instalado = false

const URL_PROHIBIDA = /(https?:\/\/|www\.|wa\.me|t\.me|chat\.whatsapp)/i
const IMAGEN_COMANDO = /^(?:https?:\/\/\S+|data:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+)$/i

function normalizarComandosRuntime(valor) {
  if (!Array.isArray(valor)) return []
  return valor.slice(0, 50).map((item) => {
    const name = String(item?.name || '').trim().toLowerCase()
    const response = String(item?.response || '').trim().slice(0, 2000)
    if (!/^[a-záéíóúñ][\wáéíóúñ-]{1,30}$/i.test(name) || (!response && !IMAGEN_COMANDO.test(String(item?.image || '')))) return null
    const plugin = /^plugins\/premium-[\wáéíóúñ-]+\.js$/i.test(String(item?.plugin || '')) ? String(item.plugin) : ''
    const source = String(item?.source || '').slice(0, 20_000)
    return { name, response, ...(plugin ? { plugin } : {}), ...(source ? { source } : {}) }
  }).filter(Boolean)
}

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
  const tieneEdiciones = config.premiumEdits && typeof config.premiumEdits === 'object'
  const ediciones = tieneEdiciones ? config.premiumEdits : {}
  // La ausencia del campo conserva el canal oficial. En cambio, el panel
  // siempre guarda `canal`; si sus dos campos están vacíos, es una elección
  // explícita de no mostrar ningún canal.
  const canalConfigurado = tieneEdiciones && Object.prototype.hasOwnProperty.call(ediciones, 'canal')
  const menu = ediciones.menu && typeof ediciones.menu === 'object' ? ediciones.menu : {}
  const canal = ediciones.canal && typeof ediciones.canal === 'object' ? ediciones.canal : {}
  const comandosOcultos = Array.isArray(ediciones.comandosOcultos)
    ? [...new Set(ediciones.comandosOcultos.map((v) => String(v || '').trim().toLowerCase()).filter((v) => /^[\wáéíóúñ-]{1,40}$/i.test(v)))]
    : []
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
    canalConfigurado,
    comandosOcultos,
    comandos: normalizarComandosRuntime(ediciones.comandos),
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

export function comandosPersonalizadosPremium() {
  const premium = premiumEnContexto()
  return premium?.activo ? premium.comandos || [] : []
}

export function establecerComandoPremium(command) {
  const store = contexto.getStore()
  if (store) store.comando = String(command || '').toLowerCase()
}

export function interpolarComandoPremium(texto, datos = {}) {
  return String(texto || '').replace(/\{(usuario|grupo|fecha|hora|bot)\}/gi, (_, clave) => String(datos[clave.toLowerCase()] ?? `{${clave}}`))
}

export function guardarComandosPersonalizados(comandos) {
  const telefono = contexto.getStore()?.telefono
  if (!telefono) throw new Error('Este comando solo funciona desde un sub-bot.')
  const archivo = rutaConfigSubBot(telefono)
  let config = {}
  try { config = JSON.parse(fs.readFileSync(archivo, 'utf8')) || {} } catch {}
  const premiumEdits = config.premiumEdits && typeof config.premiumEdits === 'object' ? config.premiumEdits : {}
  const lista = Array.isArray(comandos) ? comandos : []
  const carpeta = path.join(path.dirname(archivo), 'plugins')
  fs.mkdirSync(carpeta, { recursive: true })
  const guardados = lista.map((item) => {
    const name = String(item?.name || '').toLowerCase().replace(/[^a-z0-9áéíóúñ_-]/gi, '-').slice(0, 32)
    const plugin = `plugins/premium-${name}.js`
    fs.writeFileSync(path.join(carpeta, `premium-${name}.js`), `const response = ${JSON.stringify(String(item?.response || '').slice(0, 2000))}\nconst handler = async (m, { conn }) => conn.sendMessage(m.chat, { text: response }, { quoted: m })\nhandler.command = [${JSON.stringify(name)}]\nexport default handler\n`, 'utf8')
    return { ...item, name, plugin }
  })
  config.premiumEdits = { ...premiumEdits, comandos: guardados }
  fs.mkdirSync(path.dirname(archivo), { recursive: true })
  fs.writeFileSync(archivo, JSON.stringify(config, null, 2))
  cache.delete(String(telefono))
  return guardados
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
  if (premium?.activo && premium.canalConfigurado) return premium.canal
  return canalBase
}

/** Resuelve el `global.rcanal` (etiqueta de canal) del mensaje en curso. */
export function rcanalEfectivo() {
  const premium = premiumEnContexto()
  if (premium?.activo && premium.canalConfigurado) {
    return premium.canal
      ? construirRcanalPremium(premium.canal.jid, premium.canal.nombre)
      : { contextInfo: {} }
  }
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

/** Comandos que solo este sub-bot premium debe ocultar del menú/sugerencias. */
export function comandosOcultosPremium() {
  const premium = premiumEnContexto()
  return premium?.activo ? new Set(premium.comandosOcultos || []) : new Set()
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
