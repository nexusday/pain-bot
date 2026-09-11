/**
 * Utilidades compartidas para modos por grupo.
 * Cada grupo tiene su propia entrada: { "120363...@g.us": true }
 * Claves de DB (modoHuman, etc.) se dejan en inglés.
 */

export function normalizarIdChat(chatId) {
  if (!chatId) return ''
  const id = String(chatId).trim()
  if (typeof id.decodeJid === 'function') return id.decodeJid()
  if (/:\d+@/gi.test(id)) {
    const decodificado = id.replace(/:\d+@/g, '@')
    const [usuario, servidor] = decodificado.split('@')
    return `${usuario.split(':')[0]}@${servidor}`
  }
  return id
}

/** Asegura que el modo en DB sea un objeto { jid: true/false }, no un boolean suelto. */
export function asegurarMapaModo(claveModo) {
  const actual = global.db.data?.[claveModo]
  const mapaModo =
    actual && typeof actual === 'object' && !Array.isArray(actual) ? actual : {}
  global.db.data[claveModo] = mapaModo
  return mapaModo
}

export function estaModoActivo(claveModo, chatId) {
  const mapa = global.db.data?.[claveModo]
  if (!mapa || typeof mapa !== 'object' || Array.isArray(mapa)) return false

  const gid = normalizarIdChat(chatId)
  if (mapa[gid] === true) return true
  if (gid !== chatId && mapa[chatId] === true) return true
  return false
}

export function establecerEstadoModo(claveModo, chatId, activo) {
  const mapa = asegurarMapaModo(claveModo)
  const gid = normalizarIdChat(chatId)
  mapa[gid] = activo
  if (gid !== chatId && chatId in mapa) delete mapa[chatId]
  return mapa
}

/**
 * Solo texto de chat real. Reacciones, stickers, media, polls, etc. NO cuentan
 * (si entraran al gate, cancelarían una respuesta en curso vía isStale).
 */
