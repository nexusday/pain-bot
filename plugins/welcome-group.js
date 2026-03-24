let handler = async (m, { conn, args, usedPrefix, command, isAdmin, isBotAdmin }) => {
  try {
    if (!m.isGroup) {
      return conn.sendMessage(m.chat, {
        text: '《✧》Este comando solo funciona en grupos.'
      }, { quoted: m })
    }    
    
    const action = args[0]?.toLowerCase()
    
    if (!global.db.data.bienvenidas) global.db.data.bienvenidas = {}
    
    if (global.db.data.bienvenidas[m.chat] === true) {
      global.db.data.bienvenidas[m.chat] = {
        enabled: true,
        welcomeMsg: '',
        goodbyeMsg: '',
        welcomeImg: '',
        goodbyeImg: ''
      }
    } else if (global.db.data.bienvenidas[m.chat] === false) {
      global.db.data.bienvenidas[m.chat] = {
        enabled: false,
        welcomeMsg: '',
        goodbyeMsg: '',
        welcomeImg: '',
        goodbyeImg: ''
      }
    } else if (!global.db.data.bienvenidas[m.chat] || typeof global.db.data.bienvenidas[m.chat] !== 'object') {
      global.db.data.bienvenidas[m.chat] = {
        enabled: false,
        welcomeMsg: '',
        goodbyeMsg: '',
        welcomeImg: '',
        goodbyeImg: ''
      }
    }
    
    if (action === 'on') {
      global.db.data.bienvenidas[m.chat].enabled = true
      
      let txt = `╭─「 *BIENVENIDAS ACTIVADAS* 」─╮\n`
      txt += `│\n`
      txt += `╰➺ *Estado:* Activado\n`
      txt += `╰➺ *Funciones:* Bienvenidas + Despedidas\n`
      txt += `╰➺ *Mensajes:* Por defecto (personalizables)\n`
      txt += `╰➺ *Imágenes:* Foto del grupo (personalizables)\n`
      txt += `│\n`
      txt += `╰➺ *Usuario:* @${m.sender.split('@')[0]}\n`
      txt += `\n> PAIN COMMUNITY`
      
      await conn.sendMessage(m.chat, {
        text: txt,
        contextInfo: {
          mentionedJid: [m.sender]
        }
      }, { quoted: m })
      
      const welcomePreview = global.db.data.bienvenidas[m.chat].welcomeMsg || 
        `╭─「 *BIENVENIDO* 」─╮\n` +
        `│\n` +
        `╰➺ *Usuario:* @${m.sender.split('@')[0]}\n` +
        `╰➺ *Grupo:* ${await conn.getName(m.chat) || 'Grupo'}\n` +
        `╰➺ *Miembros:* ${(await conn.groupMetadata(m.chat)).participants.length}\n` +
        `│\n` +
        `╰➺ *Fecha:* ${new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}\n` +
        `╰➺ *Hora:* ${new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}\n` +
        `│\n` +
        `╰➺ *Bienvenido al grupo!*\n` +
        `> PAIN COMMUNITY`
      
      const goodbyePreview = global.db.data.bienvenidas[m.chat].goodbyeMsg || 
        `╭─「 *ADIOS* 」─╮\n` +
        `│\n` +
        `╰➺ *Usuario:* @${m.sender.split('@')[0]}\n` +
        `╰➺ *Grupo:* ${await conn.getName(m.chat) || 'Grupo'}\n` +
        `╰➺ *Miembros:* ${(await conn.groupMetadata(m.chat)).participants.length}\n` +
        `│\n` +
        `╰➺ *Fecha:* ${new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}\n` +
        `╰➺ *Hora:* ${new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}\n` +
        `│\n` +
        `╰➺ *¡Que tengas un buen día!*\n` +
        `> PAIN COMMUNITY`
      
      await conn.sendMessage(m.chat, {
        text: `《✧》*VISTA PREVIA ACTIVADA*\n\n*Mensaje de bienvenida:*\n${welcomePreview}\n\n*Mensaje de despedida:*\n${goodbyePreview}\n\n*Nota:* Las imágenes se mostrarán automáticamente con la foto del grupo.\n\n> Para personalizar las bienvenidas y despedidas usa el comando ${usedPrefix}welcome`
      })
      
      return
      
    } else if (action === 'off') {
      global.db.data.bienvenidas[m.chat].enabled = false
      
      let txt = `╭─「 *BIENVENIDAS DESACTIVADAS* 」─╮\n`
      txt += `│\n`
      txt += `╰➺ *Estado:* Desactivado\n`
      txt += `╰➺ *Usuario:* @${m.sender.split('@')[0]}\n`
      txt += `\n> PAIN COMMUNITY`
      
      return conn.sendMessage(m.chat, {
        text: txt,
        contextInfo: {
          mentionedJid: [m.sender]
        }
      }, { quoted: m })
      
    } else if (action === 'msg') {
      const type = args[1]?.toLowerCase()
      const message = m.text.replace(new RegExp(`^${usedPrefix}welcome\\s+msg\\s+${type}\\s+`, 'i'), '')
      
      if (!type || !message) {
        return conn.sendMessage(m.chat, {
          text: `《✧》*Uso:* ${usedPrefix}welcome msg <tipo> <mensaje>\n\n*Tipos:*\n• welcome - Mensaje de bienvenida\n• goodbye - Mensaje de despedida\n\n*Variables disponibles:*\n• \${user} - Nombre del usuario\n• \${participant} - @usuario\n• \${group} - Nombre del grupo\n• \${memberCount} - Número de miembros\n• \${date} - Fecha actual\n• \${time} - Hora actual\n\n*Ejemplo:*\n${usedPrefix}welcome msg welcome ¡Hola \${user}! Bienvenido a \${group}`
        }, { quoted: m })
      }
      
      if (!global.db.data.bienvenidas[m.chat].enabled) {
        return conn.sendMessage(m.chat, {
          text: '《✧》*SISTEMA DESACTIVADO*\n\nPara personalizar mensajes, primero activa el sistema:\n\n.welcome on'
        }, { quoted: m })
      }
      
      if (type === 'welcome') {
        global.db.data.bienvenidas[m.chat].welcomeMsg = message
        
        const previewMsg = message
          .replace(/\${user}/g, await conn.getName(m.sender) || 'Usuario')
          .replace(/\${participant}/g, `@${m.sender.split('@')[0]}`)
          .replace(/\${group}/g, await conn.getName(m.chat) || 'Grupo')
          .replace(/\${memberCount}/g, (await conn.groupMetadata(m.chat)).participants.length)
          .replace(/\${date}/g, new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' }))
          .replace(/\${time}/g, new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }))
        
        await conn.sendMessage(m.chat, {
          text: `《✧》*MENSAJE DE BIENVENIDA CONFIGURADO*\n\n*Mensaje:* ${message}\n\n*Ahora se enviará así cuando alguien entre al grupo:*`
        }, { quoted: m })
        
        try {
          const pp = await conn.profilePictureUrl(m.chat, 'image')
          await conn.sendMessage(m.chat, {
            image: { url: pp },
            caption: previewMsg,
            contextInfo: {
              mentionedJid: [m.sender]
            }
          })
        } catch (ppError) {
          await conn.sendMessage(m.chat, {
            text: previewMsg,
            contextInfo: {
              mentionedJid: [m.sender]
            }
          })
        }
        
      } else if (type === 'goodbye') {
        global.db.data.bienvenidas[m.chat].goodbyeMsg = message
        
        const previewMsg = message
          .replace(/\${user}/g, await conn.getName(m.sender) || 'Usuario')
          .replace(/\${participant}/g, `@${m.sender.split('@')[0]}`)
          .replace(/\${group}/g, await conn.getName(m.chat) || 'Grupo')
          .replace(/\${memberCount}/g, (await conn.groupMetadata(m.chat)).participants.length)
          .replace(/\${date}/g, new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' }))
          .replace(/\${time}/g, new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }))
        
        await conn.sendMessage(m.chat, {
          text: `《✧》*MENSAJE DE DESPEDIDA CONFIGURADO*\n\n*Mensaje:* ${message}\n\n*Ahora se enviará así cuando alguien salga del grupo:*`
        }, { quoted: m })
        
        try {
          const pp = await conn.profilePictureUrl(m.chat, 'image')
          await conn.sendMessage(m.chat, {
            image: { url: pp },
            caption: previewMsg,
            contextInfo: {
              mentionedJid: [m.sender]
            }
          })
        } catch (ppError) {
          await conn.sendMessage(m.chat, {
            text: previewMsg,
            contextInfo: {
              mentionedJid: [m.sender]
            }
          })
        }
        
      } else {
        return conn.sendMessage(m.chat, {
          text: '《✧》Tipo inválido. Usa: welcome o goodbye'
        }, { quoted: m })
      }
      
    } else if (action === 'img') {
      const type = args[1]?.toLowerCase()
      const imageUrl = args[2]
      
      if (!type || !imageUrl) {
        return conn.sendMessage(m.chat, {
          text: `《✧》*Uso:* ${usedPrefix}welcome img <tipo> <url>\n\n*Tipos:*\n• welcome - Imagen de bienvenida\n• goodbye - Imagen de despedida\n• reset - Quitar imagen personalizada\n\n*Ejemplo:*\n${usedPrefix}welcome img welcome https://ejemplo.com/imagen.jpg`
        }, { quoted: m })
      }
      
      if (!global.db.data.bienvenidas[m.chat].enabled) {
        return conn.sendMessage(m.chat, {
          text: '《✧》*SISTEMA DESACTIVADO*\n\nPara personalizar imágenes, primero activa el sistema:\n\n.welcome on'
        }, { quoted: m })
      }
      
      if (type === 'welcome') {
        if (imageUrl === 'reset') {
          global.db.data.bienvenidas[m.chat].welcomeImg = ''
          
          return conn.sendMessage(m.chat, {
            text: '《✧》Imagen de bienvenida reseteada. Se usará la foto del grupo.'
          }, { quoted: m })
        }
        
        global.db.data.bienvenidas[m.chat].welcomeImg = imageUrl
        
        const welcomeMsg = global.db.data.bienvenidas[m.chat].welcomeMsg || 
          `╭─「 *BIENVENIDO* 」─╮\n` +
          `│\n` +
          `╰➺ *Usuario:* @${m.sender.split('@')[0]}\n` +
          `╰➺ *Grupo:* ${await conn.getName(m.chat) || 'Grupo'}\n` +
          `╰➺ *Miembros:* ${(await conn.groupMetadata(m.chat)).participants.length}\n` +
          `│\n` +
          `╰➺ *Fecha:* ${new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}\n` +
          `╰➺ *Hora:* ${new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}\n` +
          `│\n` +
          `╰➺ *Bienvenido al grupo!*\n` +
          `> PAIN COMMUNITY`
        
        const finalWelcomeMsg = welcomeMsg
          .replace(/\${user}/g, await conn.getName(m.sender) || 'Usuario')
          .replace(/\${participant}/g, `@${m.sender.split('@')[0]}`)
          .replace(/\${group}/g, await conn.getName(m.chat) || 'Grupo')
          .replace(/\${memberCount}/g, (await conn.groupMetadata(m.chat)).participants.length)
          .replace(/\${date}/g, new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' }))
          .replace(/\${time}/g, new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }))
        
        await conn.sendMessage(m.chat, {
          text: `《✧》*IMAGEN DE BIENVENIDA CONFIGURADA*\n\n*URL:* ${imageUrl}\n\n*Ahora se enviará así cuando alguien entre al grupo:*`
        }, { quoted: m })
        
        try {
          await conn.sendMessage(m.chat, {
            image: { url: imageUrl },
            caption: finalWelcomeMsg,
            contextInfo: {
              mentionedJid: [m.sender]
            }
          })
        } catch (imgError) {
          return conn.sendMessage(m.chat, {
            text: `《✧》*ERROR AL CARGAR IMAGEN*\n\n*URL:* ${imageUrl}\n\n*Error:* La imagen no se puede cargar. Verifica que la URL sea válida.`
          }, { quoted: m })
        }
        
      } else if (type === 'goodbye') {
        if (imageUrl === 'reset') {
          global.db.data.bienvenidas[m.chat].goodbyeImg = ''
          
          return conn.sendMessage(m.chat, {
            text: '《✧》Imagen de despedida reseteada. Se usará la foto del grupo.'
          }, { quoted: m })
        }
        global.db.data.bienvenidas[m.chat].goodbyeImg = imageUrl
        
        const goodbyeMsg = global.db.data.bienvenidas[m.chat].goodbyeMsg || 
          `╭─「 *ADIOS* 」─╮\n` +
          `│\n` +
          `╰➺ *Usuario:* @${m.sender.split('@')[0]}\n` +
          `╰➺ *Grupo:* ${await conn.getName(m.chat) || 'Grupo'}\n` +
          `╰➺ *Miembros:* ${(await conn.groupMetadata(m.chat)).participants.length}\n` +
          `│\n` +
          `╰➺ *Fecha:* ${new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}\n` +
          `╰➺ *Hora:* ${new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}\n` +
          `│\n` +
          `╰➺ *¡Que tengas un buen día!*\n` +
          `> PAIN COMMUNITY`
        
        const finalGoodbyeMsg = goodbyeMsg
          .replace(/\${user}/g, await conn.getName(m.sender) || 'Usuario')
          .replace(/\${participant}/g, `@${m.sender.split('@')[0]}`)
          .replace(/\${group}/g, await conn.getName(m.chat) || 'Grupo')
          .replace(/\${memberCount}/g, (await conn.groupMetadata(m.chat)).participants.length)
          .replace(/\${date}/g, new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' }))
          .replace(/\${time}/g, new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }))
        
        await conn.sendMessage(m.chat, {
          text: `《✧》*IMAGEN DE DESPEDIDA CONFIGURADA*\n\n*URL:* ${imageUrl}\n\n*Ahora se enviará así cuando alguien salga del grupo:*`
        }, { quoted: m })
        
        try {
          await conn.sendMessage(m.chat, {
            image: { url: imageUrl },
            caption: finalGoodbyeMsg,
            contextInfo: {
              mentionedJid: [m.sender]
            }
          })
        } catch (imgError) {
          return conn.sendMessage(m.chat, {
            text: `《✧》*ERROR AL CARGAR IMAGEN*\n\n*URL:* ${imageUrl}\n\n*Error:* La imagen no se puede cargar. Verifica que la URL sea válida.`
          }, { quoted: m })
        }
        
      } else {
        return conn.sendMessage(m.chat, {
          text: '《✧》Tipo inválido. Usa: welcome o goodbye'
        }, { quoted: m })
      }
      
    } else if (action === 'status' || action === 'estado') {
      const config = global.db.data.bienvenidas[m.chat]
      const isEnabled = config.enabled === true
      const status = isEnabled ? 'ACTIVADO' : 'DESACTIVADO'
      
      let txt = `╭─「 *ESTADO DE BIENVENIDAS* 」─╮\n`
      txt += `│\n`
      txt += `╰➺ *Estado:* ${status}\n`
      txt += `╰➺ *Grupo:* ${m.chat}\n`
      txt += `│\n`
      txt += `╰➺ *Mensaje Bienvenida:* ${config.welcomeMsg || 'Por defecto'}\n`
      txt += `╰➺ *Mensaje Despedida:* ${config.goodbyeMsg || 'Por defecto'}\n`
      txt += `╰➺ *Imagen Bienvenida:* ${config.welcomeImg || 'Foto del grupo'}\n`
      txt += `╰➺ *Imagen Despedida:* ${config.goodbyeImg || 'Foto del grupo'}\n`
      txt += `│\n`
      txt += `╰➺ *Usuario:* @${m.sender.split('@')[0]}\n`
      txt += `\n> PAIN COMMUNITY`
      
      return conn.sendMessage(m.chat, {
        text: txt,
        contextInfo: {
          mentionedJid: [m.sender]
        }
      }, { quoted: m })
      
    } else if (action === 'reset') {
      global.db.data.bienvenidas[m.chat] = {
        enabled: false,
        welcomeMsg: '',
        goodbyeMsg: '',
        welcomeImg: '',
        goodbyeImg: ''
      }
      
      return conn.sendMessage(m.chat, {
        text: '《✧》*CONFIGURACIÓN RESETEADA*\n\n*Mensajes:* Por defecto\n*Imágenes:* Foto del grupo\n*Estado:* Desactivado'
      }, { quoted: m })
      
    } else if (action === 'debug' || action === 'test') {
      const config = global.db.data.bienvenidas[m.chat]
      let debugInfo = `《✧》*DEBUG - CONFIGURACIÓN ACTUAL*\n\n`
      debugInfo += `*Grupo:* ${m.chat}\n`
      debugInfo += `*Tipo de configuración:* ${typeof config}\n`
      debugInfo += `*Configuración completa:* ${JSON.stringify(config, null, 2)}\n\n`
      
      if (config && typeof config === 'object') {
        debugInfo += `*Estado:* ${config.enabled ? 'ACTIVADO' : 'DESACTIVADO'}\n`
        debugInfo += `*Mensaje bienvenida:* ${config.welcomeMsg || 'Por defecto'}\n`
        debugInfo += `*Mensaje despedida:* ${config.goodbyeMsg || 'Por defecto'}\n`
        debugInfo += `*Imagen bienvenida:* ${config.welcomeImg || 'Foto del grupo'}\n`
        debugInfo += `*Imagen despedida:* ${config.goodbyeImg || 'Foto del grupo'}\n`
      } else {
        debugInfo += `*Error:* Configuración no válida\n`
      }
      
      return conn.sendMessage(m.chat, {
        text: debugInfo
      }, { quoted: m })
      
    } else if (action === 'testimg') {
      const config = global.db.data.bienvenidas[m.chat]
      
      if (!config || !config.enabled) {
        return conn.sendMessage(m.chat, {
          text: '《✧》El sistema no está activado. Usa .welcome on primero.'
        }, { quoted: m })
      }
      
      if (!config.welcomeImg || config.welcomeImg === '') {
        return conn.sendMessage(m.chat, {
          text: '《✧》No hay imagen personalizada configurada. Usa .welcome img welcome <url> primero.'
        }, { quoted: m })
      }
      
      const testMsg = config.welcomeMsg || 
        `╭─「 *BIENVENIDO* 」─╮\n` +
        `│\n` +
        `╰➺ *Usuario:* @${m.sender.split('@')[0]}\n` +
        `╰➺ *Grupo:* ${await conn.getName(m.chat) || 'Grupo'}\n` +
        `╰➺ *Miembros:* ${(await conn.groupMetadata(m.chat)).participants.length}\n` +
        `│\n` +
        `╰➺ *Fecha:* ${new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}\n` +
        `╰➺ *Hora:* ${new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}\n` +
        `│\n` +
        `╰➺ *Bienvenido al grupo!*\n` +
        `> PAIN COMMUNITY`
      
      const finalTestMsg = testMsg
        .replace(/\${user}/g, await conn.getName(m.sender) || 'Usuario')
        .replace(/\${participant}/g, `@${m.sender.split('@')[0]}`)
        .replace(/\${group}/g, await conn.getName(m.chat) || 'Grupo')
        .replace(/\${memberCount}/g, (await conn.groupMetadata(m.chat)).participants.length)
        .replace(/\${date}/g, new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' }))
        .replace(/\${time}/g, new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }))
      
      try {
        await conn.sendMessage(m.chat, {
          text: `《✧》*PRUEBA DE IMAGEN PERSONALIZADA*\n\n*URL:* ${config.welcomeImg}\n\n*Enviando mensaje de prueba:*`
        }, { quoted: m })
        
        await conn.sendMessage(m.chat, {
          image: { url: config.welcomeImg },
          caption: finalTestMsg,
          contextInfo: {
            mentionedJid: [m.sender]
          }
        })
        
        await conn.sendMessage(m.chat, {
          text: '《✧》*PRUEBA COMPLETADA*\n\nSi ves la imagen personalizada arriba, el sistema funciona correctamente.'
        })
        
      } catch (error) {
        return conn.sendMessage(m.chat, {
          text: `《✧》*ERROR EN PRUEBA*\n\n*Error:* ${error.message}\n\n*URL:* ${config.welcomeImg}`
        }, { quoted: m })
      }
      
    } else {
      return conn.sendMessage(m.chat, {
        text: `《✧》*SISTEMA DE BIENVENIDAS - PAIN BOT*\n\n*COMANDOS PRINCIPALES:*\n• ${usedPrefix}welcome on - Activar sistema\n• ${usedPrefix}welcome off - Desactivar sistema\n• ${usedPrefix}welcome status - Ver estado\n• ${usedPrefix}welcome reset - Resetear configuración\n• ${usedPrefix}welcome debug - Debug configuración\n• ${usedPrefix}welcome testimg - Probar imagen personalizada\n\n*PERSONALIZACIÓN (Solo cuando está ACTIVADO):*\n• ${usedPrefix}welcome msg welcome <mensaje> - Mensaje bienvenida\n• ${usedPrefix}welcome msg goodbye <mensaje> - Mensaje despedida\n• ${usedPrefix}welcome img welcome <url> - Imagen bienvenida\n• ${usedPrefix}welcome img goodbye <url> - Imagen despedida\n\n*VARIABLES DISPONIBLES:*\n• \${user} - Nombre del usuario (ej: Juan)\n• \${participant} - Usuario con @ (ej: @123456789)\n• \${group} - Nombre del grupo (ej: Grupo de amigos)\n• \${memberCount} - Número de miembros (ej: 25)\n• \${date} - Fecha actual (ej: 29 de agosto de 2025)\n• \${time} - Hora actual (ej: 18:50)\n\n*EJEMPLOS DE USO:*\n• ${usedPrefix}welcome msg welcome Hola \${user}, bienvenido a \${group}!\n• ${usedPrefix}welcome msg goodbye Adios \${user}, gracias por estar en \${group}\n\n*FUNCIONA AUTOMÁTICAMENTE:*\n• Cuando alguien entra al grupo\n• Cuando alguien sale del grupo\n\n*NOTA:* Para personalizar mensajes e imágenes, primero activa el sistema con .welcome on`
      }, { quoted: m })
    }
    
  } catch (e) {
    console.error('Error en bienvenidas:', e)
    return conn.sendMessage(m.chat, {
      text: '《✧》Ocurrió un error al configurar las bienvenidas.'
    }, { quoted: m })
  }
}

handler.help = ['bienvenidas']
handler.tags = ['grupo']
handler.command = ['welcome', 'bienvenidas', 'bienvenida']
handler.group = true
handler.admin = true
handler.botAdmin = true

export default handler
