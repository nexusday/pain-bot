/**
 * /subme: cada sub-bot envía el mensaje al privado de quien lo pidió.
 *
 * El bot principal NO les escribe a los sub-bots: cada sub-bot abre su propio
 * chat privado con el owner y le escribe ahí. Como los sub-bots viven en
 * procesos aparte (workers supervisados), el principal pide al supervisor que
 * cada worker mande el mensaje con sus propios sockets.
 */
import { requestEnviarPrivadoSubBots } from './process-isolation.js'

const MAX_FALLIDOS_REPORTADOS = 25

/** Número público de un sub-bot (para reportar cuál falló). */
export function numeroDeSubBot(socket) {
  const candidatos = [
    socket?.phoneNumber,
    socket?.botNumber,
    socket?.user?.jid,
    socket?.user?.id,
    socket?.authState?.creds?.me?.id,
  ]
  for (const valor of candidatos) {
    const digitos = String(valor || '').split('@')[0].split(':')[0].replace(/\D/g, '')
    if (digitos.length >= 6) return digitos
  }
  const ruta = socket?.pathAYBot ? String(socket.pathAYBot).split(/[\\/]/).pop() : ''
  const digitosRuta = ruta.replace(/\D/g, '')
  return digitosRuta.length >= 6 ? digitosRuta : ''
}

/** Convierte el destino a un JID que el socket pueda usar (LID -> PN). */
export async function resolverDestinoPrivado(conn, jid) {
  const destino = String(jid || '').trim()
  if (!destino) return ''
  if (destino.endsWith('@s.whatsapp.net') || destino.endsWith('@c.us')) return destino
  try {
    const pn = await conn?.signalRepository?.lidMapping?.getPNForLID?.(destino)
    if (pn) return String(pn)
  } catch {}
  return destino
}

/** Envía el texto a un JID desde una lista de sockets (uno por sub-bot). */
export async function enviarPrivadoDesdeSockets(jid, text, sockets = [], { concurrencia = 5 } = {}) {
  let enviados = 0
  const fallidos = []

  const enviarUno = async (socket) => {
    const numero = numeroDeSubBot(socket)
    try {
      const destino = await resolverDestinoPrivado(socket, jid)
      if (!destino) throw new Error('Sin destinatario')
      await socket.sendMessage(destino, { text })
      enviados++
    } catch {
      fallidos.push(numero || 'desconocido')
    }
  }

  // Por lotes: con 150 sub-bots, uno a uno tarda demasiado y de golpe
  // saturaría la conexión.
  const tamanhoLote = Math.max(1, Number(concurrencia) || 5)
  for (let i = 0; i < sockets.length; i += tamanhoLote) {
    const lote = sockets.slice(i, i + tamanhoLote)
    await Promise.all(lote.map(enviarUno))
  }

  return { enviados, fallidos, total: sockets.length }
}

/**
 * Envía el mensaje al owner desde TODOS los sub-bots.
 * - Sin supervisor: los sub-bots están en este mismo proceso.
 * - Con supervisor: se pide a cada worker que lo mande con sus sockets.
 */
export async function enviarMensajeATodosLosSubBots({ jid, text } = {}) {
  const sockets = (global.conns || []).filter(Boolean)
  if (sockets.length) {
    const resultado = await enviarPrivadoDesdeSockets(jid, text, sockets)
    return { ...resultado, workers: 1 }
  }

  const ack = await requestEnviarPrivadoSubBots({ jid, text })
  if (!ack) return { enviados: 0, fallidos: [], total: 0, workers: 0, sinWorkers: true }
  return {
    enviados: Number(ack.enviados) || 0,
    fallidos: Array.isArray(ack.fallidos) ? ack.fallidos : [],
    total: (Number(ack.enviados) || 0) + (Array.isArray(ack.fallidos) ? ack.fallidos.length : 0),
    workers: Number(ack.workers) || 0,
  }
}

/** Recorta la lista de fallidos para que el mensaje no sea infinito. */
export function resumirFallidos(fallidos = []) {
  const lista = fallidos.filter(Boolean)
  if (lista.length <= MAX_FALLIDOS_REPORTADOS) {
    return lista.map((numero) => `+${String(numero).replace(/\D/g, '')}`).join(', ')
  }
  const primeros = lista.slice(0, MAX_FALLIDOS_REPORTADOS)
    .map((numero) => `+${String(numero).replace(/\D/g, '')}`)
  return `${primeros.join(', ')} (+${lista.length - MAX_FALLIDOS_REPORTADOS} más)`
}
