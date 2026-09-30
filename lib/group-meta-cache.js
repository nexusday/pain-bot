import NodeCache from 'node-cache'

/** Igual que Baileys y los MD: 5 minutos, y se renueva solo cuando el grupo avisa un cambio. */
const cache = new NodeCache({ stdTTL: 5 * 60, useClones: false, checkperiod: 120 })

function claveGrupo(conn, id) {
  try {
    return String(conn?.decodeJid?.(id) || id || '')
  } catch {
    return String(id || '')
  }
}

function digitos(valor) {
  return String(valor || '').split('@')[0].split(':')[0].replace(/\D/g, '')
}

export function invalidarMetadataGrupo(id) {
  const clave = String(id || '')
  if (clave) cache.del(clave)
}

export function metadataEnCache(id) {
  const datos = cache.get(String(id || ''))
  return datos?.participants?.length ? datos : undefined
}

export function registrarMetadata(id, datos) {
  if (!id || !datos?.participants?.length) return datos
  cache.set(String(id), datos)
  return datos
}

export async function metadataGrupo(conn, id, opciones = {}) {
  const clave = claveGrupo(conn, id)
  if (!clave) return null
  const conocido = metadataEnCache(clave)
  if (conocido && !opciones.esperar) return conocido
  if (typeof conn?.groupMetadata !== 'function') return conocido || null
  try {
    const datos = await conn.groupMetadata(clave)
    if (datos?.participants?.length) return registrarMetadata(clave, datos)
  } catch {}
  return conocido || null
}

function elBotSalio(conn, evento) {
  if (evento?.action !== 'remove') return false
  const mios = new Set(
    [conn?.user?.id, conn?.user?.jid, conn?.user?.lid].map(digitos).filter((n) => n.length >= 6)
  )
  return (evento.participants || []).some((p) => mios.has(digitos(p)))
}

/** Lo que hacen los MD: al cambiar el grupo, una consulta. Si el bot ya no está, no se pide. */
export async function refrescarMetadataSiSigue(conn, id, evento) {
  const clave = claveGrupo(conn, id)
  if (!clave || typeof conn?.groupMetadata !== 'function') return null
  if (elBotSalio(conn, evento)) {
    invalidarMetadataGrupo(clave)
    return null
  }
  try {
    const datos = await conn.groupMetadata(clave)
    if (datos?.participants?.length) return registrarMetadata(clave, datos)
  } catch {}
  return metadataEnCache(clave) || null
}
