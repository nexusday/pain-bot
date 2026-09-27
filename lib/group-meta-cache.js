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

/** Una sola petición de metadata por grupo, compartida entre el principal y los subbots. */
export async function metadataGrupo(conn, id) {
  const clave = claveGrupo(conn, id)
  if (!clave) return null

  const local = conn?.chats?.[clave]?.metadata
  if (local?.participants?.length) {
    cache.set(clave, { datos: local, en: Date.now() })
    return local
  }

  const guardado = cache.get(clave)
  if (guardado?.datos && Date.now() - guardado.en < VIGENCIA_MS) {
    guardar(conn, clave, guardado.datos)
    return guardado.datos
  }

  if (enCurso.has(clave)) return enCurso.get(clave)

  const pedido = conn.groupMetadata(clave)
    .then((datos) => guardar(conn, clave, datos))
    .catch(() => null)
    .finally(() => enCurso.delete(clave))

  enCurso.set(clave, pedido)
  return pedido
}
