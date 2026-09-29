const ESPERA_MS = 8_000
const MAX_CLAVES = 20
const EN_VUELO_MAX = 2
const TOPE_ENVIO_MS = 8_000

const estados = new WeakMap()
const cola = []
let enVuelo = 0

function socketAbierto(conn) {
  try {
    if (conn.ws?.isOpen === true) return true
    const estado = conn.ws?.socket?.readyState ?? conn.ws?.readyState
    return estado === 1
  } catch {
    return false
  }
}

function bomba() {
  while (enVuelo < EN_VUELO_MAX && cola.length) {
    const trabajo = cola.shift()
    enVuelo++
    trabajo().finally(() => {
      enVuelo--
      bomba()
    })
  }
}

function programar(conn, est) {
  if (est.timer) return
  const falta = Math.max(250, ESPERA_MS - (Date.now() - est.ultimo))
  est.timer = setTimeout(() => {
    est.timer = null
    vaciar(conn, est)
  }, falta)
  est.timer.unref?.()
}

function vaciar(conn, est) {
  if (!est.claves.length) return
  if (!socketAbierto(conn) || typeof conn.readMessages !== 'function') {
    est.claves = []
    return
  }

  const lote = est.claves.splice(0, MAX_CLAVES)
  est.ultimo = Date.now()

  cola.push(async () => {
    try {
      await Promise.race([
        conn.readMessages(lote),
        new Promise((_, rechazar) => setTimeout(() => rechazar(new Error('lectura')), TOPE_ENVIO_MS)),
      ])
    } catch {}
  })
  bomba()

  if (est.claves.length) programar(conn, est)
}

/** Junta los vistos y los manda de a pocos, para no llenar el socket. */
export function programarLectura(conn, key) {
  if (!conn || !key?.id || typeof conn.readMessages !== 'function') return
  if (!socketAbierto(conn)) return

  let est = estados.get(conn)
  if (!est) {
    est = { claves: [], timer: null, ultimo: 0 }
    estados.set(conn, est)
  }

  if (est.claves.some((k) => k.id === key.id && k.remoteJid === key.remoteJid)) return
  est.claves.push(key)
  if (est.claves.length > MAX_CLAVES) {
    est.claves.splice(0, est.claves.length - MAX_CLAVES)
  }
  programar(conn, est)
}
