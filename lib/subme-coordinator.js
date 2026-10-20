/**
 * Coordina /subme entre el bot principal y los workers de sub-bots.
 *
 * El principal pide que cada worker mande el mensaje al owner con sus sockets;
 * el supervisor reparte la orden y devuelve un único ack con los totales
 * (enviados / fallidos) para que el owner reciba la confirmación.
 */
export function crearCoordinadorSubme({
  alTerminar = () => {},
  timeoutMs = 150_000,
} = {}) {
  const pendientes = new Map()

  function finalizar(requestId) {
    const registro = pendientes.get(requestId)
    if (!registro) return null
    pendientes.delete(requestId)
    if (registro.timer) clearTimeout(registro.timer)
    const resumen = {
      requestId,
      workers: registro.workers,
      enviados: registro.enviados,
      fallidos: registro.fallidos,
    }
    alTerminar(resumen)
    return resumen
  }

  return {
    /** Registra la petición y los workers que deben responder. */
    registrar(requestId, workerIds = []) {
      if (!requestId || pendientes.has(requestId)) return
      const registro = {
        pendientes: new Set(workerIds),
        enviados: 0,
        fallidos: [],
        workers: workerIds.length,
        timer: null,
      }
      pendientes.set(requestId, registro)
      registro.timer = setTimeout(() => finalizar(requestId), timeoutMs)
      registro.timer.unref?.()
      if (!registro.workers) finalizar(requestId)
    },

    /** Suma el resultado de un worker; cuando todos responden, cierra el ack. */
    resultado(requestId, workerId, { enviados = 0, fallidos = [] } = {}) {
      const registro = pendientes.get(requestId)
      if (!registro) return null
      registro.enviados += Number(enviados) || 0
      if (Array.isArray(fallidos)) registro.fallidos.push(...fallidos)
      registro.pendientes.delete(workerId)
      if (!registro.pendientes.size) return finalizar(requestId)
      return null
    },

    finalizar,
    pendientes: () => pendientes.size,
  }
}
