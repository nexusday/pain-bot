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
    
    if (!global.db.data.antiContact) global.db.data.antiContact = {}
    
    if (action === 'on') {
      global.db.data.antiContact[m.chat] = true
      
      let txt = `ִֶָ☾. *Anti-contactos activado correctamente*\n> Por: @${m.sender.split('@')[0]}`
      
      return conn.sendMessage(m.chat, {
        text: txt,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [m.sender]
        }
      }, { quoted: m })
      
    } else if (action === 'off') {
      global.db.data.antiContact[m.chat] = false
      
      let txt = `ִֶָ☾. *Anti-contactos desactivado correctamente*\n> Por: @${m.sender.split('@')[0]}`
      
      return conn.sendMessage(m.chat, {
        text: txt,
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
    
  } catch (e) {
    console.error('Error en anticontact:', e)
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