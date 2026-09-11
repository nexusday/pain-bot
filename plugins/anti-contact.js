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
    
    if (!global.db.data.antiContact) global.db.data.antiContact = {}
    
    if (accion === 'on') {
      global.db.data.antiContact[m.chat] = true
      
      let texto = `ִֶָ☾. *Anti-contactos activado correctamente*\n> Por: @${m.sender.split('@')[0]}`
      
      return conn.sendMessage(m.chat, {
        text: texto,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [m.sender]
        }
      }, { quoted: m })
      
    } else if (accion === 'off') {
      global.db.data.antiContact[m.chat] = false
      
      let texto = `ִֶָ☾. *Anti-contactos desactivado correctamente*\n> Por: @${m.sender.split('@')[0]}`
      
      return conn.sendMessage(m.chat, {
        text: texto,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [m.sender]
        }
      }, { quoted: m })
      
    } else {
      return conn.sendMessage(m.chat, {
        text: `[❗] Debes poner una acción.\n\n> *Ejemplo:* ${usedPrefix}anticontact on\n> *Ejemplo:* ${usedPrefix}anticontact off`,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }
    
  } catch (error) {
    console.error('Error en anticontact:', error)
    return conn.sendMessage(m.chat, {
      text: '[❌] Ocurrió un error al configurar el anti-contactos.',
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
}

handler.command = ['anticontact']
handler.group = true
handler.admin = true
handler.botAdmin = true

export default handler 