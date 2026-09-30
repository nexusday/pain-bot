/**
 * Un chat con la sesión a medias hace que libsignal tire esa sesión y
 * abra otra, una y otra vez. Cada vuelta cifra y, encima, imprime las llaves.
 * Eso es síncrono y todos los bots comparten el mismo hilo, así que se paran juntos.
 * Si la sesión abierta tiene menos de 2 minutos, no se reemplaza.
 */
import { createRequire } from 'module'
import { existsSync } from 'fs'

const require = createRequire(import.meta.url)
const RECIENTE_MS = 2 * 60 * 1000

function conservarSesionReciente(SessionBuilder) {
  if (!SessionBuilder?.prototype?.initOutgoing || SessionBuilder.prototype._painSinReemplazo) return
  const original = SessionBuilder.prototype.initOutgoing
  SessionBuilder.prototype.initOutgoing = async function (device) {
    try {
      const direccion = this.addr.toString()
      const registro = await this.storage.loadSession(direccion)
      const abierta = registro?.getOpenSession?.()
      const creada = abierta?.indexInfo?.created || 0
      if (creada && Date.now() - creada < RECIENTE_MS) return
    } catch {}
    return original.call(this, device)
  }
  SessionBuilder.prototype._painSinReemplazo = true
}

for (const ruta of ['libsignal', '@itsliaaa/baileys/node_modules/libsignal']) {
  try {
    if (ruta.includes('node_modules') && !existsSync(require.resolve(ruta))) continue
    conservarSesionReciente(require(ruta).SessionBuilder)
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
