let handler = async (m, { conn, usedPrefix, command, isOwner }) => {
  if (!isOwner) {
    return conn.reply(m.chat, '[❗] Este comando solo puede ser utilizado por el *Creador* del Bot.', m, rcanal)
  }

  await conn.reply(m.chat, '🌴 𝗜𝗻𝗶𝗰𝗶𝗮𝗻𝗱𝗼 𝗿𝗲𝗰𝗼𝗻𝗲𝘅𝗶𝗼́𝗻 𝗱𝗲 𝗹𝗼𝘀 𝘀𝘂𝗯 𝗯𝗼𝘁𝘀', m, rcanal)
  
  try {
    if (global.reconnectSubBots) {
      await global.reconnectSubBots()
      await conn.reply(m.chat, '✅ 𝗥𝗲𝗰𝗼𝗻𝗲𝘅𝗶𝗼́𝗻 𝗱𝗲 𝘀𝘂𝗯 𝗯𝗼𝘁𝘀 𝗰𝗼𝗺𝗽𝗹𝗲𝘁𝗮𝗱𝗮.', m, rcanal)
    } else {
      await conn.reply(m.chat, '❌ 𝗙𝘂𝗻𝗰𝗶𝗼𝗻 𝗻𝗼 𝗱𝗶𝘀𝗽𝗼𝗻𝗶𝗯𝗹𝗲..', m, rcanal)
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