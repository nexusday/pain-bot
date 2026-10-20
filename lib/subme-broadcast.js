/**
 * /subme: cada sub-bot se envía el mensaje A SU PROPIO WhatsApp.
 *
 * El bot principal no escribe a los sub-bots, y los sub-bots tampoco se
 * escriben entre sí: cada uno abre su propio chat ("mensajes para ti mismo")
 * y se escribe ahí el texto que pidió el owner.
 *
 * Como los sub-bots viven en procesos aparte (workers supervisados), el
 * principal pide al supervisor que cada worker lo mande con sus sockets.
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

/** JID propio del sub-bot: el destino de su chat "mensajes para ti mismo". */
export function jidPropioSubBot(socket) {
  const numero = numeroDeSubBot(socket)
  if (!numero) return ''
  return `${numero}@s.whatsapp.net`
}

/**
 * Cada sub-bot se escribe a sí mismo el texto.
 * Envía en lotes: con 150 sub-bots, uno a uno tardaría demasiado.
 */
export async function enviarMensajeASuPropioChat(text, sockets = [], { concurrencia = 5 } = {}) {
  let enviados = 0
  const fallidos = []

  const enviarUno = async (socket) => {
    const numero = numeroDeSubBot(socket)
    try {
      const destino = jidPropioSubBot(socket)
      if (!destino) throw new Error('El sub-bot no tiene número propio')
      await socket.sendMessage(destino, { text })
      enviados++
    } catch {
      fallidos.push(numero || 'desconocido')
    }
  }

  const tamanhoLote = Math.max(1, Number(concurrencia) || 5)
  for (let i = 0; i < sockets.length; i += tamanhoLote) {
    const lote = sockets.slice(i, i + tamanhoLote)
    await Promise.all(lote.map(enviarUno))
  }

  return { enviados, fallidos, total: sockets.length }
}

/**
 * Pide que TODOS los sub-bots se escriban a sí mismos el texto.
 * - Sin supervisor: los sub-bots están en este mismo proceso.
 * - Con supervisor: se pide a cada worker que lo mande con sus sockets.
 */
export async function enviarMensajeATodosLosSubBots({ text } = {}) {
  const sockets = (global.conns || []).filter(Boolean)
  if (sockets.length) {
    const resultado = await enviarMensajeASuPropioChat(text, sockets)
    return { ...resultado, workers: 1 }
  }

  const ack = await requestEnviarPrivadoSubBots({ text })
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
