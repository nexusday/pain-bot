import { resolverAdminRemitente, invalidarIndiceParticipantes } from '../group-participant.js'
import { registrarMetadata } from '../group-meta-cache.js'

const mensajes = new WeakMap()
const consultas = new WeakMap()

async function metadataActual(conn, chat) {
  if (typeof conn?.groupMetadata !== 'function') return null
  let grupos = consultas.get(conn)
  if (!grupos) { grupos = new Map(); consultas.set(conn, grupos) }
  if (grupos.has(chat)) return grupos.get(chat)
  const pendiente = (async () => {
    try {
      const meta = await conn.groupMetadata(chat)
      if (!Array.isArray(meta?.participants) || !meta.participants.length) return null
      invalidarIndiceParticipantes(meta.participants)
      registrarMetadata(chat, meta)
      if (conn.chats?.[chat]) conn.chats[chat].metadata = meta
      return meta
    } catch { return null }
  })()
  grupos.set(chat, pendiente)
  try { return await pendiente } finally { if (grupos.get(chat) === pendiente) grupos.delete(chat) }
}

/**
 * Verificar antes de sancionar, no antes de detectar la infracción.
 * Un fallo de metadata NO convierte a nadie en admin, pero impide borrar o
 * expulsar a una persona cuyo rol no se pudo comprobar. Compartido por los
 * antis del mismo mensaje y por consultas simultáneas del mismo grupo.
 */
export async function verificarAdminAnti(m, conn, participants = []) {
  if (!m?.isGroup || m.fromMe || m.key?.fromMe || !conn) {
    return { puedeModerar: false, isAdmin: false, identificado: false, participants }
  }
  let conexiones = mensajes.get(m)
  if (!conexiones) { conexiones = new WeakMap(); mensajes.set(m, conexiones) }
  const firma = `${m.chat}|${m.sender}|${m.key?.id || ''}`
  const anterior = conexiones.get(conn)
  if (anterior?.firma === firma && anterior.hasta > Date.now()) return anterior.promesa
  const promesa = (async () => {
    const meta = await metadataActual(conn, m.chat)
    if (!meta) {
      // No usar un isAdmin=false ni una lista antigua para castigar.
      return { puedeModerar: false, isAdmin: false, identificado: false, participants }
    }
    const flags = await resolverAdminRemitente(meta.participants, m, conn, meta.owner)
    return { ...flags, participants: meta.participants, puedeModerar: flags.identificado && !flags.isAdmin }
  })()
  conexiones.set(conn, { firma, hasta: Date.now() + 2500, promesa })
  return promesa
}
