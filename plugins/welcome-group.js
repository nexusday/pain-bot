let handler = async (m, { conn, args, usedPrefix, command, isAdmin, isBotAdmin }) => {
  try {
    if (!m.isGroup) {
      return conn.sendMessage(m.chat, {
        text: '《✧》Este comando solo funciona en grupos.'
      }, { quoted: m })
    }    
    
    const accion = args[0]?.toLowerCase()
    
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
    
    if (accion === 'on') {
      global.db.data.bienvenidas[m.chat].enabled = true
      
      let texto = `╭─「 *BIENVENIDAS ACTIVADAS* 」─╮\n`
      texto += `│\n`
      texto += `╰➺ *Estado:* Activado\n`
      texto += `╰➺ *Funciones:* Bienvenidas + Despedidas\n`
      texto += `╰➺ *Mensajes:* Por defecto (personalizables)\n`
      texto += `╰➺ *Imágenes:* Foto del grupo (personalizables)\n`
      texto += `│\n`
      texto += `╰➺ *Usuario:* @${m.sender.split('@')[0]}\n`
      texto += `\n> PAIN COMMUNITY`
      
      await conn.sendMessage(m.chat, {
        text: texto,
        contextInfo: {
          mentionedJid: [m.sender]
        }
      }, { quoted: m })
      
      const vistaPreviaBienvenida = global.db.data.bienvenidas[m.chat].welcomeMsg || 
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
      
      const vistaPreviaDespedida = global.db.data.bienvenidas[m.chat].goodbyeMsg || 
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
        text: `《✧》*VISTA PREVIA ACTIVADA*\n\n*Mensaje de bienvenida:*\n${vistaPreviaBienvenida}\n\n*Mensaje de despedida:*\n${vistaPreviaDespedida}\n\n*Nota:* Las imágenes se mostrarán automáticamente con la foto del grupo.\n\n> Para personalizar las bienvenidas y despedidas usa el comando ${usedPrefix}welcome`
      })
      
      return
      
    } else if (accion === 'off') {
      global.db.data.bienvenidas[m.chat].enabled = false
      
      let texto = `╭─「 *BIENVENIDAS DESACTIVADAS* 」─╮\n`
      texto += `│\n`
      texto += `╰➺ *Estado:* Desactivado\n`
      texto += `╰➺ *Usuario:* @${m.sender.split('@')[0]}\n`
      texto += `\n> PAIN COMMUNITY`
      
      return conn.sendMessage(m.chat, {
        text: texto,
        contextInfo: {
          mentionedJid: [m.sender]
        }
      }, { quoted: m })
      
    } else if (accion === 'msg') {
      const tipo = args[1]?.toLowerCase()
      const mensaje = m.text.replace(new RegExp(`^${usedPrefix}welcome\\s+msg\\s+${tipo}\\s+`, 'i'), '')
      
      if (!tipo || !mensaje) {
        return conn.sendMessage(m.chat, {
          text: `《✧》*Uso:* ${usedPrefix}welcome msg <tipo> <mensaje>\n\n*Tipos:*\n• welcome - Mensaje de bienvenida\n• goodbye - Mensaje de despedida\n\n*Variables disponibles:*\n• \${user} - Nombre del usuario\n• \${participant} - @usuario\n• \${group} - Nombre del grupo\n• \${memberCount} - Número de miembros\n• \${date} - Fecha actual\n• \${time} - Hora actual\n\n*Ejemplo:*\n${usedPrefix}welcome msg welcome ¡Hola \${user}! Bienvenido a \${group}`
        }, { quoted: m })
      }
      
      if (!global.db.data.bienvenidas[m.chat].enabled) {
        return conn.sendMessage(m.chat, {
          text: '《✧》*SISTEMA DESACTIVADO*\n\nPara personalizar mensajes, primero activa el sistema:\n\n.welcome on'
        }, { quoted: m })
      }
      
      if (tipo === 'welcome') {
        global.db.data.bienvenidas[m.chat].welcomeMsg = mensaje
        
        const mensajeVistaPrevia = mensaje
          .replace(/\${user}/g, await conn.getName(m.sender) || 'Usuario')
          .replace(/\${participant}/g, `@${m.sender.split('@')[0]}`)
          .replace(/\${group}/g, await conn.getName(m.chat) || 'Grupo')
          .replace(/\${memberCount}/g, (await conn.groupMetadata(m.chat)).participants.length)
          .replace(/\${date}/g, new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' }))
          .replace(/\${time}/g, new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }))
        
        await conn.sendMessage(m.chat, {
          text: `《✧》*MENSAJE DE BIENVENIDA CONFIGURADO*\n\n*Mensaje:* ${mensaje}\n\n*Ahora se enviará así cuando alguien entre al grupo:*`
        }, { quoted: m })
        
        try {
          const fotoPerfil = await conn.profilePictureUrl(m.chat, 'image')
          await conn.sendMessage(m.chat, {
            image: { url: fotoPerfil },
            caption: mensajeVistaPrevia,
            contextInfo: {
              mentionedJid: [m.sender]
            }
          })
        } catch (ppError) {
          await conn.sendMessage(m.chat, {
            text: mensajeVistaPrevia,
            contextInfo: {
              mentionedJid: [m.sender]
            }
          })
        }
        
      } else if (tipo === 'goodbye') {
        global.db.data.bienvenidas[m.chat].goodbyeMsg = mensaje
        
        const mensajeVistaPrevia = mensaje
          .replace(/\${user}/g, await conn.getName(m.sender) || 'Usuario')
          .replace(/\${participant}/g, `@${m.sender.split('@')[0]}`)
          .replace(/\${group}/g, await conn.getName(m.chat) || 'Grupo')
          .replace(/\${memberCount}/g, (await conn.groupMetadata(m.chat)).participants.length)
          .replace(/\${date}/g, new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' }))
          .replace(/\${time}/g, new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }))
        
        await conn.sendMessage(m.chat, {
          text: `《✧》*MENSAJE DE DESPEDIDA CONFIGURADO*\n\n*Mensaje:* ${mensaje}\n\n*Ahora se enviará así cuando alguien salga del grupo:*`
        }, { quoted: m })
        
        try {
          const fotoPerfil = await conn.profilePictureUrl(m.chat, 'image')
          await conn.sendMessage(m.chat, {
            image: { url: fotoPerfil },
            caption: mensajeVistaPrevia,
            contextInfo: {
              mentionedJid: [m.sender]
            }
          })
        } catch (ppError) {
          await conn.sendMessage(m.chat, {
            text: mensajeVistaPrevia,
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
      
    } else if (accion === 'img') {
      const tipo = args[1]?.toLowerCase()
      const urlImagen = args[2]
      
      if (!tipo || !urlImagen) {
        return conn.sendMessage(m.chat, {
          text: `《✧》*Uso:* ${usedPrefix}welcome img <tipo> <url>\n\n*Tipos:*\n• welcome - Imagen de bienvenida\n• goodbye - Imagen de despedida\n• reset - Quitar imagen personalizada\n\n*Ejemplo:*\n${usedPrefix}welcome img welcome https://ejemplo.com/imagen.jpg`
        }, { quoted: m })
      }
      
      if (!global.db.data.bienvenidas[m.chat].enabled) {
        return conn.sendMessage(m.chat, {
          text: '《✧》*SISTEMA DESACTIVADO*\n\nPara personalizar imágenes, primero activa el sistema:\n\n.welcome on'
        }, { quoted: m })
      }
      
      if (tipo === 'welcome') {
        if (urlImagen === 'reset') {
          global.db.data.bienvenidas[m.chat].welcomeImg = ''
          
          return conn.sendMessage(m.chat, {
            text: '《✧》Imagen de bienvenida reseteada. Se usará la foto del grupo.'
          }, { quoted: m })
        }
        
        global.db.data.bienvenidas[m.chat].welcomeImg = urlImagen
        
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
        
        const mensajeBienvenidaFinal = welcomeMsg
          .replace(/\${user}/g, await conn.getName(m.sender) || 'Usuario')
          .replace(/\${participant}/g, `@${m.sender.split('@')[0]}`)
          .replace(/\${group}/g, await conn.getName(m.chat) || 'Grupo')
          .replace(/\${memberCount}/g, (await conn.groupMetadata(m.chat)).participants.length)
          .replace(/\${date}/g, new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' }))
          .replace(/\${time}/g, new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }))
        
        await conn.sendMessage(m.chat, {
          text: `《✧》*IMAGEN DE BIENVENIDA CONFIGURADA*\n\n*URL:* ${urlImagen}\n\n*Ahora se enviará así cuando alguien entre al grupo:*`
        }, { quoted: m })
        
        try {
          await conn.sendMessage(m.chat, {
            image: { url: urlImagen },
            caption: mensajeBienvenidaFinal,
            contextInfo: {
              mentionedJid: [m.sender]
            }
          })
        } catch (imgError) {
          return conn.sendMessage(m.chat, {
            text: `《✧》*ERROR AL CARGAR IMAGEN*\n\n*URL:* ${urlImagen}\n\n*Error:* La imagen no se puede cargar. Verifica que la URL sea válida.`
          }, { quoted: m })
        }
        
      } else if (tipo === 'goodbye') {
        if (urlImagen === 'reset') {
          global.db.data.bienvenidas[m.chat].goodbyeImg = ''
          
          return conn.sendMessage(m.chat, {
            text: '《✧》Imagen de despedida reseteada. Se usará la foto del grupo.'
          }, { quoted: m })
        }
        global.db.data.bienvenidas[m.chat].goodbyeImg = urlImagen
        
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
        
        const mensajeDespedidaFinal = goodbyeMsg
          .replace(/\${user}/g, await conn.getName(m.sender) || 'Usuario')
          .replace(/\${participant}/g, `@${m.sender.split('@')[0]}`)
          .replace(/\${group}/g, await conn.getName(m.chat) || 'Grupo')
          .replace(/\${memberCount}/g, (await conn.groupMetadata(m.chat)).participants.length)
          .replace(/\${date}/g, new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' }))
          .replace(/\${time}/g, new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }))
        
        await conn.sendMessage(m.chat, {
          text: `《✧》*IMAGEN DE DESPEDIDA CONFIGURADA*\n\n*URL:* ${urlImagen}\n\n*Ahora se enviará así cuando alguien salga del grupo:*`
        }, { quoted: m })
        
        try {
          await conn.sendMessage(m.chat, {
            image: { url: urlImagen },
            caption: mensajeDespedidaFinal,
            contextInfo: {
              mentionedJid: [m.sender]
            }
          })
        } catch (imgError) {
          return conn.sendMessage(m.chat, {
            text: `《✧》*ERROR AL CARGAR IMAGEN*\n\n*URL:* ${urlImagen}\n\n*Error:* La imagen no se puede cargar. Verifica que la URL sea válida.`
          }, { quoted: m })
        }
        
      } else {
        return conn.sendMessage(m.chat, {
          text: '《✧》Tipo inválido. Usa: welcome o goodbye'
        }, { quoted: m })
      }
      
    } else if (accion === 'status' || accion === 'estado') {
      const configuracion = global.db.data.bienvenidas[m.chat]
      const estaActivo = configuracion.enabled === true
      const estado = estaActivo ? 'ACTIVADO' : 'DESACTIVADO'
      
      let texto = `╭─「 *ESTADO DE BIENVENIDAS* 」─╮\n`
      texto += `│\n`
      texto += `╰➺ *Estado:* ${estado}\n`
      texto += `╰➺ *Grupo:* ${m.chat}\n`
      texto += `│\n`
      texto += `╰➺ *Mensaje Bienvenida:* ${configuracion.welcomeMsg || 'Por defecto'}\n`
      texto += `╰➺ *Mensaje Despedida:* ${configuracion.goodbyeMsg || 'Por defecto'}\n`
      texto += `╰➺ *Imagen Bienvenida:* ${configuracion.welcomeImg || 'Foto del grupo'}\n`
      texto += `╰➺ *Imagen Despedida:* ${configuracion.goodbyeImg || 'Foto del grupo'}\n`
      texto += `│\n`
      texto += `╰➺ *Usuario:* @${m.sender.split('@')[0]}\n`
      texto += `\n> PAIN COMMUNITY`
      
      return conn.sendMessage(m.chat, {
        text: texto,
        contextInfo: {
          mentionedJid: [m.sender]
        }
      }, { quoted: m })
      
    } else if (accion === 'reset') {
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
      
    } else if (accion === 'debug' || accion === 'test') {
      const configuracion = global.db.data.bienvenidas[m.chat]
      let infoDepuracion = `《✧》*DEBUG - CONFIGURACIÓN ACTUAL*\n\n`
      infoDepuracion += `*Grupo:* ${m.chat}\n`
      infoDepuracion += `*Tipo de configuración:* ${typeof configuracion}\n`
      infoDepuracion += `*Configuración completa:* ${JSON.stringify(configuracion, null, 2)}\n\n`
      
      if (configuracion && typeof configuracion === 'object') {
        infoDepuracion += `*Estado:* ${configuracion.enabled ? 'ACTIVADO' : 'DESACTIVADO'}\n`
        infoDepuracion += `*Mensaje bienvenida:* ${configuracion.welcomeMsg || 'Por defecto'}\n`
        infoDepuracion += `*Mensaje despedida:* ${configuracion.goodbyeMsg || 'Por defecto'}\n`
        infoDepuracion += `*Imagen bienvenida:* ${configuracion.welcomeImg || 'Foto del grupo'}\n`
        infoDepuracion += `*Imagen despedida:* ${configuracion.goodbyeImg || 'Foto del grupo'}\n`
      } else {
        infoDepuracion += `*Error:* Configuración no válida\n`
      }
      
      return conn.sendMessage(m.chat, {
        text: infoDepuracion
      }, { quoted: m })
      
    } else if (accion === 'testimg') {
      const configuracion = global.db.data.bienvenidas[m.chat]
      
      if (!configuracion || !configuracion.enabled) {
        return conn.sendMessage(m.chat, {
          text: '《✧》El sistema no está activado. Usa .welcome on primero.'
        }, { quoted: m })
      }
      
      if (!configuracion.welcomeImg || configuracion.welcomeImg === '') {
        return conn.sendMessage(m.chat, {
          text: '《✧》No hay imagen personalizada configurada. Usa .welcome img welcome <url> primero.'
        }, { quoted: m })
      }
      
      const mensajePrueba = configuracion.welcomeMsg || 
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
      
      const mensajePruebaFinal = mensajePrueba
        .replace(/\${user}/g, await conn.getName(m.sender) || 'Usuario')
        .replace(/\${participant}/g, `@${m.sender.split('@')[0]}`)
        .replace(/\${group}/g, await conn.getName(m.chat) || 'Grupo')
        .replace(/\${memberCount}/g, (await conn.groupMetadata(m.chat)).participants.length)
        .replace(/\${date}/g, new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' }))
        .replace(/\${time}/g, new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }))
      
      try {
        await conn.sendMessage(m.chat, {
          text: `《✧》*PRUEBA DE IMAGEN PERSONALIZADA*\n\n*URL:* ${configuracion.welcomeImg}\n\n*Enviando mensaje de prueba:*`
        }, { quoted: m })
        
        await conn.sendMessage(m.chat, {
          image: { url: configuracion.welcomeImg },
          caption: mensajePruebaFinal,
          contextInfo: {
            mentionedJid: [m.sender]
          }
        })
        
        await conn.sendMessage(m.chat, {
          text: '《✧》*PRUEBA COMPLETADA*\n\nSi ves la imagen personalizada arriba, el sistema funciona correctamente.'
        })
        
      } catch (error) {
        return conn.sendMessage(m.chat, {
          text: `《✧》*ERROR EN PRUEBA*\n\n*Error:* ${error.message}\n\n*URL:* ${configuracion.welcomeImg}`
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
