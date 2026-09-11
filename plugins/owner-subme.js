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

    
    if (!global.conns || !Array.isArray(global.conns) || global.conns.length === 0) {
      return m.reply('*[❗] No hay sub-bots conectados en este momento.*')
    }

    
    const subBotsConectados = global.conns.filter(connSub => 
      connSub.user && 
      connSub.user.jid && 
      connSub.ws?.socket?.readyState === 1 
    )

    if (subBotsConectados.length === 0) {
      return m.reply('*[❗] No hay sub-bots conectados en este momento.*')
    }

    
    const mensajeASubBots = `╭─「 ✦ 𓆩📢𓆪 ᴍᴇɴsᴀᴊᴇ ᴅᴇʟ ᴏᴡɴᴇʀ ✦ 」─╮

╰➺ ✧ *Owner:* @${m.sender.split('@')[0]}
╰➺ ✧ *Mensaje:* ${text}



> PAIN COMMUNITY`

    
    let conteoEnviados = 0
    let conteoFallidos = 0

    
    for (const connSub of subBotsConectados) {
      try {
        await conn.sendMessage(connSub.user.jid, {
          text: mensajeASubBots,
          contextInfo: {
            ...rcanal.contextInfo,
            mentionedJid: [m.sender]
          }
        })
        conteoEnviados++
        console.log(`✅ Mensaje enviado a sub-bot: ${connSub.user.jid}`)
      } catch (error) {
        conteoFallidos++
        console.error(`❌ Error enviando mensaje a sub-bot ${connSub.user.jid}:`, error.message)
      }
    }

    
    const mensajeConfirmacion = `╭─「 ✦ 𓆩📢𓆪 ᴍᴇɴsᴀᴊᴇs ᴇɴᴠɪᴀᴅᴏs ✦ 」─╮

╰➺ ✧ *Owner:* @${m.sender.split('@')[0]}
╰➺ ✧ *Sub-bots conectados:* ${subBotsConectados.length}
╰➺ ✧ *Enviados exitosamente:* ${conteoEnviados}
╰➺ ✧ *Fallidos:* ${conteoFallidos}

╰➺ ✧ *Mensaje enviado:*
╰➺ ✧ ${text}



> PAIN COMMUNITY`

    await conn.sendMessage(m.chat, {
      text: mensajeConfirmacion,
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: [m.sender]
      }
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