export function esMensajeTextoPlano(m) {
  if (!m || m.fromMe || m.isBaileys) return false
  if (m.messageStubType) return false

  let msg = m.message
  if (!msg || typeof msg !== 'object') return false

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
  const tiposBloqueados = new Set([
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
  if (mtype && tiposBloqueados.has(mtype)) return false

  const claves = Object.keys(msg).filter(
    (k) => !['senderKeyDistributionMessage', 'messageContextInfo', 'ephemeralMessage'].includes(k)
  )
  const principal = claves[0] || (mtype === 'ephemeralMessage' ? '' : mtype)
  if (principal && !['conversation', 'extendedTextMessage'].includes(principal)) return false

  const texto = String(m.text || '').trim()
  if (texto.length < 2) return false

  if (/^[\s\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]*$/u.test(texto)) {
    return false
  }

  return true
}

/** Texto de ráfaga para la API: mira todos los msgs y actúa una sola vez. */
export function construirTextoRafaga(items) {
  if (!items?.length) return ''
  if (items.length === 1) return String(items[0].text || '').trim()

  const lineas = items.map((it, i) => {
    const nombre = it.userName || it.m?.pushName || it.m?.name || 'Usuario'
    return `${i + 1}. ${nombre}: ${String(it.text || '').trim()}`
  })

  return (
    `[Ráfaga: ${items.length} mensajes seguidos. Léelos TODOS. Decide UNA sola acción ` +
    `(ignorar / reaccionar / responder) para el conjunto. Si respondes, un solo mensaje corto ` +
    `que cubra lo importante; no contestes uno por uno.]\n` +
    lineas.join('\n')
  )
}

/**
 * Puerta anti-flood / anti 1x1:
 * acumula msgs, espera silencio, invalida si llegan más a mitad de proceso.
 */
export function crearPuertaChat(opciones = {}) {
  const {
    label = 'modo',
    settleMs = 2800,
    hardBurst = 6,
    hardSettleMs = 7000,
    minGapMs = 7500,
    maxBatch = 20,
    taskTimeoutMs = 40000,
    windowMs = 18000
  } = opciones

  const estados = new Map()

  function obtenerEstado(chatId) {
    let estado = estados.get(chatId)
    if (!estado) {
      estado = {
        lote: [],
        recientes: [],
        temporizador: null,
        ocupado: false,
        ultimaAccionEn: 0,
        generacion: 0,
        ejecutarTrabajo: null
      }
      estados.set(chatId, estado)
    }
    return estado
  }

  function limpiarTemporizador(estado) {
    if (estado.temporizador) {
      clearTimeout(estado.temporizador)
      estado.temporizador = null
    }
  }

  function retrasoAsentamiento(estado) {
    const ahora = Date.now()
    const ultimoEn = estado.lote.length
      ? estado.lote[estado.lote.length - 1].at
      : ahora

    const rafaga = estado.recientes.filter((t) => ahora - t < windowMs).length
    const necesita = rafaga >= hardBurst ? hardSettleMs : settleMs

    let espera = necesita - (ahora - ultimoEn)

    if (estado.ultimaAccionEn) {
      const desdeAccion = ahora - estado.ultimaAccionEn
      espera = Math.max(espera, minGapMs - desdeAccion)
    }

    return Math.max(800, espera) + Math.floor(Math.random() * 600)
  }

  function armarTemporizador(chatId) {
    const estado = obtenerEstado(chatId)
    if (estado.ocupado || !estado.lote.length) {
      limpiarTemporizador(estado)
      return
    }

    limpiarTemporizador(estado)
    const espera = retrasoAsentamiento(estado)
    estado.temporizador = setTimeout(() => {
      vaciar(chatId).catch(() => {})
    }, espera)
  }

  function programar(chatId, item, ejecutarTrabajo) {
    const id = normalizarIdChat(chatId) || String(chatId)
    const estado = obtenerEstado(id)
    const ahora = Date.now()

    estado.ejecutarTrabajo = ejecutarTrabajo
    estado.generacion += 1
    estado.lote.push({
      ...item,
      at: ahora,
      userName: item.userName || item.m?.pushName || item.m?.name || 'Usuario'
    })
    if (estado.lote.length > maxBatch) {
      estado.lote = estado.lote.slice(-maxBatch)
    }

    estado.recientes = estado.recientes.filter((t) => ahora - t < windowMs)
    estado.recientes.push(ahora)

    if (estado.ocupado) return true

    armarTemporizador(id)
    return true
  }

  async function vaciar(chatId) {
    const estado = obtenerEstado(chatId)
    estado.temporizador = null

    if (estado.ocupado || !estado.lote.length || !estado.ejecutarTrabajo) return

    const genAlInicio = estado.generacion
    const items = estado.lote.slice()
    const ultimo = items[items.length - 1]
    const ejecutarTrabajo = estado.ejecutarTrabajo
    const estaObsoleto = () => estado.generacion !== genAlInicio

    estado.ocupado = true

    let actuado = false
    try {
      actuado = await Promise.race([
        Promise.resolve().then(() =>
          ejecutarTrabajo({
            items,
            last: ultimo,
            m: ultimo.m,
            conn: ultimo.conn,
            text: construirTextoRafaga(items),
            burstSize: items.length,
            isStale: estaObsoleto
          })
        ),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('timeout')), taskTimeoutMs)
        })
      ]).catch((err) => {
        console.error(`${label} [${chatId}]:`, err?.message || err)
        return false
      })

      if (!estaObsoleto()) {
        const hechos = new Set(items)
        estado.lote = estado.lote.filter((it) => !hechos.has(it))
        estado.ultimaAccionEn = Date.now()
      }
    } finally {
      estado.ocupado = false
      if (estado.lote.length) armarTemporizador(chatId)
    }

    return actuado
  }

  return { schedule: programar }
}

export {
  normalizarIdChat as normalizeChatId,
  asegurarMapaModo as ensureModeMap,
  estaModoActivo as isModeActive,
  establecerEstadoModo as setModeState,
  esMensajeTextoPlano as isPlainTextChatMessage,
  construirTextoRafaga as buildBurstPromptText,
  crearPuertaChat as createChatGate
}
