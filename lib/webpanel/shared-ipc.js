/**
 * Puente IPC para acciones que solo puede hacer el worker dueño de un sub-bot
 * (unirse/salir de un grupo). El panel corre en el proceso primario; el
 * supervisor reenvía la orden al carril que tiene el socket y devuelve el
 * resultado con el mismo requestId.
 */
const pendientes = new Map()
let secuencia = 0
let escuchando = false

function asegurarListener() {
  if (escuchando) return
  escuchando = true
  process.on('message', (mensaje) => {
    if (!mensaje || typeof mensaje !== 'object') return
    if (mensaje.type !== 'join-group-result' && mensaje.type !== 'leave-group-result') return
    const pendiente = pendientes.get(mensaje.requestId)
    if (!pendiente) return
    pendientes.delete(mensaje.requestId)
    pendiente(mensaje.resultado || mensaje)
  })
}

export function pedirAccionWorker(tipo, datos = {}, timeoutMs = 45_000) {
  asegurarListener()
  if (typeof process.send !== 'function') {
    return Promise.resolve({ ok: false, error: 'no-ipc' })
  }
  const requestId = `${Date.now()}-${++secuencia}`
  return new Promise((resolve) => {
    const temporizador = setTimeout(() => {
      pendientes.delete(requestId)
      resolve({ ok: false, error: 'timeout' })
    }, Math.max(5_000, Number(timeoutMs) || 45_000))
    pendientes.set(requestId, (resultado) => {
      clearTimeout(temporizador)
      resolve(resultado)
    })
    try {
      process.send({ type: tipo, ...datos, requestId })
    } catch (error) {
      clearTimeout(temporizador)
      pendientes.delete(requestId)
      resolve({ ok: false, error: error?.message || 'send-failed' })
    }
  })
}
