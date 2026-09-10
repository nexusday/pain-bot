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
 * Puerta anti-flood por chat:
 * - Acumula mensajes en un batch mientras sigan llegando
 * - Espera silencio (settle) y recién ahí procesa UNA vez
 * - La API ve todos los msgs del batch; la respuesta va al último
 */
export function createChatGate(options = {}) {
  const {
    label = 'modo',
    settleMs = 3200,
    hardBurst = 7,
    hardSettleMs = 9000,
    minGapMs = 10000,
    maxBatch = 15,
    taskTimeoutMs = 35000,
    windowMs = 14000
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
        runJob: null
      }
      states.set(chatId, state)
    }
    return state
  }

  function schedule(chatId, item, runJob) {
    const id = normalizeChatId(chatId) || String(chatId)
    const state = getState(id)
    const now = Date.now()

    state.runJob = runJob
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
    const burst = state.recent.length

    if (state.timer) {
      clearTimeout(state.timer)
      state.timer = null
    }

    // Mientras sigan llegando msgs, solo reinicia el timer de silencio.
    let wait = settleMs + Math.floor(Math.random() * 700)
    if (burst >= hardBurst) {
      wait = hardSettleMs + Math.floor(Math.random() * 3500)
    }

    if (state.busy) {
      // Si ya está procesando, el finally reprograma; no hace falta timer corto.
      return true
    }

    if (state.lastActionAt) {
      const since = now - state.lastActionAt
      if (since < minGapMs) {
        wait = Math.max(wait, minGapMs - since + Math.floor(Math.random() * 900))
      }
    }

    state.timer = setTimeout(() => {
      flush(id).catch(() => {})
    }, wait)

    return true
  }

  async function flush(chatId) {
    const state = getState(chatId)
    state.timer = null

    if (state.busy || !state.batch.length || !state.runJob) return

    const items = state.batch.splice(0, state.batch.length)
    const last = items[items.length - 1]
    const runJob = state.runJob

    state.busy = true

    try {
      await Promise.race([
        Promise.resolve().then(() =>
          runJob({
            items,
            last,
            m: last.m,
            conn: last.conn,
            text: buildBurstPromptText(items),
            burstSize: items.length
          })
        ),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('timeout')), taskTimeoutMs)
        })
      ]).catch((err) => {
        console.error(`${label} [${chatId}]:`, err?.message || err)
        return false
      })
      state.lastActionAt = Date.now()
    } finally {
      state.busy = false

      // Si durante el proceso llegaron más msgs, esperar silencio otra vez.
      if (state.batch.length) {
        const gap = Math.max(
          settleMs,
          minGapMs - (Date.now() - state.lastActionAt)
        ) + Math.floor(Math.random() * 1200)

        if (state.timer) clearTimeout(state.timer)
        state.timer = setTimeout(() => {
          flush(chatId).catch(() => {})
        }, Math.max(1500, gap))
      }
    }
  }

  return { schedule }
}
