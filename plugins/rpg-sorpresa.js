let handler = async (m, { conn, usedPrefix, command }) => {
  let usuario = global.db.data.users[m.sender]
  if (!usuario) global.db.data.users[m.sender] = {}
  
  let time = usuario.lastSorpresa || 0
  let cd = 120000
  if (Date.now() - time < cd) {
    let remaining = cd - (Date.now() - time)
    let minutos = Math.floor(remaining / 60000)
    let segundos = Math.floor((remaining % 60000) / 1000)
    return conn.sendMessage(m.chat, {
      text: `[❗] Espera ${minutos} minutos y ${segundos} segundos para usar otra sorpresa.`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  
  let chance = Math.random()
  if (chance < 0.25) {
  
    usuario.lastSorpresa = Date.now()
    let texto = `
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *vacía*
╰─ ✧  ✩
┊ total  ·  \`${usuario.coins || 0} ${global.moneda}\`
╰─────────`.trim()
    
    return conn.sendMessage(m.chat, {
      text: texto,
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: [m.sender]
      }
    }, { quoted: m })
  }

 
  let amount = Math.floor(Math.random() * (1500 - 450 + 1)) + 450
  global.db.data.users[m.sender].coins = (usuario.coins || 0) + amount
  usuario.lastSorpresa = Date.now()

  let texto = `
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *+${amount} ${global.moneda}*
╰─ ✧  ✩
┊ total  ·  \`${global.db.data.users[m.sender].coins} ${global.moneda}\`
╰─────────`.trim()

  conn.sendMessage(m.chat, {
    text: texto,
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
