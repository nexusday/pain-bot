const cache = new Map()
const enCurso = new Map()
const ultimaRed = new Map()

const VIGENCIA_MS = 5 * 60_000
const MIN_ENTRE_REDES_MS = 3 * 60_000
const TOPE_ESPERA_MS = 8_000
const MAX_REDES = 2

let redesActivas = 0
const esperaRed = []

function claveGrupo(conn, id) {
  try {
    return String(conn?.decodeJid?.(id) || id || '')
  } catch {
    return String(id || '')
  }
}

function tomarTurnoRed() {
  if (redesActivas < MAX_REDES) {
    redesActivas++
    return Promise.resolve()
  }
  return new Promise((resolve) => esperaRed.push(resolve))
}

function soltarTurnoRed() {
  const siguiente = esperaRed.shift()
  if (siguiente) siguiente()
  else redesActivas = Math.max(0, redesActivas - 1)
}

function aplicarEnConn(conn, id, datos, en) {
  if (!conn?.chats || !id || !datos) return datos
  const chat = conn.chats[id] || (conn.chats[id] = { id })
  chat.metadata = datos
  chat.subject = datos.subject || chat.subject
  chat._metaEn = en
  chat.isChats = true
  return datos
}

function guardar(conn, id, datos) {
  if (!id || !datos?.participants?.length) return null
  const en = Date.now()
  cache.set(id, { datos, en })
  aplicarEnConn(conn, id, datos, en)
  return datos
}

function leerConocido(conn, clave) {
  const guardado = cache.get(clave)
  if (guardado?.datos?.participants?.length) return guardado

  const chat = conn?.chats?.[clave]
  if (chat?.metadata?.participants?.length && chat._metaEn) {
    const entrada = { datos: chat.metadata, en: chat._metaEn }
    cache.set(clave, entrada)
    return entrada
  }
  return null
}

function mismoGrupo(clave, plano) {
  return clave === plano || String(clave).split('@')[0] === String(plano).split('@')[0]
}

export function invalidarMetadataGrupo(id) {
  if (!id) return
  const plano = String(id)
  for (const clave of new Set([...cache.keys(), ...enCurso.keys(), ...ultimaRed.keys(), plano])) {
    if (!mismoGrupo(clave, plano)) continue
    cache.delete(clave)
    enCurso.delete(clave)
    ultimaRed.delete(clave)
  }
}

/** Solo caché, sin red. Baileys la usa al enviar para no volver a pedir el grupo. */
export function metadataEnCache(id) {
  if (!id) return undefined
  const clave = String(id)
  const directo = cache.get(clave)
  if (directo?.datos?.participants?.length) return directo.datos

  const base = clave.split('@')[0]
  for (const [guardada, entrada] of cache) {
    if (String(guardada).split('@')[0] === base && entrada?.datos?.participants?.length) {
      return entrada.datos
    }
  }
  return undefined
}

async function pedirRed(conn, clave) {
  await tomarTurnoRed()
  ultimaRed.set(clave, Date.now())
  try {
    const datos = await Promise.race([
      Promise.resolve()
        .then(() => conn.groupMetadata(clave))
        .catch(() => null),
      new Promise((resolve) => setTimeout(() => resolve(null), TOPE_ESPERA_MS)),
    ])
    if (datos?.participants?.length) return guardar(conn, clave, datos)
    return cache.get(clave)?.datos || null
  } finally {
    soltarTurnoRed()
  }
}

function programarRefresco(conn, clave) {
  if (enCurso.has(clave)) return
  if (typeof conn?.groupMetadata !== 'function') return
  if (Date.now() - (ultimaRed.get(clave) || 0) < MIN_ENTRE_REDES_MS) return

  const trabajo = pedirRed(conn, clave)
  enCurso.set(clave, trabajo)
  trabajo.finally(() => {
    if (enCurso.get(clave) === trabajo) enCurso.delete(clave)
  })
}

function arrancarPedido(conn, clave) {
  if (enCurso.has(clave)) return enCurso.get(clave)
  const trabajo = pedirRed(conn, clave)
  enCurso.set(clave, trabajo)
  trabajo.finally(() => {
    if (enCurso.get(clave) === trabajo) enCurso.delete(clave)
  })
  return trabajo
}

/**
 * Caché compartida entre el principal y los sub-bots.
 * Si ya hay datos, se devuelven al momento y la red va en segundo plano,
 * con tope de 2 consultas a la vez para no llenar el socket.
 */
export async function metadataGrupo(conn, id, opciones = {}) {
  const clave = claveGrupo(conn, id)
  if (!clave) return null

  const conocido = leerConocido(conn, clave)
  const forzar = opciones.forzar === true
  const edad = conocido ? Date.now() - conocido.en : Infinity
  const fresco = Boolean(conocido) && edad < VIGENCIA_MS
  const puedeRed = Date.now() - (ultimaRed.get(clave) || 0) >= MIN_ENTRE_REDES_MS

  if (conocido && fresco && !(forzar && edad > 2 * 60_000)) {
    aplicarEnConn(conn, clave, conocido.datos, conocido.en)
    return conocido.datos
  }

  if (conocido && !puedeRed) {
    aplicarEnConn(conn, clave, conocido.datos, conocido.en)
    return conocido.datos
  }

  if (conocido) {
    aplicarEnConn(conn, clave, conocido.datos, conocido.en)
    programarRefresco(conn, clave)
    return conocido.datos
  }

  if (typeof conn?.groupMetadata !== 'function') return null

  if (enCurso.has(clave) || redesActivas >= MAX_REDES) {
    programarRefresco(conn, clave)
    return null
  }

  const datos = await arrancarPedido(conn, clave)
  if (datos?.participants?.length) aplicarEnConn(conn, clave, datos, cache.get(clave)?.en || Date.now())
  return datos || null
}
