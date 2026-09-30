/**
 * libsignal imprime la sesión completa (llaves privadas incluidas) cada vez
 * que reemplaza un intercambio a medias. Ese console es síncrono: con muchos
 * chats llena la salida y el hilo se queda minutos sin atender a nadie.
 * El cierre de la sesión sigue ocurriendo; solo se omite ese volcado.
 */
const AVISOS = [
  'Closing session',
  'Opening session',
  'Session already closed',
  'Session already open',
  'Closing stale open session',
  'Closing open session in favor of incoming prekey bundle',
]

function esVolcadoDeSesion(args) {
  const primero = args[0]
  if (typeof primero !== 'string') return false
  return AVISOS.some((aviso) => primero.startsWith(aviso))
}

for (const metodo of ['info', 'warn', 'log']) {
  const original = console[metodo].bind(console)
  console[metodo] = (...args) => {
    if (esVolcadoDeSesion(args)) return
    return original(...args)
  }
}
