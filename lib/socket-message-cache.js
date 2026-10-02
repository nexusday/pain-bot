const MAX_MENSAJES_CACHEADOS = 20_000
const MAX_MENSAJES_POR_CHAT = 200
const MENSAJES_POR_CHAT_TRAS_PODA = 150

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
