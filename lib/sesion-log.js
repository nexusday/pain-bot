/**
 * Contención del ruido y del costo de libsignal.
 *
 * 1. `SessionCipher.decryptWithSessions` prueba TODAS las sesiones guardadas
 *    para un contacto. libsignal conserva decenas de sesiones cerradas y, en
 *    esta versión, `SessionRecord.removeOldSessions()` nunca se llama. Un
 *    registro con 40+ sesiones hace 40 intentos de criptografía por mensaje y
 *    además imprime un stack por cada fallo con `console.error` directo.
 *    Eso es lo que satura la CPU y el log con 100+ subbots.
 * 2. El parche anterior bloqueaba crear una sesión nueva durante 2 minutos.
 *    Eso impide aplicar un cambio de identidad (force=true) y deja la sesión
 *    rota fallando una y otra vez. Ahora está desactivado por defecto.
 * 3. Los stacks de libsignal se silencian y se resume el conteo cada minuto.
 */
import { createRequire } from 'module'
import { existsSync } from 'fs'

const require = createRequire(import.meta.url)

// 0 = no bloquear la renovación de sesión (recomendado).
const GRACIA_SESION_MS = Math.min(
  Math.max(Number.parseInt(process.env.PAIN_SIGNAL_SESSION_GRACE_MS, 10) || 0, 0),
  120_000
)
// Intentos máximos por mensaje. La sesión abierta siempre va primero.
const MAX_SESIONES_INTENTO = Math.min(
  Math.max(Number.parseInt(process.env.PAIN_SIGNAL_MAX_SESSIONS, 10) || 6, 1),
  20
)
// Sesiones que se conservan en el registro antes de podar las más viejas.
const MAX_SESIONES_GUARDADAS = Math.min(
  Math.max(Number.parseInt(process.env.PAIN_SIGNAL_KEEP_SESSIONS, 10) || 10, MAX_SESIONES_INTENTO),
  40
)

function conservarSesionReciente(SessionBuilder) {
  if (GRACIA_SESION_MS <= 0) return
  if (!SessionBuilder?.prototype?.initOutgoing || SessionBuilder.prototype._painSinReemplazo) return
  const original = SessionBuilder.prototype.initOutgoing
  SessionBuilder.prototype.initOutgoing = async function (device) {
    try {
      const direccion = this.addr.toString()
      const registro = await this.storage.loadSession(direccion)
      const abierta = registro?.getOpenSession?.()
      const creada = abierta?.indexInfo?.created || 0
      if (creada && Date.now() - creada < GRACIA_SESION_MS) return
    } catch {}
    return original.call(this, device)
  }
  SessionBuilder.prototype._painSinReemplazo = true
}

function limitarSesiones(SessionRecord) {
  const proto = SessionRecord?.prototype
  if (!proto?.getSessions || proto._painSesionesLimitadas) return
  const original = proto.getSessions

  proto.getSessions = function () {
    let todas
    try {
      todas = original.call(this)
    } catch {
      return []
    }
    if (!Array.isArray(todas) || todas.length === 0) return todas || []

    const abierta = typeof this.getOpenSession === 'function' ? this.getOpenSession() : null
    const ordenadas = abierta
      ? [abierta, ...todas.filter((sesion) => sesion !== abierta)]
      : todas

    // Poda real del registro: sin esto el archivo de sesión crece sin límite
    // y cada mensaje vuelve a recorrer decenas de sesiones muertas.
    if (todas.length > MAX_SESIONES_GUARDADAS && this.sessions && typeof this.sessions === 'object') {
      const conservar = new Set(ordenadas.slice(0, MAX_SESIONES_GUARDADAS))
      for (const sesion of todas) {
        if (conservar.has(sesion)) continue
        try {
          const clave = sesion?.indexInfo?.baseKey?.toString('base64')
          if (clave) delete this.sessions[clave]
        } catch {}
      }
    }

    return ordenadas.slice(0, MAX_SESIONES_INTENTO)
  }
  proto._painSesionesLimitadas = true
}

function aplicarGuardas(libsignal) {
  try { conservarSesionReciente(libsignal.SessionBuilder) } catch {}
  try { limitarSesiones(libsignal.SessionRecord) } catch {}
}

for (const ruta of ['libsignal', '@itsliaaa/baileys/node_modules/libsignal']) {
  try {
    if (ruta.includes('node_modules') && !existsSync(require.resolve(ruta))) continue
    aplicarGuardas(require(ruta))
  } catch {}
}

const AVISOS = [
  'Closing session',
  'Opening session',
  'Removing old closed session',
  'Migrating session',
  'Session already closed',
  'Session already open',
  'Closing stale open session',
  'Closing open session in favor of incoming prekey bundle',
  'Decrypted message with closed session',
]

const ERRORES_DESCIFRADO = [
  'Failed to decrypt message with any known session',
  'Session error:',
  'Bad MAC',
  'Key used already or never filled',
  'No matching sessions found for message',
  'No session record',
  'No sessions available',
]

function pareceSesion(valor) {
  return Boolean(valor && typeof valor === 'object' && (valor.currentRatchet || valor.indexInfo || valor._chains))
}

// Nuestros propios avisos empiezan por un prefijo entre corchetes
// (`[canal]`, `[primary]`, `[supervisor]`, `[webpanel]`...). Nunca se ocultan:
// un mensaje del bot puede mencionar "Bad MAC" o "Session error" sin ser ruido
// de libsignal, y ocultarlo dejaba caídas del proceso sin explicación.
function esAvisoPropio(primero) {
  return typeof primero === 'string' && /^\s*\[[a-zA-Z0-9_-]+\]/.test(primero)
}

function esVolcadoDeSesion(args) {
  if (esAvisoPropio(args[0])) return false
  if (args.some(pareceSesion)) return true
  const primero = args[0]
  if (typeof primero !== 'string') return false
  return AVISOS.some((aviso) => primero.startsWith(aviso))
}

function esErrorDescifrado(args) {
  const primero = args[0]
  if (typeof primero !== 'string') return false
  if (esAvisoPropio(primero)) return false
  const limpio = primero.trimStart()
  // Debe EMPEZAR con el aviso de libsignal. Antes se usaba `includes`, así que
  // cualquier error nuestro que mencionara "Bad MAC" dentro del texto se
  // ocultaba (y con él la causa de una caída).
  return ERRORES_DESCIFRADO.some((texto) => limpio.startsWith(texto))
}

let erroresDescifrado = 0
let ultimoResumenDescifrado = 0

for (const metodo of ['info', 'warn', 'log', 'error']) {
  const original = console[metodo].bind(console)
  console[metodo] = (...args) => {
    if (metodo === 'error' && esErrorDescifrado(args)) {
      erroresDescifrado++
      const ahora = Date.now()
      if (ahora - ultimoResumenDescifrado >= 60_000) {
        const total = erroresDescifrado
        erroresDescifrado = 0
        ultimoResumenDescifrado = ahora
        // Se usa el console original para no volver a entrar al filtro.
        original(`[libsignal] ${total} error(es) de descifrado silenciados en el último minuto.`)
      }
      return
    }
    if (esVolcadoDeSesion(args)) return
    return original(...args)
  }
}
