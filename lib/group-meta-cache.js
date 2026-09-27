const cache = new Map()
const enCurso = new Map()
const VIGENCIA_MS = 60_000

function claveGrupo(conn, id) {
  try {
    return conn?.decodeJid?.(id) || id
  } catch {
    return id
  }
}

function guardar(conn, id, datos) {
  if (!id || !datos) return datos
  cache.set(id, { datos, en: Date.now() })
  if (conn?.chats) {
    const chat = conn.chats[id] || (conn.chats[id] = { id })
    chat.metadata = datos
    chat.subject = datos.subject || chat.subject
    chat._metaEn = Date.now()
    chat.isChats = true
  }
  return datos
}

export function invalidarMetadataGrupo(id) {
  if (!id) return
  const plano = String(id)
  cache.delete(plano)
  enCurso.delete(plano)
  for (const clave of [...cache.keys()]) {
    if (clave === plano || String(clave).split('@')[0] === plano.split('@')[0]) {
      cache.delete(clave)
      enCurso.delete(clave)
    }
  }
}

/** Una sola petición de metadata por grupo, compartida entre el principal y los subbots. */
export async function metadataGrupo(conn, id, opciones = {}) {
  const clave = claveGrupo(conn, id)
  if (!clave) return null
  const forzar = opciones.forzar === true

  if (!forzar) {
    const chat = conn?.chats?.[clave]
    const local = chat?.metadata
    const edad = Date.now() - (chat?._metaEn || 0)
    if (local?.participants?.length && chat?._metaEn && edad < VIGENCIA_MS) {
      cache.set(clave, { datos: local, en: chat._metaEn })
      return local
    }

    const guardado = cache.get(clave)
    if (guardado?.datos?.participants?.length && Date.now() - guardado.en < VIGENCIA_MS) {
      guardar(conn, clave, guardado.datos)
      return guardado.datos
    }
  } else {
    cache.delete(clave)
  }

  if (!forzar && enCurso.has(clave)) return enCurso.get(clave)

  const pedido = Promise.race([
    conn.groupMetadata(clave)
      .then((datos) => guardar(conn, clave, datos))
      .catch(() => null),
    new Promise((resolve) => setTimeout(() => resolve(null), 4000)),
  ]).finally(() => enCurso.delete(clave))

  enCurso.set(clave, pedido)
  return pedido
}
