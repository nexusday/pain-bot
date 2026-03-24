let handler = async (m, { conn, usedPrefix, command }) => {
  let user = global.db.data.users[m.sender]
  if (!user) global.db.data.users[m.sender] = {}
  
  let time = user.lastSorpresa || 0
  let cd = 120000
  if (Date.now() - time < cd) {
    let remaining = cd - (Date.now() - time)
    let minutes = Math.floor(remaining / 60000)
    let seconds = Math.floor((remaining % 60000) / 1000)
    return conn.sendMessage(m.chat, {
      text: `[❗] Espera ${minutes} minutos y ${seconds} segundos para usar otra sorpresa.`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  
  let chance = Math.random()
  if (chance < 0.25) {
  
    user.lastSorpresa = Date.now()
    let txt = `🎁 𝗘𝘀𝘁𝗮 𝗰𝗮𝗷𝗮 𝗲𝘀𝘁𝘂𝘃𝗼 𝘃𝗮𝗰𝗶𝗮\n\n> Suerte para la próxima.`
    
    return conn.sendMessage(m.chat, {
      text: txt,
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: [m.sender]
      }
    }, { quoted: m })
  }

 
  let amount = Math.floor(Math.random() * (1500 - 450 + 1)) + 450
  global.db.data.users[m.sender].coins = (user.coins || 0) + amount
  user.lastSorpresa = Date.now()

  let txt = ` 🎁 𝗦𝗼𝗿𝗽𝗿𝗲𝘀𝗮 \n\n> *Premio:* +${amount} ${global.moneda}\n> *Total:* ${global.db.data.users[m.sender].coins} ${global.moneda}\n`

  conn.sendMessage(m.chat, {
    text: txt,
    contextInfo: {
      ...rcanal.contextInfo,
      mentionedJid: [m.sender]
    }
  }, { quoted: m })

}

handler.help = ['sorpresa → Obtén una sorpresa con USD (cooldown 2 min)']
handler.tags = ['rpg', 'game']
handler.command = ['sorpresa', 'surprise']

export default handler
