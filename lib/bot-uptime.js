/**
 * Tiempo activo de bot / sub-bot.
 * Se guarda por número para no perderse al recrear el socket.
 */

const botStartTimes = new Map()

function cleanBotId(jidOrNum = '') {
  return String(jidOrNum || '').split('@')[0].split(':')[0].replace(/\D/g, '')
}


export function setBotStartTime(botIdOrConn, ts) {
  const time = Number(ts)
  if (!Number.isFinite(time) || time <= 0) return null

  if (botIdOrConn && typeof botIdOrConn === 'object') {
    const id = cleanBotId(botIdOrConn.user?.jid || botIdOrConn.user?.id)
    try { botIdOrConn.startTime = time } catch {}
    if (id) botStartTimes.set(id, time)
    return time
  }

  const id = cleanBotId(botIdOrConn)
  if (!id) {
    global.botProcessStart = time
    return time
  }
  botStartTimes.set(id, time)
  return time
}

/**
 * Marca el inicio. Por defecto no reinicia si ya existía.
 * @param {object|string} botIdOrConn
 * @param {{ force?: boolean, at?: number }} [opts]
 */
export function markBotStart(botIdOrConn, { force = false, at } = {}) {
  const stamp = Number.isFinite(Number(at)) && Number(at) > 0 ? Number(at) : Date.now()

  if (botIdOrConn && typeof botIdOrConn === 'object') {
    const id = cleanBotId(botIdOrConn.user?.jid || botIdOrConn.user?.id)
    let ts
    if (id) {
      if (force || !botStartTimes.has(id)) botStartTimes.set(id, stamp)
      ts = botStartTimes.get(id)
    } else {
      ts = stamp
    }
    try { botIdOrConn.startTime = ts } catch {}
    return ts
  }

  const id = cleanBotId(botIdOrConn)
  if (!id) {
    if (!global.botProcessStart) global.botProcessStart = stamp
    return global.botProcessStart
  }
  if (force || !botStartTimes.has(id)) {
    botStartTimes.set(id, stamp)
  }
  return botStartTimes.get(id)
}

export function getBotStartTime(connOrId) {
  if (connOrId && typeof connOrId === 'object') {
    const id = cleanBotId(connOrId.user?.jid || connOrId.user?.id)
    if (id && botStartTimes.has(id)) return botStartTimes.get(id)
    if (connOrId.startTime) {
      if (id) botStartTimes.set(id, connOrId.startTime)
      return connOrId.startTime
    }
    if (connOrId === global.conn) {
      if (!global.botProcessStart) {
        global.botProcessStart = Date.now() - Math.floor(process.uptime() * 1000)
      }
      if (id) botStartTimes.set(id, global.botProcessStart)
      return global.botProcessStart
    }
    return null
  }

  const id = cleanBotId(connOrId)
  if (id && botStartTimes.has(id)) return botStartTimes.get(id)
  return null
}

export function getBotUptimeMs(connOrId) {
  const start = getBotStartTime(connOrId)
  if (!start) {
    
    return Math.floor(process.uptime() * 1000)
  }
  return Math.max(0, Date.now() - start)
}

export function clockString(ms) {
  const n = Number(ms)
  if (!Number.isFinite(n) || n < 0) return '00:00:00'
  const h = Math.floor(n / 3600000)
  const m = Math.floor((n % 3600000) / 60000)
  const s = Math.floor((n % 60000) / 1000)
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':')
}

export function formatBotUptime(connOrId) {
  return clockString(getBotUptimeMs(connOrId))
}

if (!global.botProcessStart) {
  global.botProcessStart = Date.now() - Math.floor(process.uptime() * 1000)
}
