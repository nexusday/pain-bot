function enteroEnv(nombre, porDefecto, minimo, maximo) {
  const valor = Number.parseInt(process.env[nombre], 10)
  if (!Number.isInteger(valor)) return porDefecto
  return Math.min(Math.max(valor, minimo), maximo)
}

// Topes deliberadamente bajos: con 150+ subbots el proceso acumulaba ~1 GB
// por worker y el VPS de 8 GB terminaba en swap. Todo lo podado aquí se
// vuelve a obtener bajo demanda (metadata del grupo, mensajes citados).
const MAX_MENSAJES_CACHEADOS = enteroEnv('PAIN_MAX_MSG_CACHE', 4_000, 500, 50_000)
const MAX_MENSAJES_POR_CHAT = enteroEnv('PAIN_MAX_MSG_CHAT', 50, 10, 500)
const MENSAJES_POR_CHAT_TRAS_PODA = Math.max(10, Math.floor(MAX_MENSAJES_POR_CHAT * 0.75))
const MAX_CHATS_POR_SOCKET = enteroEnv('PAIN_MAX_CHATS_SOCKET', 150, 40, 2_000)
const MAX_METADATA_POR_SOCKET = enteroEnv('PAIN_MAX_GROUP_META', 60, 10, 1_000)
const MAX_EDAD_METADATA_MS = enteroEnv('PAIN_GROUP_META_TTL_MS', 30 * 60 * 1000, 60_000, 24 * 60 * 60 * 1000)

const idsCacheChat = new WeakMap()
const estadosChats = new WeakMap()
const coleccionesPreparadas = new WeakSet()
const mensajesAligerados = new WeakSet()
const cacheMensajes = new Map()
let siguienteIdCacheChat = 0

// Las miniaturas (jpeg/png) son el campo más pesado de cada mensaje y ningún
// comando las usa desde el caché: se descargan del servidor cuando hacen falta.
function aligerarContenido(objeto, profundidad = 0) {
  if (!objeto || typeof objeto !== 'object' || profundidad > 4) return
  if (Buffer.isBuffer(objeto)) return
  if ('jpegThumbnail' in objeto) delete objeto.jpegThumbnail
  if ('pngThumbnail' in objeto) delete objeto.pngThumbnail
  for (const valor of Object.values(objeto)) {
    if (valor && typeof valor === 'object') aligerarContenido(valor, profundidad + 1)
  }
}

function aligerarMensajeCache(entrada) {
  if (!entrada || typeof entrada !== 'object' || mensajesAligerados.has(entrada)) return
  mensajesAligerados.add(entrada)
  aligerarContenido(entrada.message)
  aligerarContenido(entrada)
}

function obtenerEstadoChat(chat) {
  let estado = estadosChats.get(chat)
  if (estado) return estado

  const mensajes = chat.messages && typeof chat.messages === 'object'
    ? Object.entries(chat.messages)
    : []
  const actuales = new Map(
    mensajes.map(([idMensaje, mensaje]) => [idMensaje, { idMensaje, mensaje }]),
  )
  estado = {
    orden: [...actuales.values()],
    inicio: 0,
    actuales,
  }
  estadosChats.set(chat, estado)
  return estado
}

function obtenerIdCacheChat(chat) {
  let id = idsCacheChat.get(chat)
  if (id === undefined) {
    id = ++siguienteIdCacheChat
    idsCacheChat.set(chat, id)
  }
  return id
}

function claveCache(chat, idMensaje) {
  return `${obtenerIdCacheChat(chat)}\0${idMensaje}`
}

function compactarOrdenChat(estado) {
  const pendientes = estado.orden.length - estado.inicio
  if (estado.inicio > 64 && estado.inicio * 2 >= estado.orden.length) {
    estado.orden = estado.orden.slice(estado.inicio)
    estado.inicio = 0
  }
  if (pendientes > estado.actuales.size * 2 + 64) {
    estado.orden = [...estado.actuales.values()]
    estado.inicio = 0
  }
}

