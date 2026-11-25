import NodeCache from 'node-cache'
import { jidsParticipante, candidatosJidRemitente, jidsSeSolapan, invalidarIndiceParticipantes } from './group-participant.js'

/** Baileys puede entregar JIDs o participantes completos en los eventos. */
export function aplicarCambioParticipantes(metadata, participantes, action, conn) {
  if (!metadata || !Array.isArray(participantes)) return
  if (!Array.isArray(metadata.participants)) metadata.participants = []
  const ids = participantes.flatMap(p => typeof p === 'string'
    ? candidatosJidRemitente(null, conn, [p]) : jidsParticipante(p, conn))
  const coincide = p => jidsSeSolapan(jidsParticipante(p, conn), ids)
  invalidarIndiceParticipantes(metadata.participants)
  if (action === 'remove') metadata.participants = metadata.participants.filter(p => !coincide(p))
  else if (action === 'promote' || action === 'demote') {
    for (const p of metadata.participants) if (coincide(p)) p.admin = action === 'promote' ? 'admin' : null
  } else if (action === 'add') {
    for (const p of participantes) {
      const nuevo = typeof p === 'string' ? { id: p, admin: null } : { ...p, id: p.id || p.jid || jidsParticipante(p, conn)[0], admin: p.admin ?? null }
      if (nuevo.id && !metadata.participants.some(actual => jidsSeSolapan(jidsParticipante(actual, conn), jidsParticipante(nuevo, conn)))) {
        metadata.participants.push(nuevo)
      }
    }
  }
  invalidarIndiceParticipantes(metadata.participants)
}

/** Igual que Baileys y los MD: 5 minutos, y se renueva solo cuando el grupo avisa un cambio. */
const cache = new NodeCache({ stdTTL: 5 * 60, useClones: false, checkperiod: 60 })

// node-cache lanza ECACHEFULL al llegar a maxKeys en vez de desalojar, así que
// el tope se aplica a mano. Sin tope, un worker con cientos de grupos activos
// retenía todas las listas de participantes.
const MAX_METADATA_CACHE = Math.max(
  50,
  Number.parseInt(process.env.PAIN_MAX_GROUP_META, 10) || 800
)

function recortarMetadataCache() {
  const total = cache.getStats().keys
  if (total <= MAX_METADATA_CACHE) return
  const sobran = total - MAX_METADATA_CACHE
  for (const clave of cache.keys().slice(0, sobran)) cache.del(clave)
}

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
  try {
    cache.set(String(id), datos)
    recortarMetadataCache()
  } catch (error) {
    // Nunca debe romper el flujo del grupo por un problema de caché.
    console.error('[grupo] No se pudo cachear la metadata:', error?.message || error)
  }
  return datos
}

// Deduplica consultas simultáneas del mismo grupo: varios sockets o ráfagas de
// mensajes comparten UNA consulta a WhatsApp en lugar de disparar decenas
// contra el servidor (cada consulta podía tardar hasta su timeout completo y
// cargar el event loop del worker).
const consultasEnCurso = new Map()
// Tope de espera para llamadas del camino caliente (no `esperar`): un mensaje
// no debe quedarse colgado 20 s porque WhatsApp tardó en contestar. Se lee por
// llamada para que sea configurable y testeable en el mismo proceso.
function topeEsperaConsulta() {
  const bruto = Number.parseInt(process.env.PAIN_META_FETCH_MAX_MS, 10)
  return Math.min(Math.max(Number.isInteger(bruto) ? bruto : 5000, 2000), 20000)
}

function pedirMetadata(conn, clave) {
  const enCurso = consultasEnCurso.get(clave)
  if (enCurso) return enCurso
  const consulta = (async () => {
    try {
      const datos = await conn.groupMetadata(clave)
      if (datos?.participants?.length) return registrarMetadata(clave, datos)
      return null
    } catch {
      return null
    } finally {
      consultasEnCurso.delete(clave)
    }
  })()
  consultasEnCurso.set(clave, consulta)
  return consulta
}

export async function metadataGrupo(conn, id, opciones = {}) {
  const clave = claveGrupo(conn, id)
  if (!clave) return null
  const conocido = metadataEnCache(clave)
  if (conocido && !opciones.esperar) return conocido

  const metadataLocal =
    conn?.chats?.[clave]?.metadata ||
    conn?.chats?.[id]?.metadata
  if (!opciones.esperar && metadataLocal?.participants?.length) {
    return registrarMetadata(clave, metadataLocal)
  }
  if (typeof conn?.groupMetadata !== 'function') return conocido || metadataLocal || null
  const consulta = pedirMetadata(conn, clave)
  if (opciones.esperar) {
    try {
      const datos = await consulta
      if (datos?.participants?.length) return datos
    } catch {}
    return conocido || metadataLocal || null
  }
  // Camino caliente: espera acotada. Si WhatsApp no contesta a tiempo, se
  // devuelve lo que haya (caché expirada o metadata local) y la consulta real
  // queda en curso para los siguientes mensajes del mismo grupo.
  let datos = null
  try {
    datos = await Promise.race([
      consulta,
      new Promise((resolver) => setTimeout(() => resolver(null), topeEsperaConsulta())),
    ])
  } catch {}
  if (datos?.participants?.length) return datos
  return conocido || metadataLocal || null
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
    const datos = await pedirMetadata(conn, clave)
    if (datos?.participants?.length) return datos
  } catch {}
  return metadataEnCache(clave) || null
}
