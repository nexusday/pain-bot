let handler = async (m, { conn, text, args }) => {
  let who = m.mentionedJid[0] 
    ? m.mentionedJid[0] 
    : args[0] 
      ? args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net' 
      : m.sender

  let user = global.db.data.users[who]
  if (!user) return conn.reply(m.chat, '[❗] Usuario no registrado en la base de datos.', m, rcanal, { mentions: [who] })

  let coins = user.coins || 0
  let name = await conn.getName(who)

  return conn.sendMessage(m.chat, {
  text: `☾. Economía de usuario

𓍯 Usuario: @${who.split('@')[0]}
𓍯 Coins actuales: ${coins}`,
      contextInfo: {
      ...rcanal.contextInfo,
      mentionedJid: [who, m.sender]
    }
  }, { quoted: m })
}

handler.help = ['balance', 'bal', 'coins']
handler.tags = ['economía']
handler.command = ['balance', 'bal', 'coins']

export default handler