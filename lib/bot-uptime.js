/**
 * Tiempo activo de bot / sub-bot.
 * Se guarda por número para no perderse al recrear el socket.
 */

const tiemposInicioBot = new Map()

function limpiarIdBot(jidONumero = '') {
  return String(jidONumero || '').split('@')[0].split(':')[0].replace(/\D/g, '')
}

export function establecerTiempoInicioBot(botIdOConn, ts) {
  const tiempo = Number(ts)
  if (!Number.isFinite(tiempo) || tiempo <= 0) return null

  if (botIdOConn && typeof botIdOConn === 'object') {
    const id = limpiarIdBot(botIdOConn.user?.jid || botIdOConn.user?.id)
    try { botIdOConn.startTime = tiempo } catch {}
    if (id) tiemposInicioBot.set(id, tiempo)
    return tiempo
  }

  const id = limpiarIdBot(botIdOConn)
  if (!id) {
    global.botProcessStart = tiempo
    return tiempo
  }
  tiemposInicioBot.set(id, tiempo)
  return tiempo
}

/**
 * Marca el inicio. Por defecto no reinicia si ya existía.
 * @param {object|string} botIdOConn
 * @param {{ force?: boolean, at?: number }} [opciones]
 */
export function marcarInicioBot(botIdOConn, { force = false, at } = {}) {
  const marca = Number.isFinite(Number(at)) && Number(at) > 0 ? Number(at) : Date.now()

  if (botIdOConn && typeof botIdOConn === 'object') {
    const id = limpiarIdBot(botIdOConn.user?.jid || botIdOConn.user?.id)
    let ts
    if (id) {
      if (force || !tiemposInicioBot.has(id)) tiemposInicioBot.set(id, marca)
      ts = tiemposInicioBot.get(id)
    } else {
      ts = marca
    }
    try { botIdOConn.startTime = ts } catch {}
    return ts
  }

  const id = limpiarIdBot(botIdOConn)
  if (!id) {
    if (!global.botProcessStart) global.botProcessStart = marca
    return global.botProcessStart
  }
  if (force || !tiemposInicioBot.has(id)) {
    tiemposInicioBot.set(id, marca)
  }
  return tiemposInicioBot.get(id)
}

export function obtenerTiempoInicioBot(connOId) {
  if (connOId && typeof connOId === 'object') {
    const id = limpiarIdBot(connOId.user?.jid || connOId.user?.id)
    if (id && tiemposInicioBot.has(id)) return tiemposInicioBot.get(id)
    if (connOId.startTime) {
      if (id) tiemposInicioBot.set(id, connOId.startTime)
      return connOId.startTime
    }
    if (connOId === global.conn) {
      if (!global.botProcessStart) {
        global.botProcessStart = Date.now() - Math.floor(process.uptime() * 1000)
      }
      if (id) tiemposInicioBot.set(id, global.botProcessStart)
      return global.botProcessStart
    }
    return null
  }

  const id = limpiarIdBot(connOId)
  if (id && tiemposInicioBot.has(id)) return tiemposInicioBot.get(id)
  return null
}

export function obtenerUptimeBotMs(connOId) {
  const inicio = obtenerTiempoInicioBot(connOId)
  if (!inicio) {
    return Math.floor(process.uptime() * 1000)
  }
  return Math.max(0, Date.now() - inicio)
}

export function cadenaReloj(ms) {
  const n = Number(ms)
  if (!Number.isFinite(n) || n < 0) return '00:00:00'
  const h = Math.floor(n / 3600000)
  const m = Math.floor((n % 3600000) / 60000)
  const s = Math.floor((n % 60000) / 1000)
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':')
}

export function formatearUptimeBot(connOId) {
  return cadenaReloj(obtenerUptimeBotMs(connOId))
}

// Alias en inglés (compatibilidad con imports existentes)
export {
  establecerTiempoInicioBot as setBotStartTime,
  marcarInicioBot as markBotStart,
  obtenerTiempoInicioBot as getBotStartTime,
  obtenerUptimeBotMs as getBotUptimeMs,
  cadenaReloj as clockString,
  formatearUptimeBot as formatBotUptime
}

if (!global.botProcessStart) {
  global.botProcessStart = Date.now() - Math.floor(process.uptime() * 1000)
}
