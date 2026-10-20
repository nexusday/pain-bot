import ws from 'ws'
import { readSubbotWorkerStatuses } from '../lib/subbot-status.js'
import { enviarMensajeATodosLosSubBots, resumirFallidos } from '../lib/subme-broadcast.js'

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
    for (const worker of readSubbotWorkerStatuses(RAIZ)) {
      for (const session of worker.sessions) {
        if (!session.connected) continue
        agregar(session.number || session.folder)
      }
    }
  } catch (error) {
    console.error('[subme] No se pudieron leer los estados de los workers:', error?.message || error)
  }

  return [...porNumero.values()]
}

/**
 * JID del owner: el de quien ejecutó el comando. Se prefiere el número real
 * (PN) para que cada sub-bot pueda escribirle en su privado sin adivinar el LID.
 */
async function resolverDestinoOwner(m, conn) {
  const candidatos = [m?.sender, m?.key?.participantAlt, m?.key?.remoteJidAlt]
  for (const candidato of candidatos) {
    const valor = String(candidato || '').trim()
    if (!valor) continue
    if (valor.endsWith('@s.whatsapp.net') || valor.endsWith('@c.us')) return valor
  }

  const jid = String(m?.sender || '').trim()
  if (!jid) return ''
  try {
    const { resolverNumeroTelefono } = await import('../lib/resolve-phone.js')
    const telefono = await Promise.race([
      resolverNumeroTelefono(jid, conn, null, m),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
    ])
    if (telefono) return `${soloDigitos(telefono)}@s.whatsapp.net`
  } catch (error) {
    console.error('[subme] No se pudo resolver el número del owner:', error?.message || error)
  }
  return jid
}

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

    const destino = await resolverDestinoOwner(m, conn)
    if (!destino) {
      return m.reply('*[❗] No se pudo detectar tu chat para escribirte.*')
    }

    if (!listarSubBotsConectados(conn).length) {
      return m.reply('*[❗] No hay sub-bots conectados en este momento.*')
    }

    // Cada sub-bot abre su propio chat privado con el owner y le escribe ahí.
    const resultado = await enviarMensajeATodosLosSubBots({ jid: destino, text })
    const total = resultado.enviados + resultado.fallidos.length

    if (!total) {
      return m.reply('*[❗] No hay sub-bots conectados en este momento.*')
    }

    const fallidos = Array.isArray(resultado.fallidos) ? resultado.fallidos : []
    const detalleFallidos = fallidos.length
      ? `\n┊ sin enviar  ·  \`${resumirFallidos(fallidos)}\``
      : ''

    const mensajeConfirmacion = `
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *subme*
╰─ ✧  ✩
┊ sub-bots  ·  \`${total}\`
┊ enviaron  ·  \`${resultado.enviados}\`
┊ fallaron  ·  \`${fallidos.length}\`${detalleFallidos}
╰─────────`.trim()

    await conn.sendMessage(m.chat, {
      text: mensajeConfirmacion,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })

  } catch (e) {
    console.error('Error en comando subme:', e)
    conn.reply(m.chat, '❌ Hubo un error al enviar el mensaje a los sub-bots.', m, rcanal)
  }
}

handler.command = ['subme', 'submessage', 'submsg']
handler.tags = ['owner']
handler.help = ['subme <mensaje> - Cada sub-bot te escribe el mensaje en tu privado']
handler.rowner = true

export default handler
