/* Pain-Bot — espera de reconexión con backoff.
 *
 * Un 428/408/503 de WhatsApp no se debe reintentar en 1 s: cientos de sockets
 * reconectando a la vez hacen que WhatsApp cierre otra vez la tanda y el bot
 * entra en una tormenta de conexiones (CPU alta, keepalives perdidos y más
 * 428). Este módulo concentra el cálculo para que sea igual en el bot
 * principal y en los sub-bots, y para poder probarlo sin abrir sockets.
 */

/** Códigos que suelen indicar límite de tasa o corte transitorio de WhatsApp. */
export const MOTIVOS_LIMITE = new Set([408, 428, 503])

/**
 * @param {object} opciones
 * @param {number|string} opciones.motivo Código de desconexión.
 * @param {number} [opciones.fallos] Fallos consecutivos ya acumulados.
 * @param {number} [opciones.reemplazos] Reemplazos (440) consecutivos.
 * @param {number} [opciones.baseMs] Base para cortes normales.
 * @param {number} [opciones.maxMs] Tope para cortes normales.
 * @param {number} [opciones.rateMinMs] Base para 428/408/503.
 * @param {number} [opciones.rateMaxMs] Tope para 428/408/503.
 * @param {number} [opciones.maxFallos] Fallos antes de esperar 60 s.
 * @param {() => number} [opciones.random] Inyectable para pruebas.
 * @returns {{ esperaMs: number, fallos: number, reemplazos: number, tipo: string }}
 */
export function calcularEsperaReconexion({
  motivo,
  fallos = 0,
  reemplazos = 0,
  baseMs = 3_000,
  maxMs = 45_000,
  rateMinMs = 15_000,
  rateMaxMs = 60_000,
  maxFallos = 10,
  random = Math.random,
} = {}) {
  const codigo = Number(motivo)
  const esReemplazo = codigo === 440
  const esReinicio = codigo === 515
  const esLimite = MOTIVOS_LIMITE.has(codigo)
  const jitterMax = esLimite ? 5_000 : 3_000
  const azar = Math.min(Math.max(Number(random()) || 0, 0), 0.999999)
  const jitter = Math.floor(azar * jitterMax)

  if (esReinicio) {
    // 515: el servidor pide reiniciar el socket. Es seguro hacerlo rápido.
    return { esperaMs: 300 + jitter, fallos, reemplazos, tipo: 'restart' }
  }
  if (esReemplazo) {
    // 440: otro socket abrió la misma sesión. Reintentar al instante crea un
    // ping-pong; la espera crece si se repite.
    const n = reemplazos + 1
    return {
      esperaMs: Math.min(10_000 * (2 ** Math.min(n - 1, 3)), 60_000) + jitter,
      fallos,
      reemplazos: n,
      tipo: 'replaced',
    }
  }
  const n = fallos + 1
  if (esLimite) {
    const esperaMs = n >= maxFallos
      ? 60_000
      : Math.min(rateMinMs * (2 ** Math.min(n - 1, 3)), rateMaxMs)
    return { esperaMs: esperaMs + jitter, fallos: n, reemplazos, tipo: 'rate' }
  }
  const esperaMs = n >= maxFallos
    ? 60_000
    : Math.min(baseMs * (2 ** Math.min(n - 1, 5)), maxMs)
  return { esperaMs: esperaMs + jitter, fallos: n, reemplazos, tipo: 'transient' }
}