export function olvidarMensajeCache(chat, idMensaje, mensaje) {
  if (!chat || !idMensaje) return
  const estado = estadosChats.get(chat)
  const actual = estado?.actuales.get(idMensaje)
  if (actual?.mensaje === mensaje) {
    estado.actuales.delete(idMensaje)
    actual.mensaje = null
  }
  const clave = claveCache(chat, idMensaje)
  const anterior = cacheMensajes.get(clave)
  if (anterior && anterior.mensaje === mensaje) cacheMensajes.delete(clave)
}

function tiempoMensaje(mensaje) {
  const crudo = mensaje?.messageTimestamp
  const ts = typeof crudo === 'object' && typeof crudo?.toNumber === 'function'
    ? crudo.toNumber()
    : Number(crudo) || 0
  if (!ts) return Date.now()
  return ts > 1e12 ? ts : ts * 1000
}

export function recordarMensajeCache(chat, idMensaje, mensaje) {
  if (!chat || !idMensaje || !mensaje || chat.messages?.[idMensaje] !== mensaje) return

  aligerarMensajeCache(mensaje)
  chat._ultimoMensajeEn = Math.max(
    Number(chat._ultimoMensajeEn) || 0,
    tiempoMensaje(mensaje),
  )

  const estado = obtenerEstadoChat(chat)
  const mensajeAnterior = estado.actuales.get(idMensaje)
  if (mensajeAnterior?.mensaje !== mensaje) {
    if (mensajeAnterior) mensajeAnterior.mensaje = null
    const actual = { idMensaje, mensaje }
    estado.actuales.set(idMensaje, actual)
    estado.orden.push(actual)
  }

  const clave = claveCache(chat, idMensaje)
  const anterior = cacheMensajes.get(clave)
  if (anterior?.mensaje === mensaje) return
  cacheMensajes.delete(clave)
  cacheMensajes.set(clave, { chat, idMensaje, mensaje })

  while (cacheMensajes.size > MAX_MENSAJES_CACHEADOS) {
    const masAntiguo = cacheMensajes.entries().next().value
    if (!masAntiguo) break

    const [claveAntigua, entrada] = masAntiguo
    olvidarMensajeCache(entrada.chat, entrada.idMensaje, entrada.mensaje)
    cacheMensajes.delete(claveAntigua)
    if (entrada.chat.messages?.[entrada.idMensaje] === entrada.mensaje) {
      delete entrada.chat.messages[entrada.idMensaje]
    }
  }

  while (estado.actuales.size > MAX_MENSAJES_POR_CHAT) {
    const siguiente = estado.orden[estado.inicio++]
    if (!siguiente) {
      estado.orden = [...estado.actuales.values()]
      estado.inicio = 0
      continue
    }
    if (!siguiente.mensaje || estado.actuales.get(siguiente.idMensaje) !== siguiente) continue

    const mensajeSiguiente = siguiente.mensaje
    olvidarMensajeCache(chat, siguiente.idMensaje, mensajeSiguiente)
    if (chat.messages?.[siguiente.idMensaje] === mensajeSiguiente) {
      delete chat.messages[siguiente.idMensaje]
    }
    while (estado.actuales.size > MENSAJES_POR_CHAT_TRAS_PODA) {
      const antiguo = estado.orden[estado.inicio++]
      if (!antiguo) {
        estado.orden = [...estado.actuales.values()]
        estado.inicio = 0
        continue
      }
      if (!antiguo.mensaje || estado.actuales.get(antiguo.idMensaje) !== antiguo) continue
      const mensajeAntiguo = antiguo.mensaje
      olvidarMensajeCache(chat, antiguo.idMensaje, mensajeAntiguo)
      if (chat.messages?.[antiguo.idMensaje] === mensajeAntiguo) {
        delete chat.messages[antiguo.idMensaje]
      }
    }
    break
  }

  compactarOrdenChat(estado)
}

export function registrarCacheMensajesExistentes(chats) {
  if (!chats || typeof chats !== 'object' || coleccionesPreparadas.has(chats)) return
  coleccionesPreparadas.add(chats)

  for (const chat of Object.values(chats)) {
    if (!chat?.messages || typeof chat.messages !== 'object') continue
    if (estadosChats.has(chat)) continue
    for (const [idMensaje, mensaje] of Object.entries(chat.messages)) {
      recordarMensajeCache(chat, idMensaje, mensaje)
    }
  }
}

