/**
 * Utilidades compartidas para modos por grupo.
 * Cada grupo tiene su propia entrada: { "120363...@g.us": true }
 * Varios grupos pueden tener el mismo modo activo a la vez.
 */

export function normalizeChatId(chatId) {
  if (!chatId) return ''
  const id = String(chatId).trim()
  if (typeof id.decodeJid === 'function') return id.decodeJid()
  if (/:\d+@/gi.test(id)) {
    const decoded = id.replace(/:\d+@/g, '@')
    const [user, server] = decoded.split('@')
    return `${user.split(':')[0]}@${server}`
  }
  return id
}

/** Asegura que el modo en DB sea un objeto { jid: true/false }, no un boolean suelto. */
export function ensureModeMap(modeKey) {
  const current = global.db.data?.[modeKey]
  const modeMap =
    current && typeof current === 'object' && !Array.isArray(current) ? current : {}
  global.db.data[modeKey] = modeMap
  return modeMap
}

export function isModeActive(modeKey, chatId) {
  const map = global.db.data?.[modeKey]
  if (!map || typeof map !== 'object' || Array.isArray(map)) return false

  const gid = normalizeChatId(chatId)
  if (map[gid] === true) return true
  if (gid !== chatId && map[chatId] === true) return true
  return false
}

export function setModeState(modeKey, chatId, active) {
  const map = ensureModeMap(modeKey)
  const gid = normalizeChatId(chatId)
  map[gid] = active
  if (gid !== chatId && chatId in map) delete map[chatId]
  return map
}

/**
 * Texto de ráfaga para la API: mira todos los msgs y actúa una sola vez.
 */
export function buildBurstPromptText(items) {
  if (!items?.length) return ''
  if (items.length === 1) return String(items[0].text || '').trim()

  const lines = items.map((it, i) => {
    const name = it.userName || it.m?.pushName || it.m?.name || 'Usuario'
    return `${i + 1}. ${name}: ${String(it.text || '').trim()}`
  })

  return (
    `[Ráfaga: ${items.length} mensajes seguidos. Léelos TODOS. Decide UNA sola acción ` +
    `(ignorar / reaccionar / responder) para el conjunto. Si respondes, un solo mensaje corto ` +
    `que cubra lo importante; no contestes uno por uno.]\n` +
    lines.join('\n')
  )
}

/**
 * Puerta anti-flood / anti 1x1:
 * 1) Acumula msgs en batch
 * 2) Espera silencio real desde el ÚLTIMO msg
 * 3) Si llegan msgs mientras procesa → invalida esa corrida y re-batch (no doble respuesta)
 * 4) Una sola acción por ráfaga, citando el último
 */
export function createChatGate(options = {}) {
  const {
    label = 'modo',
    // Silencio tras el último msg (tiempo típico entre msgs al escribir varios)
    settleMs = 5500,
    hardBurst = 6,
    hardSettleMs = 11000,
    minGapMs = 12000,
    maxBatch = 20,
    taskTimeoutMs = 40000,
    windowMs = 18000
  } = options

  const states = new Map()

  function getState(chatId) {
    let state = states.get(chatId)
    if (!state) {
      state = {
        batch: [],
        recent: [],
        timer: null,
        busy: false,
        lastActionAt: 0,
        generation: 0,
        runJob: null
      }
      states.set(chatId, state)
    }
    return state
  }

  function clearTimer(state) {
    if (state.timer) {
      clearTimeout(state.timer)
      state.timer = null
    }
  }

  function settleDelay(state) {
    const now = Date.now()
    const lastAt = state.batch.length
      ? state.batch[state.batch.length - 1].at
      : now

    const burst = state.recent.filter((t) => now - t < windowMs).length
    const needSettle = burst >= hardBurst ? hardSettleMs : settleMs

    let wait = needSettle - (now - lastAt)

    if (state.lastActionAt) {
      const sinceAction = now - state.lastActionAt
      wait = Math.max(wait, minGapMs - sinceAction)
    }

    return Math.max(800, wait) + Math.floor(Math.random() * 600)
  }

  function armTimer(chatId) {
    const state = getState(chatId)
    if (state.busy || !state.batch.length) {
      clearTimer(state)
      return
    }

    clearTimer(state)
    const wait = settleDelay(state)
    state.timer = setTimeout(() => {
      flush(chatId).catch(() => {})
    }, wait)
  }

  function schedule(chatId, item, runJob) {
    const id = normalizeChatId(chatId) || String(chatId)
    const state = getState(id)
    const now = Date.now()

    state.runJob = runJob
    state.generation += 1
    state.batch.push({
      ...item,
      at: now,
      userName: item.userName || item.m?.pushName || item.m?.name || 'Usuario'
    })
    if (state.batch.length > maxBatch) {
      state.batch = state.batch.slice(-maxBatch)
    }

    state.recent = state.recent.filter((t) => now - t < windowMs)
    state.recent.push(now)

    // Si está ocupado, solo acumula: la corrida actual se invalidará (isStale)
    // y al terminar se rearmará el timer con el batch completo.
    if (state.busy) return true

    armTimer(id)
    return true
  }

  async function flush(chatId) {
    const state = getState(chatId)
    state.timer = null

    if (state.busy || !state.batch.length || !state.runJob) return

    // Snapshot: NO borramos aún. Si llegan msgs nuevos, isStale cancela el envío
    // y el batch sigue intacto (más los nuevos) para un solo flush después.
    const genAtStart = state.generation
    const items = state.batch.slice()
    const last = items[items.length - 1]
    const runJob = state.runJob
    const isStale = () => state.generation !== genAtStart

    state.busy = true

    let acted = false
    try {
      acted = await Promise.race([
        Promise.resolve().then(() =>
          runJob({
            items,
            last,
            m: last.m,
            conn: last.conn,
            text: buildBurstPromptText(items),
            burstSize: items.length,
            isStale
          })
        ),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('timeout')), taskTimeoutMs)
        })
      ]).catch((err) => {
        console.error(`${label} [${chatId}]:`, err?.message || err)
        return false
      })

      if (!isStale()) {
        // Corrida válida: quitar del batch solo los msgs que procesamos.
        const done = new Set(items)
        state.batch = state.batch.filter((it) => !done.has(it))
        state.lastActionAt = Date.now()
      }
      // Si quedó stale: no tocamos batch ni lastActionAt (se reintenta junto).
    } finally {
      state.busy = false
      if (state.batch.length) armTimer(chatId)
    }

    return acted
  }

  return { schedule }
}
