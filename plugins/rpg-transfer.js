let handler = async (m, { conn, text, args, usedPrefix }) => {
  try {
    
    if (!m.mentionedJid || m.mentionedJid.length === 0) {
      return conn.sendMessage(m.chat, {
        text: `[❗] Debes mencionar a un usuario.\n\n> *Ejemplo:* ${usedPrefix}transf @usuario 100`,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }

    
    const who = m.mentionedJid[0]
    
   
    if (who === m.sender) {
      return conn.sendMessage(m.chat, {
        text: '[❌] No puedes transferir coins a ti mismo.',
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }

   
    const cantidad = parseInt(args[1])
    
    if (!cantidad || cantidad <= 0) {
      return conn.sendMessage(m.chat, {
        text: `[❗] Debes especificar una cantidad válida.\n\n> *Ejemplo:* ${usedPrefix}transf @usuario 100`,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }

   
    let remitente = global.db.data.users[m.sender]
    if (!remitente) global.db.data.users[m.sender] = {}
    
    let senderCoins = remitente.coins || 0
    
    
    if (senderCoins < cantidad) {
      return conn.sendMessage(m.chat, {
        text: `[❗] No tienes suficientes coins.\n\n> *Tienes:* ${senderCoins} coins\n> *Necesitas:* ${cantidad} coins`,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }

    
    let receiver = global.db.data.users[who]
    if (!receiver) global.db.data.users[who] = {}
    
    let receiverCoins = receiver.coins || 0

   
    global.db.data.users[m.sender].coins = senderCoins - cantidad
    global.db.data.users[who].coins = receiverCoins + cantidad

    
    const senderName = await conn.getName(m.sender)
    const receiverName = await conn.getName(who)

    
    let texto = `💸 𝗧𝗿𝗮𝗻𝘀𝗳𝗲𝗿𝗲𝗻𝗰𝗶𝗮\n\n`
    texto += `> *De:* @${m.sender.split('@')[0]}\n`
    texto += `> *Para:* @${who.split('@')[0]}\n`
    texto += `> *Cantidad:* ${cantidad} coins`

    return conn.sendMessage(m.chat, {
      text: texto,
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: [m.sender, who]
      }
    }, { quoted: m })

  } catch (error) {
    console.error('Error en transfer:', error)
    return conn.sendMessage(m.chat, {
      text: '[❌] Ocurrió un error al realizar la transferencia.',
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
}

handler.help = ['#transf @usuario <cantidad>\n→ Transfiere coins a otro usuario']
handler.tags = ['juegos', 'economía']
handler.command = ['transf', 'transfer', 'donar', 'dar']

export default handler 