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
    const limite = parseInt(args[1])
    
    if (!global.db.data.antiCaracter) global.db.data.antiCaracter = {}
    if (!global.db.data.antiCaracter[m.chat]) {
      global.db.data.antiCaracter[m.chat] = {
        enabled: false,
        limit: 500
      }
    }
    
    if (accion === 'on') {
      if (!limite || isNaN(limite) || limite < 1 || limite > 10000) {
        return conn.sendMessage(m.chat, {
          text: `[❗] Debes poner un límite válido entre 1 y +1000 caracteres.\n> *Ejemplo:* ${usedPrefix}anticaracter on 599`,
          contextInfo: {
            ...rcanal.contextInfo
          }
        }, { quoted: m })
      }
      
      global.db.data.antiCaracter[m.chat].enabled = true
      global.db.data.antiCaracter[m.chat].limit = limite
      
      let texto = `ִֶָ☾. *Anti-caracteres activado correctamente*\n\n*Limite:* ${limite} caracteres\n> Por: @${m.sender.split('@')[0]}`
      
      return conn.sendMessage(m.chat, {
        text: texto,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [m.sender]
        }
      }, { quoted: m })
      
    } else if (accion === 'off') {
      global.db.data.antiCaracter[m.chat].enabled = false
      
      let texto = `ִֶָ☾. *Anti-caracteres desactivado correctamente*\n> Por: @${m.sender.split('@')[0]}`
      
      return conn.sendMessage(m.chat, {
        text: texto,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [m.sender]
        }
      }, { quoted: m })
      
    } else if (accion === 'status' || accion === 'estado') {
      const estado = global.db.data.antiCaracter[m.chat].enabled ? 'Activado' : 'Desactivado'
      const limite = global.db.data.antiCaracter[m.chat].limit
      
      let texto = `ִֶָ☾. *Anti-caracteres estado*\n\n*Estado:* ${estado}\n*Limite:* ${limite} caracteres`
      
      return conn.sendMessage(m.chat, {
        text: texto,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [m.sender]
        }
      }, { quoted: m })
      
    } else {
      return conn.sendMessage(m.chat, {
        text: `[❗] Debes poner una acción.\n\n> Ejemplo: ${usedPrefix}anticaracter on 599\n> Ejemplo: ${usedPrefix}anticaracter off\n> Ejemplo: ${usedPrefix}anticaracter status`,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }
    
  } catch (error) {
    console.error('Error en anticaracter:', error)
    return conn.sendMessage(m.chat, {
      text: '[❌] Ocurrió un error al configurar el anti-caracteres.',
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
}

handler.command = ['anticaracter', 'anticaracteres']
handler.group = true
handler.admin = true
handler.botAdmin = true

export default handler 