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
 * Puerta anti-flood por chat: debounce + coalesce (solo el último mensaje).
 * Evita responder 1x1 cuando llegan muchos msgs seguidos (riesgo de ban).
 *
 * - 1–2 msgs: responde con poco delay
 * - 3+ en ~7s: espera a que se calme y procesa solo el último
 * - 8+ (flood fuerte): espera más y igual solo 1 acción al final
 * - Gap mínimo entre acciones para no spamear
 */
export function createChatGate(options = {}) {
  const {
    label = 'modo',
    windowMs = 7000,
    softBurst = 3,
    hardBurst = 8,
    softWaitMs = 3000,
    hardWaitMs = 11000,
    normalWaitMs = 800,
    minGapMs = 8500,
    taskTimeoutMs = 35000
  } = options

  const states = new Map()

  function getState(chatId) {
    let state = states.get(chatId)
    if (!state) {
      state = {
        recent: [],
        pending: null,
        timer: null,
        busy: false,
        lastActionAt: 0
      }
      states.set(chatId, state)
    }
    return state
  }

  function schedule(chatId, job, runJob) {
    const id = normalizeChatId(chatId) || String(chatId)
    const state = getState(id)
    const now = Date.now()

    state.recent = state.recent.filter((t) => now - t < windowMs)
    state.recent.push(now)
    const burst = state.recent.length

    // Solo el último mensaje del burst importa (no cola 1x1).
    state.pending = job

    if (state.timer) {
      clearTimeout(state.timer)
      state.timer = null
    }

    let wait = normalWaitMs + Math.floor(Math.random() * 500)
    if (burst >= hardBurst) {
      wait = hardWaitMs + Math.floor(Math.random() * 4000)
    } else if (burst >= softBurst) {
      wait = softWaitMs + Math.floor(Math.random() * 1800)
    }

    if (state.lastActionAt) {
      const since = now - state.lastActionAt
      if (since < minGapMs) wait = Math.max(wait, minGapMs - since + Math.floor(Math.random() * 800))
    }

    state.timer = setTimeout(() => {
      flush(id, runJob).catch(() => {})
    }, wait)

    return true
  }

  async function flush(chatId, runJob) {
    const state = getState(chatId)
    state.timer = null
    if (state.busy || !state.pending) return

    const job = state.pending
    state.pending = null
    state.busy = true

    try {
      await Promise.race([
        Promise.resolve().then(() => runJob(job)),
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
      if (state.pending) {
        const gap = minGapMs + Math.floor(Math.random() * 2000)
        state.timer = setTimeout(() => {
          flush(chatId, runJob).catch(() => {})
        }, gap)
      }
    }
  }

  return { schedule }
}
