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
    

    
    const action = args[0]?.toLowerCase()
    
    if (!global.db.data.antiImg) global.db.data.antiImg = {}
    
    if (action === 'on') {
      global.db.data.antiImg[m.chat] = true
      
      let txt = `ִֶָ☾. *Anti-imagenes activado correctamente*\n> Por: @${m.sender.split('@')[0]}`
      
      return conn.sendMessage(m.chat, {
        text: txt,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [m.sender]
        }
      }, { quoted: m })
      
    } else if (action === 'off') {
      global.db.data.antiImg[m.chat] = false
      
      let txt = `ִֶָ☾. *Anti-imagenes desactivado correctamente*\n> Por: @${m.sender.split('@')[0]}`
      
      return conn.sendMessage(m.chat, {
        text: txt,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [m.sender]
        }
      }, { quoted: m })
      
    } else {
      return conn.sendMessage(m.chat, {
        text: `[❗] Debes poner una acción.\n\n> *Ejemplo:* ${usedPrefix}antiimg on\n> *Ejemplo:* ${usedPrefix}antiimg off`,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }
    
  } catch (e) {
    console.error('Error en antiimg:', e)
    return conn.sendMessage(m.chat, {
      text: '[❌] Ocurrió un error al configurar el anti-img.',
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
}

handler.command = ['antiimg']
handler.group = true
handler.admin = true
handler.botAdmin = true

export default handler