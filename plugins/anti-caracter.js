import { modoAnti } from '../lib/Antis/anti-modo.js'

let handler = async (m, { conn, args, usedPrefix, command }) => {
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
    
    if (accion === 'on' || accion === 'del' || accion === 'all') {
      const guardado = global.db.data.antiCaracter[m.chat]
      const limiteNuevo = !isNaN(limite) && limite >= 1 && limite <= 10000
      if (!limiteNuevo && guardado.enabled !== true) {
        return conn.sendMessage(m.chat, {
          text: `[❗] Debes poner un límite válido entre 1 y +1000 caracteres.\n> *Ejemplo:* ${usedPrefix}anticaracter del 599\n> *Ejemplo:* ${usedPrefix}anticaracter all 599`,
          contextInfo: {
            ...rcanal.contextInfo
          }
        }, { quoted: m })
      }
      
      global.db.data.antiCaracter[m.chat].enabled = true
      if (limiteNuevo) global.db.data.antiCaracter[m.chat].limit = limite
      global.db.data.antiCaracter[m.chat].mode = accion === 'all' ? 'all' : 'del'
      const limiteFinal = global.db.data.antiCaracter[m.chat].limit
      const modoTxt = accion === 'all' ? 'Elimina el mensaje y al usuario' : 'Solo elimina el mensaje'
      
      let texto = `ִֶָ☾. *Anti-caracteres activado correctamente*\n\n*Limite:* ${limiteFinal} caracteres\n> ${modoTxt}\n> Por: @${m.sender.split('@')[0]}`
      
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
      const cfgEstado = global.db.data.antiCaracter[m.chat]
      const modo = modoAnti(cfgEstado, 'all')
      const estado = modo === 'off' ? 'OFF' : modo === 'all' ? 'ALL (borra y expulsa)' : 'DEL (solo borra)'
      
      let texto = `ִֶָ☾. *Anti-caracteres estado*\n\n*Estado:* ${estado}\n*Limite:* ${cfgEstado.limit} caracteres`
      
      return conn.sendMessage(m.chat, {
        text: texto,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [m.sender]
        }
      }, { quoted: m })
      
    } else {
      return conn.sendMessage(m.chat, {
        text: `[❗] Debes poner una acción.\n\n> Ejemplo: ${usedPrefix}anticaracter del 599\n> Ejemplo: ${usedPrefix}anticaracter on 599\n> Ejemplo: ${usedPrefix}anticaracter all 599\n> Ejemplo: ${usedPrefix}anticaracter off\n> Ejemplo: ${usedPrefix}anticaracter status\n\n> *del* y *on* solo eliminan el mensaje\n> *all* elimina el mensaje y al usuario`,
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