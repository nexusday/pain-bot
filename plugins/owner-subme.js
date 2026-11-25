import ws from 'ws'
import { snapshotSesiones } from '../lib/session-registry.js'
import { enviarMensajeATodosLosSubBots } from '../lib/subme-broadcast.js'

const RAIZ = process.cwd()

function soloDigitos(valor) {
  return String(valor || '')
    .split('@')[0]
    .split(':')[0]
    .replace(/\D/g, '')
}

function estaConectado(connSub) {
  return Boolean(
    connSub?.user &&
    (connSub.ws?.isOpen === true || connSub.ws?.socket?.readyState === ws.OPEN)
  )
}

/** Sub-bots locales + los que viven en otros workers (archivos de estado). */
export function listarSubBotsConectados(conn) {
  const porNumero = new Map()
  const numeroPrincipal = soloDigitos(conn?.user?.jid || conn?.user?.id)

  const agregar = (valor, connSub = null) => {
    const numero = soloDigitos(valor)
    if (numero.length < 6) return
    if (numeroPrincipal && numero === numeroPrincipal) return
    const previo = porNumero.get(numero)
    if (previo) {
      if (!previo.connSub && connSub) previo.connSub = connSub
      return
    }
    porNumero.set(numero, { numero, connSub })
  }

  for (const connSub of global.conns || []) {
    if (connSub === global.conn || !estaConectado(connSub)) continue
    agregar(connSub.user?.jid || connSub.user?.id, connSub)
    agregar(connSub.phoneNumber || connSub.botNumber, connSub)
    if (connSub.pathAYBot) agregar(connSub.pathAYBot.split(/[\\/]/).pop(), connSub)
  }

  try {
    for (const session of snapshotSesiones()) {
      if (!session.connected) continue
      agregar(session.number || session.folder)
    }
  } catch (error) {
    console.error('[subme] No se pudieron leer los estados de los workers:', error?.message || error)
  }

  return [...porNumero.values()]
}

/**
 * Cada sub-bot se escribe a SÍ MISMO el texto (su chat "mensajes para ti
 * mismo"). El principal NO le escribe a nadie: ni a los sub-bots, ni al
 * owner (ni siquiera una confirmación). Solo reparte la orden.
 */
let handler = async (m, { conn, usedPrefix, command, args, text, isOwner }) => {
  if (!isOwner) {
    return m.reply('*[❗] Solo los dueños pueden usar este comando.*')
  }

  try {
    if (conn !== global.conn) {
      return m.reply('*[❗] Este comando solo puede ser usado desde el bot principal.*')
    }

    if (!text) {
      return m.reply(`*[❗] Debes proporcionar un mensaje para enviar a los sub-bots.\n\n> Ejemplo: ${usedPrefix + command} Se acaba de actualizar nuevos comandos a los sub bots, usalo yaaa.`)
    }

    if (!listarSubBotsConectados(conn).length) {
      return m.reply('*[❗] No hay sub-bots conectados en este momento.*')
    }

    // Reparte la orden y no contesta nada: cada sub-bot se escribe a sí mismo.
    const resultado = await enviarMensajeATodosLosSubBots({ text })
    console.log(
      `[subme] Mensaje repartido: ${resultado.enviados} sub-bot(s) se lo escribieron ` +
      `en su propio chat${resultado.fallidos?.length ? `, ${resultado.fallidos.length} fallaron` : ''}.`
    )

  } catch (e) {
    console.error('Error en comando subme:', e)
  }
}

handler.command = ['subme', 'submessage', 'submsg']
handler.tags = ['owner']
handler.help = ['subme <mensaje> - Cada sub-bot se escribe el mensaje a sí mismo']
handler.rowner = true

export default handler
