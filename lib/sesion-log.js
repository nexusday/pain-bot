/**
 * libsignal imprime la sesión completa (llaves privadas incluidas) cada vez
 * que reemplaza un intercambio a medias. Ese console es síncrono: con muchos
 * chats llena la salida y el hilo se queda minutos sin atender a nadie.
 * El cierre de la sesión sigue ocurriendo; solo se omite ese volcado.
 */
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

function pareceSesion(valor) {
  return Boolean(valor && typeof valor === 'object' && (valor.currentRatchet || valor.indexInfo || valor._chains))
}

function esVolcadoDeSesion(args) {
  if (args.some(pareceSesion)) return true
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
