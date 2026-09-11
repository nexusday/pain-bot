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
    
    if (!global.db.data.antiDocument) global.db.data.antiDocument = {}
    
    if (accion === 'on') {
      global.db.data.antiDocument[m.chat] = true
      
      let texto = `ִֶָ☾. *Anti-documentos activado correctamente*\n> Por: @${m.sender.split('@')[0]}`
      
      return conn.sendMessage(m.chat, {
        text: texto,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [m.sender]
        }
      }, { quoted: m })
      
    } else if (accion === 'off') {
      global.db.data.antiDocument[m.chat] = false
      
      let texto = `ִֶָ☾. *Anti-documentos desactivado correctamente*\n> Por: @${m.sender.split('@')[0]}`
      
      return conn.sendMessage(m.chat, {
        text: texto,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [m.sender]
        }
      }, { quoted: m })
      
    } else {
      return conn.sendMessage(m.chat, {
        text: `[❗] Debes poner una acción.\n\n> *Ejemplo:* ${usedPrefix}antidocument on\n> *Ejemplo:* ${usedPrefix}antidocument off`,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }
    
  } catch (error) {
    console.error('Error en antidocument:', error)
    return conn.sendMessage(m.chat, {
      text: '[❌] Ocurrió un error al configurar el anti-documentos.',
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
}

handler.command = ['antidocument', 'antidoc', 'antidocuments']
handler.group = true
handler.admin = true
handler.botAdmin = true

export default handler