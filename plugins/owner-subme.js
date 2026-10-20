import ws from 'ws'
import { readSubbotWorkerStatuses } from '../lib/subbot-status.js'

const RAIZ = process.cwd()

function soloDigitos(valor) {
  return String(valor || '')
    .split('@')[0]
    .split(':')[0]
    .replace(/\D/g, '')
}

/** JID del sub-bot: respeta @lid / @hosted.lid si el estado lo trae. */
function jidDesdeNumero(valor) {
  const crudo = String(valor || '').trim()
  if (!crudo) return ''
  const [base, dominio] = crudo.split('@')
  const numero = soloDigitos(base)
  if (numero.length < 6) return ''
  if (dominio) return `${numero}@${dominio}`
  return `${numero}@s.whatsapp.net`
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
    const jid = jidDesdeNumero(valor)
    const numero = soloDigitos(valor)
    if (!jid || numero.length < 6) return
    if (numeroPrincipal && numero === numeroPrincipal) return
    const previo = porNumero.get(numero)
    if (previo) {
      if (!previo.connSub && connSub) previo.connSub = connSub
      return
    }
    porNumero.set(numero, { numero, jid, connSub })
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

let handler = async (m, { conn, usedPrefix, command, args, text, isOwner }) => {
  if (!isOwner) {
    return m.reply('*[❗] Solo los dueños pueden usar este comando.*')
  }

  try {
    
    if (conn !== global.conn) {
      return m.reply('*[❗] Este comando solo puede ser usado desde el bot principal.*')
    }

    
    if (!text) {
      return m.reply(`*[❗] Debes proporcionar un mensaje para enviar a los sub-bots.*\n\n> Ejemplo: ${usedPrefix + command} Se acaba de actualizar nuevos comandos a los sub bots, usalo yaaa.`)
    }

    
    const subBotsConectados = listarSubBotsConectados(conn)

    if (subBotsConectados.length === 0) {
      return m.reply('*[❗] No hay sub-bots conectados en este momento.*')
    }

    
    let conteoEnviados = 0
    const fallidos = []

    
    for (const subBot of subBotsConectados) {
      try {
        // A los sub-bots les llega únicamente el mensaje del owner.
        await conn.sendMessage(subBot.jid, { text })
        conteoEnviados++
        console.log(`✅ Mensaje enviado a sub-bot: ${subBot.jid}`)
      } catch (error) {
        fallidos.push(subBot.numero)
        console.error(`❌ Error enviando mensaje a sub-bot ${subBot.jid}:`, error.message)
      }
    }

    const lineasFallidos = fallidos.length
      ? fallidos.map(numero => `┊ sin enviar  ·  \`+${numero}\``).join('\n')
      : ''
    const bloqueFallidos = lineasFallidos ? `\n${lineasFallidos}` : ''

    const mensajeConfirmacion = `
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *subme*
╰─ ✧  ✩
┊ sub-bots  ·  \`${subBotsConectados.length}\`
┊ enviados  ·  \`${conteoEnviados}\`
┊ fallidos  ·  \`${fallidos.length}\`${bloqueFallidos}
╰─────────`.trim()

    await conn.sendMessage(m.chat, {
      text: mensajeConfirmacion,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })

  } catch (e) {
    console.error('Error en comando subme:', e)
    conn.reply(m.chat, '❌ Hubo un error al enviar mensajes a los sub-bots.', m, rcanal)
  }
}

handler.command = ['subme', 'submessage', 'submsg']
handler.tags = ['owner']
handler.help = ['subme <mensaje> - Enviar mensaje a todos los sub-bots']
handler.rowner = true

export default handler
