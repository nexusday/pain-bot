const cache = new Map()
const enCurso = new Map()
const ultimaRed = new Map()

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

const REINTENTO_FALLO_MS = 10 * 60_000

async function pedirRed(conn, clave) {
  await tomarTurnoRed()
  try {
    const datos = await Promise.race([
      Promise.resolve()
        .then(() => conn.groupMetadata(clave))
        .catch(() => null),
      new Promise((resolve) => setTimeout(() => resolve(null), TOPE_ESPERA_MS)),
    ])
    ultimaRed.set(clave, Date.now())
    if (datos?.participants?.length) return guardar(conn, clave, datos)
    return cache.get(clave)?.datos || null
  } finally {
    soltarTurnoRed()
  }
}

function programarRefresco(conn, clave) {
  if (enCurso.has(clave)) return
  if (typeof conn?.groupMetadata !== 'function') return
  if (Date.now() - (ultimaRed.get(clave) || 0) < REINTENTO_FALLO_MS) return
  if (redesActivas >= MAX_REDES || esperaRed.length > 8) return

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
 * No espera a WhatsApp.
 * Si ya hay datos, se devuelven ya. Si faltan o están viejos, la consulta
 * va detrás, una sola por grupo, y el mensaje no se queda parado.
 * `esperar: true` solo para casos que no pueden seguir sin la lista (bienvenida).
 */
export async function metadataGrupo(conn, id, opciones = {}) {
  const clave = claveGrupo(conn, id)
  if (!clave) return null

  const conocido = leerConocido(conn, clave)
  if (conocido?.datos?.participants?.length && !opciones.esperar) {
    aplicarEnConn(conn, clave, conocido.datos, conocido.en)
    return conocido.datos
  }

  const esperar = opciones.esperar === true
  const puedeRed = Date.now() - (ultimaRed.get(clave) || 0) >= REINTENTO_FALLO_MS

  if (!esperar || typeof conn?.groupMetadata !== 'function') {
    if (puedeRed) programarRefresco(conn, clave)
    return conocido?.datos || null
  }

  if (enCurso.has(clave)) {
    const datos = await enCurso.get(clave)
    if (datos?.participants?.length) return datos
    return conocido?.datos || null
  }

  const datos = await arrancarPedido(conn, clave)
  if (datos?.participants?.length) aplicarEnConn(conn, clave, datos, cache.get(clave)?.en || Date.now())
  return datos || conocido?.datos || null
}
