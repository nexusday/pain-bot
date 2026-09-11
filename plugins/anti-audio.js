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
    
    if (!global.db.data.antiAudio) global.db.data.antiAudio = {}
    
    if (accion === 'on') {
      global.db.data.antiAudio[m.chat] = true
      
      let texto = `ִֶָ☾. *Anti-audio* activado correctamente*\n> Por: @${m.sender.split('@')[0]}`
      
      return conn.sendMessage(m.chat, {
        text: texto,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [m.sender]
        }
      }, { quoted: m })
      
    } else if (accion === 'off') {
      global.db.data.antiAudio[m.chat] = false
      
      let texto = `ִֶָ☾. *Anti-audio desactivado correctamente*\n> Por: @${m.sender.split('@')[0]}`
      
      return conn.sendMessage(m.chat, {
        text: texto,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [m.sender]
        }
      }, { quoted: m })
      
    } else {
      return conn.sendMessage(m.chat, {
        text: `[❗] Uso incorrecto.\n\n> *Ejemplo:* ${usedPrefix}antiaudio on`,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }
    
  } catch (error) {
    console.error('Error en antiaudio:', error)
    return conn.sendMessage(m.chat, {
      text: '[❌]Ocurrió un error al configurar el anti-audio.',
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
}

handler.command = ['antiaudio']
handler.group = true
handler.admin = true
handler.botAdmin = true

export default handler 