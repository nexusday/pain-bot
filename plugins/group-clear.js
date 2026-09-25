function jidBot(conn) {
  return conn.decodeJid?.(conn.user?.id || conn.user?.jid || '') || conn.user?.id || ''
}

function esDelBot(mensaje, conn) {
  if (mensaje?.key?.fromMe) return true
  const bot = jidBot(conn)
  const candidatos = [
    mensaje?.key?.participant,
    mensaje?.participant,
    mensaje?.sender
  ].filter(Boolean)
  return candidatos.some((jid) => {
    const dec = conn.decodeJid?.(jid) || jid
    if (dec && bot && dec === bot) return true
    const a = String(dec).split('@')[0].split(':')[0].replace(/\D/g, '')
    const b = String(bot).split('@')[0].split(':')[0].replace(/\D/g, '')
    return a && b && a === b
  })
}

let handler = async (m, { conn }) => {
  if (!m.isGroup) return conn.sendMessage(m.chat, {
    text: '[❗] Este comando solo puede ser usado en grupos.',
    contextInfo: {
      ...rcanal.contextInfo
    }
  }, { quoted: m })

  try {
    const mensajesChat = conn.chats[m.chat]?.messages || {}
    const clavesMensajes = Object.keys(mensajesChat).filter((id) => id && id !== m.key.id)

    if (!clavesMensajes.length) {
      return conn.sendMessage(m.chat, {
        text: '[❗] No hay mensajes para eliminar.',
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }

    for (const idMensaje of clavesMensajes) {
      try {
        const mensaje = mensajesChat[idMensaje]
        if (!mensaje?.key && !mensaje) continue
        const id = mensaje?.key?.id || idMensaje
        const delBot = esDelBot(mensaje, conn)
        await conn.sendMessage(m.chat, {
          delete: {
            remoteJid: m.chat,
            fromMe: delBot,
            id,
            participant: delBot
              ? jidBot(conn)
              : (mensaje?.key?.participant || mensaje?.participant || mensaje?.sender)
          }
        })
        await new Promise(resolve => setTimeout(resolve, 180))
      } catch (errorEliminacion) {
        console.error('Error eliminando mensaje:', idMensaje, errorEliminacion)
      }
    }

    await conn.sendMessage(m.chat, {
      delete: {
        remoteJid: m.chat,
        fromMe: false,
        id: m.key.id,
        participant: m.key.participant || m.sender
      }
    }).catch(() => {})
  } catch (error) {
    console.error('Error al limpiar mensajes:', error)
  }
}

handler.command = ['clear', 'limpiar', 'clean']
handler.group = true
handler.admin = true
handler.botAdmin = true

export default handler