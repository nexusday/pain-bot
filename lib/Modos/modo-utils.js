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
 * Solo texto de chat real. Reacciones, stickers, media, polls, etc. NO cuentan
 * (si entraran al gate, cancelarían una respuesta en curso vía isStale).
 */
export function isPlainTextChatMessage(m) {
  if (!m || m.fromMe || m.isBaileys) return false
  if (m.messageStubType) return false

  let msg = m.message
  if (!msg || typeof msg !== 'object') return false

  // Desenvuelve ephemeral (sigue siendo texto).
  while (msg?.ephemeralMessage?.message) {
    msg = msg.ephemeralMessage.message
  }

  if (
    msg.reactionMessage ||
    msg.protocolMessage ||
    msg.pollUpdateMessage ||
    msg.pollCreationMessage ||
    msg.stickerMessage ||
    msg.imageMessage ||
    msg.videoMessage ||
    msg.audioMessage ||
    msg.documentMessage ||
    msg.contactMessage ||
    msg.contactsArrayMessage ||
    msg.locationMessage ||
    msg.liveLocationMessage ||
    msg.viewOnceMessage ||
    msg.viewOnceMessageV2 ||
    msg.viewOnceMessageV2Extension ||
    msg.albumMessage ||
    msg.ptvMessage
  ) {
    return false
  }

  const mtype = String(m.mtype || '')
  const blockedTypes = new Set([
    'reactionMessage',
    'protocolMessage',
    'stickerMessage',
    'imageMessage',
    'videoMessage',
    'audioMessage',
    'documentMessage',
    'contactMessage',
    'contactsArrayMessage',
    'locationMessage',
    'liveLocationMessage',
    'pollCreationMessage',
    'pollUpdateMessage',
    'viewOnceMessage',
    'viewOnceMessageV2',
    'viewOnceMessageV2Extension',
    'albumMessage',
    'ptvMessage',
    'senderKeyDistributionMessage',
    'listResponseMessage',
    'buttonsResponseMessage',
    'templateButtonReplyMessage',
    'interactiveResponseMessage'
  ])
  if (mtype && blockedTypes.has(mtype)) return false

  const keys = Object.keys(msg).filter(
    (k) => !['senderKeyDistributionMessage', 'messageContextInfo', 'ephemeralMessage'].includes(k)
  )
  const main = keys[0] || (mtype === 'ephemeralMessage' ? '' : mtype)
  if (main && !['conversation', 'extendedTextMessage'].includes(main)) return false

  const text = String(m.text || '').trim()
  if (text.length < 2) return false

  // Solo emoji / símbolos → no es texto de conversación (incluye reaction text)
  if (/^[\s\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]*$/u.test(text)) {
    return false
  }

  return true
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
    // Silencio tras el último msg (rápido pero alcanza a juntar 2–3 msgs seguidos)
    settleMs = 2800,
    hardBurst = 6,
    hardSettleMs = 7000,
    minGapMs = 7500,
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
