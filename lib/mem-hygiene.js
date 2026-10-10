/**
 * Higiene de memoria por proceso. Todo lo que se poda aquí es
 * re-obtenible bajo demanda (metadata, mensajes viejos, búsquedas
 * expiradas): nunca se tocan sockets, credenciales ni DB.
 */
import { podarChatsSocket } from './socket-message-cache.js'

const MAX_BUSQUEDAS_YT = 2000
const EDAD_MAX_BUSQUEDA_MS = 30 * 60 * 1000
const EDAD_MAX_DESCARGA_PENDIENTE_MS = 10 * 60 * 1000

function podarObjetoConFecha(raiz, edadMaxMs, maxClaves = Infinity) {
  if (!raiz || typeof raiz !== 'object') return 0
  const ahora = Date.now()
  let borradas = 0
  for (const clave of Object.keys(raiz)) {
    const at = Number(raiz[clave]?.at) || 0
    if (at && ahora - at > edadMaxMs) {
      delete raiz[clave]
      borradas++
    }
  }
  const restantes = Object.keys(raiz)
  if (restantes.length > maxClaves) {
    restantes
      .sort((a, b) => (Number(raiz[a]?.at) || 0) - (Number(raiz[b]?.at) || 0))
      .slice(0, restantes.length - maxClaves)
      .forEach((clave) => {
        delete raiz[clave]
        borradas++
      })
  }
  return borradas
}

export function higieneMemoriaProceso() {
  const resumen = { chats: 0, yt: 0, descargas: 0 }
  try {
    const sockets = new Set([global.conn, ...(global.conns || [])])
    for (const sock of sockets) {
      if (!sock?.chats) continue
      try {
        resumen.chats += podarChatsSocket(sock) || 0
      } catch {}
    }
  } catch {}
  try {
    resumen.yt = podarObjetoConFecha(global.lastYtSearch, EDAD_MAX_BUSQUEDA_MS, MAX_BUSQUEDAS_YT)
  } catch {}
  try {
    resumen.descargas = podarObjetoConFecha(global.pendingYtDescarga, EDAD_MAX_DESCARGA_PENDIENTE_MS)
  } catch {}
  if (resumen.chats || resumen.yt || resumen.descargas) {
    console.log(
      `[mem] Higiene: ${resumen.chats} chat(s), ${resumen.yt} búsqueda(s), ` +
      `${resumen.descargas} descarga(s) pendiente(s) liberados.`
    )
  }
  return resumen
}

export {
  higieneMemoriaProceso as runMemoryHygiene,
}
