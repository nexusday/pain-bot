let handler = async (m, { conn, usedPrefix, command, isOwner }) => {
  if (!isOwner) {
    return conn.reply(m.chat, '✤ Hola, este comando solo puede ser utilizado por el *Creador* de la Bot.', m, rcanal)
  }

  await conn.reply(m.chat, 'Iniciando reconexión manual de sub-bots...', m, rcanal)
  
  try {
    if (global.reconnectSubBots) {
      await global.reconnectSubBots()
      await conn.reply(m.chat, '[✅] Reconexión de sub-bots completada exitosamente.', m, rcanal)
    } else {
      await conn.reply(m.chat, '[❌] Función de reconexión no disponible.', m, rcanal)
    }
  } catch (error) {
    console.error('Error en reconexión manual:', error)
    await conn.reply(m.chat, '[❌] Error durante la reconexión de sub-bots.', m, rcanal)
  }
}

handler.help = ['#reconnectbots']
handler.tags = ['subbots']
handler.command = ['reconnectbots', 'reconnect']
handler.owner = true

export default handler 