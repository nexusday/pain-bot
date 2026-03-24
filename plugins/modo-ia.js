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
    
    const action = args[0]?.toLowerCase()
    
    if (!global.db.data.modoIA) global.db.data.modoIA = {}
    
    if (action === 'on') {
      
      if (global.db.data.modoHot && global.db.data.modoHot[m.chat] === true) {
        let txt = `❄ 𝗬𝗔 𝗛𝗔𝗬 𝗨𝗡 𝗠𝗢𝗗𝗢 𝗨𝗦𝗔𝗗𝗢, 𝗣𝗢𝗥 𝗙𝗔𝗩𝗢𝗥 𝗗𝗘𝗦𝗔𝗖𝗧𝗜𝗩𝗔𝗟𝗢\n\n> *Modo que ya esta activado:* 𝗠𝗼𝗱𝗼 𝗛𝗼𝘁\n\n> Para desactivarlo usa: ${usedPrefix}modohot off`
        
        return conn.sendMessage(m.chat, {
          text: txt,
          contextInfo: {
            ...rcanal.contextInfo,
            mentionedJid: [m.sender]
          }
        }, { quoted: m })
      }
      
      if (global.db.data.modoIlegal && global.db.data.modoIlegal[m.chat] === true) {
        let txt = `❄ 𝗬𝗔 𝗛𝗔𝗬 𝗨𝗡 𝗠𝗢𝗗𝗢 𝗨𝗦𝗔𝗗𝗢, 𝗣𝗢𝗥 𝗙𝗔𝗩𝗢𝗥 𝗗𝗘𝗦𝗔𝗖𝗧𝗜𝗩𝗔𝗟𝗢\n\n> *Modo que ya esta activado:* 𝗠𝗼𝗱𝗼 𝗶𝗹𝗲𝗴𝗮𝗹\n\n> Para desactivarlo usa: ${usedPrefix}modoilegal off`
        
        return conn.sendMessage(m.chat, {
          text: txt,
          contextInfo: {
            ...rcanal.contextInfo,
            mentionedJid: [m.sender]
          }
        }, { quoted: m })
      }
      
      global.db.data.modoIA[m.chat] = true
      
      let txt = `🌀 𝗠𝗼𝗱𝗼 𝗜𝗔 𝗮𝗰𝘁𝗶𝘃𝗮𝗱𝗼.\n> *Por:* @${m.sender.split('@')[0]}`
      
      return conn.sendMessage(m.chat, {
        text: txt,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [m.sender]
        }
      }, { quoted: m })
      
    } else if (action === 'off') {
      global.db.data.modoIA[m.chat] = false
      
     
      try {
        const { clearMemory } = await import('../lib/geminiAPI.js')
        clearMemory(m.chat)
      } catch (e) {
        console.error('Error limpiando memoria:', e)
      }
      
      let txt = `🌀 𝗠𝗼𝗱𝗼 𝗜𝗔 𝗱𝗲𝘀𝗮𝗰𝘁𝗶𝘃𝗮𝗱𝗼.\n> *Por:* @${m.sender.split('@')[0]}`
      
      return conn.sendMessage(m.chat, {
        text: txt,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [m.sender]
        }
      }, { quoted: m })
      
    } else if (action === 'clear' || action === 'limpiar') {
     
      try {
        const { clearMemory } = await import('../lib/geminiAPI.js')
        clearMemory(m.chat)
        
        let txt = `❄ 𝗠𝗲𝗺𝗼𝗿𝗶𝗮 𝗱𝗲 𝗠𝗼𝗱𝗼 𝗜𝗔 𝗳𝘂𝗲 𝗹𝗶𝗺𝗽𝗶𝗮𝗱𝗮.\n> *Por:* @${m.sender.split('@')[0]}`
        
        return conn.sendMessage(m.chat, {
          text: txt,
          contextInfo: {
            ...rcanal.contextInfo,
            mentionedJid: [m.sender]
          }
        }, { quoted: m })
        
      } catch (e) {
        console.error('Error limpiando memoria:', e)
        return conn.sendMessage(m.chat, {
          text: '[❌] Error al limpiar la memoria.',
          contextInfo: {
            ...rcanal.contextInfo
          }
        }, { quoted: m })
      }
      
    } else {
      let txt = `[❗] Uso incorrecto\n\n> *Ejemplos:*\n ${usedPrefix + command} on\n${usedPrefix + command} off\n${usedPrefix + command} clear`
      
      return conn.sendMessage(m.chat, {
        text: txt,
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

handler.command = ['modoia', 'aimode', 'autoai', 'iamode']
handler.group = true
handler.admin = true
handler.botAdmin = true

export default handler