let handler = async (m, { conn, args, usedPrefix, command, isAdmin, isBotAdmin }) => {
  try {
    if (!m.isGroup) {
      return conn.sendMessage(m.chat, {
        text: '[❗] Este comando solo funciona en grupos.',
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }
    
    if (!isAdmin) {
      return conn.sendMessage(m.chat, {
        text: '[❗] Solo los administradores pueden usar este comando.',
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }
    
    const accion = args[0]?.toLowerCase()
    
    if (!global.db.data.soloAdmin) global.db.data.soloAdmin = {}
    
    if (accion === 'on') {
      global.db.data.soloAdmin[m.chat] = true
      
      let texto = `🔐 𝗦𝗼𝗹𝗼 𝗮𝗱𝗺𝗶𝗻𝘀 𝗮𝗰𝘁𝗶𝘃𝗮𝗱𝗼\n> *Usuario:* @${m.sender.split('@')[0]}`
      
      return conn.sendMessage(m.chat, {
        text: texto,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [m.sender]
        }
      }, { quoted: m })
      
    } else if (accion === 'off') {
      global.db.data.soloAdmin[m.chat] = false
      
      let texto = `🔓 𝗦𝗼𝗹𝗼 𝗮𝗱𝗺𝗶𝗻𝘀 𝗱𝗲𝘀𝗮𝗰𝘁𝗶𝘃𝗮𝗱𝗼\n> *Usuario:* @${m.sender.split('@')[0]}`
      
      return conn.sendMessage(m.chat, {
        text: texto,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [m.sender]
        }
      }, { quoted: m })
      
    } else {
      let texto = `[❗] Uso incorrecto\n> *Uso:* ${usedPrefix + command} on/off`
      
      return conn.sendMessage(m.chat, {
        text: texto,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }
    
  } catch (e) {
    console.error(e)
    return conn.sendMessage(m.chat, {
      text: '[❌] Ocurrió un error al procesar el comando.',
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
}

handler.command = ['soladmin', 'soloadmin', 'onlyadmin', 'adminonly']
handler.group = true
handler.admin = true
handler.botAdmin = true

export default handler