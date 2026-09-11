import { ensureModeMap, isModeActive, setModeState } from '../lib/Modos/modo-utils.js'

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
    
    ensureModeMap('modoHot')
    
    if (accion === 'on') {
      
      if (isModeActive('modoIA', m.chat)) {
        let texto = `❄ 𝗬𝗔 𝗛𝗔𝗬 𝗨𝗡 𝗠𝗢𝗗𝗢 𝗨𝗦𝗔𝗗𝗢, 𝗣𝗢𝗥 𝗙𝗔𝗩𝗢𝗥 𝗗𝗘𝗦𝗔𝗖𝗧𝗜𝗩𝗔𝗟𝗢\n\n> *Modo que ya esta activado:* 𝗠𝗼𝗱𝗼 𝗜𝗔\n\n> Para desactivarlo usa: ${usedPrefix}modoia off`
        
        return conn.sendMessage(m.chat, {
          text: texto,
          contextInfo: {
            ...rcanal.contextInfo,
            mentionedJid: [m.sender]
          }
        }, { quoted: m })
      }
      
      if (isModeActive('modoIlegal', m.chat)) {
        let texto = `❄ 𝗬𝗔 𝗛𝗔𝗬 𝗨𝗡 𝗠𝗢𝗗𝗢 𝗨𝗦𝗔𝗗𝗢, 𝗣𝗢𝗥 𝗙𝗔𝗩𝗢𝗥 𝗗𝗘𝗦𝗔𝗖𝗧𝗜𝗩𝗔𝗟𝗢\n\n> *Modo que ya esta activado:* 𝗠𝗼𝗱𝗼 𝗶𝗹𝗲𝗴𝗮𝗹\n\n> Para desactivarlo usa: ${usedPrefix}modoilegal off`
        
        return conn.sendMessage(m.chat, {
          text: texto,
          contextInfo: {
            ...rcanal.contextInfo,
            mentionedJid: [m.sender]
          }
        }, { quoted: m })
      }

      if (isModeActive('modoHuman', m.chat)) {
        let texto = `❄ 𝗬𝗔 𝗛𝗔𝗬 𝗨𝗡 𝗠𝗢𝗗𝗢 𝗨𝗦𝗔𝗗𝗢, 𝗣𝗢𝗥 𝗙𝗔𝗩𝗢𝗥 𝗗𝗘𝗦𝗔𝗖𝗧𝗜𝗩𝗔𝗟𝗢\n\n> *Modo que ya esta activado:* 𝗠𝗼𝗱𝗼 𝗛𝘂𝗺𝗮𝗻𝗼\n\n> Para desactivarlo usa: ${usedPrefix}modohuman off`
        
        return conn.sendMessage(m.chat, {
          text: texto,
          contextInfo: {
            ...rcanal.contextInfo,
            mentionedJid: [m.sender]
          }
        }, { quoted: m })
      }

      if (isModeActive('modoSad', m.chat)) {
        let texto = `❄ 𝗬𝗔 𝗛𝗔𝗬 𝗨𝗡 𝗠𝗢𝗗𝗢 𝗨𝗦𝗔𝗗𝗢, 𝗣𝗢𝗥 𝗙𝗔𝗩𝗢𝗥 𝗗𝗘𝗦𝗔𝗖𝗧𝗜𝗩𝗔𝗟𝗢\n\n> *Modo que ya esta activado:* 𝗠𝗼𝗱𝗼 𝗦𝗮𝗱\n\n> Para desactivarlo usa: ${usedPrefix}modosad off`
        
        return conn.sendMessage(m.chat, {
          text: texto,
          contextInfo: {
            ...rcanal.contextInfo,
            mentionedJid: [m.sender]
          }
        }, { quoted: m })
      }

      if (isModeActive('modoPsico', m.chat)) {
        let texto = `❄ 𝗬𝗔 𝗛𝗔𝗬 𝗨𝗡 𝗠𝗢𝗗𝗢 𝗨𝗦𝗔𝗗𝗢, 𝗣𝗢𝗥 𝗙𝗔𝗩𝗢𝗥 𝗗𝗘𝗦𝗔𝗖𝗧𝗜𝗩𝗔𝗟𝗢\n\n> *Modo que ya esta activado:* 𝗠𝗼𝗱𝗼 𝗣𝘀𝗶𝗰𝗼\n\n> Para desactivarlo usa: ${usedPrefix}modospico off`
        
        return conn.sendMessage(m.chat, {
          text: texto,
          contextInfo: {
            ...rcanal.contextInfo,
            mentionedJid: [m.sender]
          }
        }, { quoted: m })
      }
      
      setModeState('modoHot', m.chat, true)
      
      let texto = `🌸 𝗠𝗼𝗱𝗼 𝗛𝗼𝘁 𝗮𝗰𝘁𝗶𝘃𝗮𝗱𝗼.\n> *Por:* @${m.sender.split('@')[0]}`
      
      return conn.sendMessage(m.chat, {
        text: texto,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [m.sender]
        }
      }, { quoted: m })
      
    } else if (accion === 'off') {
      setModeState('modoHot', m.chat, false)
      
 
      try {
        const { clearMemory } = await import('../lib/geminiAPI.js')
        clearMemory(m.chat)
      } catch (error) {
        console.error('Error limpiando memoria:', error)
      }
      
      let texto = `🌸 𝗠𝗼𝗱𝗼 𝗛𝗼𝘁 𝗱𝗲𝘀𝗮𝗰𝘁𝗶𝘃𝗮𝗱𝗼.\n> *Por:* @${m.sender.split('@')[0]}`
      
      return conn.sendMessage(m.chat, {
        text: texto,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [m.sender]
        }
      }, { quoted: m })
      
    } else if (accion === 'clear' || accion === 'limpiar') {
      
      try {
        const { clearMemory } = await import('../lib/geminiAPI.js')
        clearMemory(m.chat)
        
        let texto = `❄ 𝗠𝗲𝗺𝗼𝗿𝗶𝗮 𝗱𝗲 𝗠𝗼𝗱𝗼 𝗛𝗼𝘁 𝗳𝘂𝗲 𝗹𝗶𝗺𝗽𝗶𝗮𝗱𝗮.\n> *Por:* @${m.sender.split('@')[0]}`
        
        return conn.sendMessage(m.chat, {
          text: texto,
          contextInfo: {
            ...rcanal.contextInfo,
            mentionedJid: [m.sender]
          }
        }, { quoted: m })
        
      } catch (error) {
        console.error('Error limpiando memoria:', error)
        return conn.sendMessage(m.chat, {
          text: '[❌] Error al limpiar la memoria.',
          contextInfo: {
            ...rcanal.contextInfo
          }
        }, { quoted: m })
      }
      
    } else {
      let texto = `[❗] Uso incorrecto\n\n> *Ejemplos:*\n ${usedPrefix + command} on\n${usedPrefix + command} off\n${usedPrefix + command} clear`
      
      return conn.sendMessage(m.chat, {
        text: texto,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }
    
  } catch (error) {
    console.error(error)
    return conn.sendMessage(m.chat, {
      text: '[❌] Ocurrió un error al procesar el comando.',
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
}

handler.command = ['modohot', 'hotmode', 'modoSexy', 'hotai']
handler.group = true
handler.admin = true
handler.botAdmin = true

export default handler