const MAX_MENSAJES_CACHEADOS = 20_000
const MAX_MENSAJES_POR_CHAT = 200
const MENSAJES_POR_CHAT_TRAS_PODA = 150
// Tope de chats por socket: conn.chats acumulaba metadata con todos los
// participantes PARA SIEMPRE en cada uno de los 150 sockets (misma metadata
// duplicada 30 veces por worker). Al superar el tope se conservan los de
// actividad reciente; el resto se re-obtiene bajo demanda (ya hay fallback).
const MAX_CHATS_POR_SOCKET = 500

const idsCacheChat = new WeakMap()
const estadosChats = new WeakMap()
const coleccionesPreparadas = new WeakSet()
const cacheMensajes = new Map()
let siguienteIdCacheChat = 0

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

export function recordarMensajeCache(chat, idMensaje, mensaje) {
  if (!chat || !idMensaje || !mensaje || chat.messages?.[idMensaje] !== mensaje) return

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
  let ultima = Number(chat?._metaEn) || 0
  const mensajes = chat?.messages
  if (mensajes && typeof mensajes === 'object') {
    for (const clave of Object.keys(mensajes)) {
      const ts = Number(mensajes[clave]?.messageTimestamp) || 0
      const ms = ts > 1e12 ? ts : ts * 1000
      if (ms > ultima) ultima = ms
    }
  }
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
