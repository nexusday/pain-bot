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
    
    
    const accion = args[0]?.toLowerCase()
    
    if (!global.db.data.antiLink) global.db.data.antiLink = {}
    
    if (accion === 'on') {
      global.db.data.antiLink[m.chat] = true
      
      let texto = `ִֶָ☾. *Anti-links activado correctamente*\n> Por: @${m.sender.split('@')[0]}`
      
      return conn.sendMessage(m.chat, {
        text: texto,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [m.sender]
        }
      }, { quoted: m })
      
    } else if (accion === 'off') {
      global.db.data.antiLink[m.chat] = false
      
      let texto = `ִֶָ☾. *Anti-links desactivado correctamente*\n> Por: @${m.sender.split('@')[0]}`
      
      return conn.sendMessage(m.chat, {
        text: texto,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [m.sender]
        }
      }, { quoted: m })
      
    } else {
      return conn.sendMessage(m.chat, {
        text: `[❗] Debes poner una acción.\n\n> *Ejemplo:* ${usedPrefix}antilink on\n> *Ejemplo:* ${usedPrefix}antilink off`,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }
    
  } catch (error) {
    console.error('Error en antilink:', error)
    return conn.sendMessage(m.chat, {
      text: '[❌] Ocurrió un error al configurar el anti-link.',
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
}

handler.command = ['antilink']
handler.group = true
handler.admin = true
handler.botAdmin = true

export default handler 