import { borrarCredencialesPrincipales, leerCredencialesPrincipales, rutaCredencialesPrincipales } from '../main-session.js'

/**
 * Gestión del bot principal desde el panel web: consultar el estado,
 * pedir un código de emparejamiento, desvincular el número y reiniciar el
 * proceso. Solo el proceso principal expone el socket real, así que todas
 * las operaciones devuelven un error claro cuando el panel corre aislado.
 */

export class MainBotError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

function socketPrincipal() {
  const conn = global.conn
  if (!conn || conn._painPlaceholder) return null
  return conn
}

export function socketAbierto(conn) {
  try {
    if (!conn) return false
    if (conn.ws?.isOpen === true) return true
    return (conn.ws?.socket?.readyState ?? conn.ws?.readyState) === 1
  } catch {
    return false
  }
}

function numeroDelPrincipal(conn) {
  const id = conn?.user?.id || conn?.authState?.creds?.me?.id || ''
  const digitos = String(id).split(':')[0].replace(/\D/g, '')
  return digitos || null
}

/** Estado del bot principal tal y como lo ve el panel. */
export function estadoPrincipal() {
  const conn = socketPrincipal()
  const credenciales = leerCredencialesPrincipales()
  const base = {
    available: false,
    linked: false,
    connected: false,
    phone: null,
    name: null,
    jid: null,
    pendingCode: false,
    canRequestCode: false,
    hasLocalCreds: Boolean(credenciales),
    authDir: rutaCredencialesPrincipales(),
  }
  if (!conn) return base

  const linked = Boolean(conn?.authState?.creds?.registered)
  const connected = socketAbierto(conn)
  return {
    ...base,
    available: true,
    linked,
    connected,
    phone: numeroDelPrincipal(conn),
    name: conn?.user?.name || credenciales?.me?.name || null,
    jid: conn?.user?.id || conn?.authState?.creds?.me?.id || null,
    pendingCode: Boolean(conn?.authState?.creds?.pairingCode),
    canRequestCode: !linked && connected && typeof conn.requestPairingCode === 'function',
    hasLocalCreds: Boolean(credenciales),
  }
}

/** Pide un código de 8 dígitos para vincular el número del bot principal. */
export async function solicitarCodigoPrincipal(phone) {
  const conn = socketPrincipal()
  if (!conn) {
    throw new MainBotError('main_unavailable', 'El bot principal no está disponible en este proceso.')
  }
  if (conn?.authState?.creds?.registered) {
    throw new MainBotError('main_already_linked', 'El bot principal ya está vinculado. Desvincúlalo antes de generar un código nuevo.')
  }
  const numero = String(phone || '').replace(/\D/g, '')
  if (numero.length < 8 || numero.length > 15) {
    throw new MainBotError('invalid_phone', 'El número de WhatsApp no es válido.')
  }
  if (!socketAbierto(conn)) {
    throw new MainBotError('main_socket_closed', 'El socket del bot principal está cerrado. Reinicia el proceso para volver a intentarlo.')
  }
  if (typeof conn.requestPairingCode !== 'function') {
    throw new MainBotError('unsupported', 'Esta versión de Baileys no permite emparejar el principal con un código.')
  }

  let code = null
  try {
    code = await conn.requestPairingCode(numero)
  } catch (error) {
    throw new MainBotError('request_failed', error?.message || 'No se pudo generar el código de vinculación.')
  }
  if (!code) {
    throw new MainBotError('request_failed', 'WhatsApp no devolvió un código de vinculación.')
  }

  return { code: String(code), phone: numero, expiresIn: 90_000 }
}

/**
 * Desvincula el número del bot principal: cierra la sesión en WhatsApp y
 * borra las credenciales locales. El proceso NO se reinicia y el panel web
 * sigue en pie: se crea un socket principal nuevo (sin credenciales) para
 * poder emparejar otro número sin cortar la web.
 */
export async function desvincularPrincipal() {
  const conn = socketPrincipal()
  if (!conn) {
    throw new MainBotError('main_unavailable', 'El bot principal no está disponible en este proceso.')
  }
  const phone = numeroDelPrincipal(conn)
  if (!conn?.authState?.creds?.registered) {
    throw new MainBotError('main_not_linked', 'El bot principal no está vinculado.')
  }

  try {
    await conn.logout('Desvinculado desde el panel web')
  } catch (error) {
    console.error('[webpanel] El cierre de sesión del principal falló:', error?.message || error)
  }

  // Impide que Baileys vuelva a guardar credenciales viejas y borra las que
  // quedaron en disco: el siguiente emparejamiento empieza desde cero.
  global.__painBloquearCreds = true
  borrarCredencialesPrincipales()

  const recreado = await recrearSocketPrincipal()
  return { ok: true, phone, restartRequired: !recreado, panelOnline: true }
}

/**
 * Crea un socket principal nuevo y sin credenciales, sin reiniciar el
 * proceso. Lo usa el panel para re-vincular otro número sin cortar la web.
 */
export async function recrearSocketPrincipal() {
  const reinicio = global.reiniciarPrincipalLimpio
  if (typeof reinicio !== 'function') return false
  try {
    await reinicio()
    return true
  } catch (error) {
    console.error('[webpanel] No se pudo recrear el socket del principal:', error?.message || error)
    return false
  }
}

/**
 * Cambia el número del principal y deja un código listo para confirmar:
 * desvincula, recrea el socket y pide el código en el acto. El panel web
 * nunca se detiene.
 */
export async function relinkPrincipal(phone) {
  const estado = estadoPrincipal()
  if (estado.linked) {
    await desvincularPrincipal()
  } else if (!estado.connected) {
    const recreado = await recrearSocketPrincipal()
    if (!recreado) {
      throw new MainBotError('main_socket_closed', 'El socket del bot principal está cerrado. Reinicia el proceso para poder emparejar.')
    }
  }
  return solicitarCodigoPrincipal(phone)
}

/**
 * Reinicia el proceso principal. Se usa el mismo código de salida que el
 * resto del bot (1) para que el supervisor lo vuelva a levantar.
 */
export function programarReinicioPrincipal(delayMs = 1500) {
  console.log('[webpanel] Reinicio del proceso principal solicitado desde el panel.')
  setTimeout(() => {
    try { process.exit(1) } catch {}
  }, Math.max(0, Number(delayMs) || 0)).unref?.()
  return true
}
