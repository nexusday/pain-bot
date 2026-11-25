/**
 * Errores de red transitorios que NO deben tumbar el proceso.
 *
 * Node 25 usa undici para `fetch`. Cuando una descarga se aborta (timeout,
 * socket cortado por el proveedor, WhatsApp/IA que cierra la conexión) puede
 * escapar un `TypeError: terminated` desde `Fetch.onAborted`. En un despliegue
 * de un solo proceso eso reiniciaba TODO el bot: los 187 sub-bots se
 * desconectaban y empezaba la tormenta de 408.
 */
export function esErrorDeRedBenigno(error) {
  const partes = [
    error?.name,
    error?.message,
    error?.code,
    error?.cause?.name,
    error?.cause?.message,
    error?.cause?.code,
  ]
  const texto = partes.filter(Boolean).join(' ').toLowerCase()
  if (!texto) return false
  return (
    texto.includes('terminated') ||
    texto.includes('aborted') ||
    texto.includes('und_err_abort') ||
    texto.includes('und_err_socket') ||
    texto.includes('econnreset') ||
    texto.includes('etimedout') ||
    texto.includes('socket hang up') ||
    texto.includes('fetch failed') ||
    texto.includes('network error') ||
    texto.includes('epipe') ||
    texto.includes('enotfound') ||
    texto.includes('eai_again') ||
    texto.includes('handshake has timed out')
  )
}

/** Errores de descifrado de Baileys: transitorios, no deben llenar el log ni el disco. */
export function esErrorDescifradoBenigno(error) {
  const texto = [
    error?.message,
    error?.cause?.message,
    error?.name,
  ].filter(Boolean).join(' ').toLowerCase()
  if (!texto) return false
  return (
    texto.includes('unsupported state or unable to authenticate data') ||
    texto.includes('failed to decrypt message') ||
    texto.includes('bad mac') ||
    texto.includes('key used already or never filled') ||
    texto.includes('no matching sessions') ||
    texto.includes('no session record')
  )
}

/** Texto corto para el log, sin volcar pilas enormes. */
export function resumenError(error) {
  const nombre = error?.name || 'Error'
  const mensaje = String(error?.message || error || '').split('\n')[0].slice(0, 240)
  return `${nombre}: ${mensaje}`
}