function ultimaActividadChat(chat) {
  const recordada = Number(chat?._ultimoMensajeEn) || 0
  let ultima = Math.max(Number(chat?._metaEn) || 0, recordada)
  if (recordada) return ultima

  const mensajes = chat?.messages
  if (mensajes && typeof mensajes === 'object') {
    for (const clave of Object.keys(mensajes)) {
      const crudo = mensajes[clave]?.messageTimestamp
      const ts = typeof crudo === 'object' && typeof crudo?.toNumber === 'function'
        ? crudo.toNumber()
        : Number(crudo) || 0
      const ms = ts > 1e12 ? ts : ts * 1000
      if (ms > ultima) ultima = ms
    }
  }
  chat._ultimoMensajeEn = ultima
  return ultima
}

/**
 * Poda chats inactivos del socket. Retorna cuántos borró.
 * No toca listeners ni credenciales: solo memoria re-obtenible
 * (metadata, mensajes viejos). El chat del mensaje en curso siempre
 * queda porque su actividad es la más reciente.
 */
export function podarChatsSocket(conn, maxChats = MAX_CHATS_POR_SOCKET) {
  const chats = conn?.chats
  if (!chats || typeof chats !== 'object') return 0
  const ids = Object.keys(chats)
  if (ids.length <= maxChats) return 0
  ids.sort((a, b) => ultimaActividadChat(chats[a]) - ultimaActividadChat(chats[b]))
  let borrados = 0
  for (const id of ids.slice(0, ids.length - maxChats)) {
    const chat = chats[id]
    if (chat?.messages && typeof chat.messages === 'object') {
      for (const idMensaje of Object.keys(chat.messages)) {
        try {
          olvidarMensajeCache(chat, idMensaje, chat.messages[idMensaje])
        } catch {}
      }
    }
    delete chats[id]
    borrados++
  }
  return borrados
}

/**
 * Suelta la metadata de grupos inactivos. `conn.chats[id].metadata` guarda la
 * lista completa de participantes (lo más pesado de cada grupo) y se puede
 * volver a pedir con `groupMetadata` cuando un comando la necesite.
 */
export function podarMetadataChats(conn, {
  max = MAX_METADATA_POR_SOCKET,
  maxAgeMs = MAX_EDAD_METADATA_MS,
} = {}) {
  const chats = conn?.chats
  if (!chats || typeof chats !== 'object') return 0
  const ahora = Date.now()
  const candidatos = []
  let borrados = 0

  for (const id of Object.keys(chats)) {
    const chat = chats[id]
    if (!chat?.metadata?.participants?.length) continue
    if (!String(id).endsWith('@g.us')) {
      delete chat.metadata
      borrados++
      continue
    }
    candidatos.push({ chat, actividad: ultimaActividadChat(chat) })
  }

  candidatos.sort((a, b) => b.actividad - a.actividad)
  candidatos.forEach(({ chat, actividad }, indice) => {
    if (indice < max && ahora - actividad <= maxAgeMs) return
    delete chat.metadata
    borrados++
  })
  return borrados
}

/** Conteos baratos para diagnóstico (no serializa nada). */
export function estadisticasSockets(sockets = []) {
  const resumen = { sockets: 0, chats: 0, mensajes: 0, metadata: 0, participantes: 0 }
  for (const conn of sockets) {
    if (!conn?.chats || typeof conn.chats !== 'object') continue
    resumen.sockets++
    for (const chat of Object.values(conn.chats)) {
      resumen.chats++
      if (chat?.messages && typeof chat.messages === 'object') {
        for (const _ in chat.messages) resumen.mensajes++
      }
      const participantes = chat?.metadata?.participants
      if (Array.isArray(participantes) && participantes.length) {
        resumen.metadata++
        resumen.participantes += participantes.length
      }
    }
  }
  return resumen
}

export function tamanoCacheMensajes() {
  return cacheMensajes.size
}
