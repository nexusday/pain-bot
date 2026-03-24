let handler = async (m, { conn, args, usedPrefix }) => {
  try {
    if (!m.isGroup) {
      return conn.sendMessage(m.chat, {
        text: '[❗] Este comando solo funciona en grupos.'
      }, { quoted: m })
    }
    
    if (!global.db.data.publicaciones) global.db.data.publicaciones = {}
    if (!global.db.data.publicaciones[m.chat]) global.db.data.publicaciones[m.chat] = {
      enabled: false,
      image: '',
      text: '',
      imageType: '',
      interval: 600000,
      savedBy: '',
      savedAt: '',
      activatedBy: '',
      activatedAt: '',
      timeSetBy: '',
      timeSetAt: ''
    }
    
    if (global.db.data.publicaciones[m.chat]) {
      if (!global.db.data.publicaciones[m.chat].imageType) global.db.data.publicaciones[m.chat].imageType = ''
      if (!global.db.data.publicaciones[m.chat].savedBy) global.db.data.publicaciones[m.chat].savedBy = ''
      if (!global.db.data.publicaciones[m.chat].savedAt) global.db.data.publicaciones[m.chat].savedAt = ''
      if (!global.db.data.publicaciones[m.chat].activatedBy) global.db.data.publicaciones[m.chat].activatedBy = ''
      if (!global.db.data.publicaciones[m.chat].activatedAt) global.db.data.publicaciones[m.chat].activatedAt = ''
      if (!global.db.data.publicaciones[m.chat].timeSetBy) global.db.data.publicaciones[m.chat].timeSetBy = ''
      if (!global.db.data.publicaciones[m.chat].timeSetAt) global.db.data.publicaciones[m.chat].timeSetAt = ''
      if (!global.db.data.publicaciones[m.chat].interval) global.db.data.publicaciones[m.chat].interval = 600000
    }
    
    const action = args[0]?.toLowerCase()
    
    if (action === 'on') {
      if (!global.db.data.publicaciones[m.chat].image) {
        return conn.sendMessage(m.chat, {
          text: '《✧》*NO HAY PUBLICACIÓN GUARDADA*\n\nPrimero guarda una publicación:\n\n1. Envía una imagen/video con texto\n2. Responde con .savep\n3. Luego activa con .publicg on'
        }, { quoted: m })
      }
      
      global.db.data.publicaciones[m.chat].enabled = true
      global.db.data.publicaciones[m.chat].activatedBy = m.sender
      global.db.data.publicaciones[m.chat].activatedAt = new Date().toISOString()
      
      await global.db.write()
      
      if (typeof global.startPublicationTimer === 'function') {
        global.startPublicationTimer(m.chat, global.db.data.publicaciones[m.chat])
      }
      
      let txt = `╭─「 *PUBLICACIÓN AUTOMÁTICA ACTIVADA* 」─╮\n`
      txt += `│\n`
      txt += `╰➺ *Estado:* Activado\n`
      txt += `╰➺ *Intervalo:* Cada 10 minutos\n`
      txt += `╰➺ *Tipo:* ${global.db.data.publicaciones[m.chat].imageType === 'image' ? 'Imagen' : 'Video'}\n`
      txt += `╰➺ *Texto:* ${global.db.data.publicaciones[m.chat].text.length > 30 ? global.db.data.publicaciones[m.chat].text.substring(0, 30) + '...' : global.db.data.publicaciones[m.chat].text || 'Sin texto'}\n`
      txt += `│\n`
      txt += `╰➺ *Usuario:* @${m.sender.split('@')[0]}\n`
      txt += `\n> PAIN COMMUNITY`
      
      await conn.sendMessage(m.chat, {
        text: txt,
        contextInfo: {
          mentionedJid: [m.sender]
        }
      }, { quoted: m })
      
      try {
        const imageBuffer = Buffer.from(global.db.data.publicaciones[m.chat].image, 'base64')
        
        if (global.db.data.publicaciones[m.chat].imageType === 'image') {
          await conn.sendMessage(m.chat, {
            image: imageBuffer,
            caption: global.db.data.publicaciones[m.chat].text
          })
        } else if (global.db.data.publicaciones[m.chat].imageType === 'video') {
          await conn.sendMessage(m.chat, {
            video: imageBuffer,
            caption: global.db.data.publicaciones[m.chat].text
          })
        }
        
      } catch (error) {
        await conn.sendMessage(m.chat, {
          text: `《✧》*ERROR AL ENVIAR PRIMERA PUBLICACIÓN*\n\nError: ${error.message}\n\nEl sistema está activado pero no pudo enviar la primera publicación.`
        })
      }
      
    } else if (action === 'off') {
      global.db.data.publicaciones[m.chat].enabled = false
      
      await global.db.write()
      
      if (typeof global.stopPublicationTimer === 'function') {
        global.stopPublicationTimer(m.chat)
      }
      
      let txt = `╭─「 *PUBLICACIÓN AUTOMÁTICA DESACTIVADA* 」─╮\n`
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
      
    } else if (action === 'time') {
      const timeArg = args[1]
      
      if (!timeArg) {
        return conn.sendMessage(m.chat, {
          text: `《✧》*Uso:* ${usedPrefix}publicg time <minutos>\n\n*Ejemplos:*\n• ${usedPrefix}publicg time 5m - Cada 5 minutos\n• ${usedPrefix}publicg time 30m - Cada 30 minutos\n• ${usedPrefix}publicg time 2h - Cada 2 horas\n\n*Intervalo actual:* ${Math.round(global.db.data.publicaciones[m.chat].interval / 60000)} minutos`
        }, { quoted: m })
      }
      
      const timeMatch = timeArg.match(/^(\d+)(m|h|s)$/i)
      if (!timeMatch) {
        return conn.sendMessage(m.chat, {
          text: '《✧》*Formato inválido*\n\nUsa: número + unidad\n• 5m = 5 minutos\n• 2h = 2 horas\n• 30s = 30 segundos'
        }, { quoted: m })
      }
      
      const [, number, unit] = timeMatch
      const num = parseInt(number)
      
      if (num < 1) {
        return conn.sendMessage(m.chat, {
          text: '《✧》El tiempo mínimo es 1 segundo.'
        }, { quoted: m })
      }
      
      let intervalMs
      switch (unit.toLowerCase()) {
        case 's':
          intervalMs = num * 1000
          break
        case 'm':
          intervalMs = num * 60000
          break
        case 'h':
          intervalMs = num * 3600000
          break
        default:
          return conn.sendMessage(m.chat, {
            text: '《✧》Unidad inválida. Usa: s (segundos), m (minutos), h (horas)'
          }, { quoted: m })
      }
      
      if (intervalMs < 10000) {
        return conn.sendMessage(m.chat, {
          text: '《✧》El intervalo mínimo es 10 segundos para evitar spam excesivo.'
        }, { quoted: m })
      }
      
      global.db.data.publicaciones[m.chat].interval = intervalMs
      global.db.data.publicaciones[m.chat].timeSetBy = m.sender
      global.db.data.publicaciones[m.chat].timeSetAt = new Date().toISOString()
      
      await global.db.write()
      
      const intervalText = intervalMs >= 3600000 ? 
        `${Math.round(intervalMs / 3600000)} hora${Math.round(intervalMs / 3600000) > 1 ? 's' : ''}` :
        intervalMs >= 60000 ? 
        `${Math.round(intervalMs / 60000)} minuto${Math.round(intervalMs / 60000) > 1 ? 's' : ''}` :
        `${Math.round(intervalMs / 1000)} segundo${Math.round(intervalMs / 1000) > 1 ? 's' : ''}`
      
      let txt = `╭─「 *INTERVALO CONFIGURADO* 」─╮\n`
      txt += `│\n`
      txt += `╰➺ *Nuevo intervalo:* ${intervalText}\n`
      txt += `╰➺ *Estado:* ${global.db.data.publicaciones[m.chat].enabled ? 'ACTIVADO' : 'DESACTIVADO'}\n`
      txt += `╰➺ *Usuario:* @${m.sender.split('@')[0]}\n`
      txt += `│\n`
      if (!global.db.data.publicaciones[m.chat].enabled) {
        txt += `╰➺ *Para activar:* ${usedPrefix}publicg on\n`
      }
      txt += `\n> PAIN COMMUNITY`
      
      return conn.sendMessage(m.chat, {
        text: txt,
        contextInfo: {
          mentionedJid: [m.sender]
        }
      }, { quoted: m })
      
    } else if (action === 'status' || action === 'estado') {
      const config = global.db.data.publicaciones[m.chat]
      const isEnabled = config.enabled === true
      const status = isEnabled ? 'ACTIVADO' : 'DESACTIVADO'
      const hasImage = config.image && config.image !== ''
      const hasText = config.text && config.text !== ''
      
      let statusTxt = `╭─「 *ESTADO DE PUBLICACIÓN* 」─╮\n`
      statusTxt += `│\n`
      statusTxt += `╰➺ *Estado:* ${status}\n`
      statusTxt += `╰➺ *Grupo:* ${await conn.getName(m.chat) || 'Grupo'}\n`
      statusTxt += `╰➺ *Intervalo:* ${Math.round(config.interval / 60000)} minutos\n`
      statusTxt += `│\n`
      statusTxt += `╰➺ *Contenido Guardado:*\n`
      statusTxt += `   • *Imagen/Video:* ${hasImage ? '✅ Guardado' : '❌ No guardado'}\n`
      statusTxt += `   • *Tipo:* ${config.imageType === 'image' ? '🖼️ Imagen' : config.imageType === 'video' ? '🎥 Video' : '❌ No configurado'}\n`
      statusTxt += `   • *Texto:* ${hasText ? '✅ Guardado' : '❌ No guardado'}\n`
      statusTxt += `│\n`
      if (hasText) {
        statusTxt += `╰➺ *Texto Guardado:*\n`
        statusTxt += `   ${config.text.length > 100 ? config.text.substring(0, 100) + '...' : config.text}\n`
        statusTxt += `│\n`
      }
      statusTxt += `╰➺ *Información:*\n`
      if (config.savedBy) {
        const savedByUser = await conn.getName(config.savedBy) || config.savedBy.split('@')[0]
        statusTxt += `   • *Guardado por:* @${config.savedBy.split('@')[0]}\n`
        if (config.savedAt) {
          const savedDate = new Date(config.savedAt).toLocaleString('es-ES')
          statusTxt += `   • *Guardado el:* ${savedDate}\n`
        }
      }
      if (isEnabled && config.activatedBy) {
        const activatedByUser = await conn.getName(config.activatedBy) || config.activatedBy.split('@')[0]
        statusTxt += `   • *Activado por:* @${config.activatedBy.split('@')[0]}\n`
        if (config.activatedAt) {
          const activatedDate = new Date(config.activatedAt).toLocaleString('es-ES')
          statusTxt += `   • *Activado el:* ${activatedDate}\n`
        }
      }
      if (config.timeSetBy) {
        statusTxt += `   • *Intervalo configurado por:* @${config.timeSetBy.split('@')[0]}\n`
        if (config.timeSetAt) {
          const timeSetDate = new Date(config.timeSetAt).toLocaleString('es-ES')
          statusTxt += `   • *Configurado el:* ${timeSetDate}\n`
        }
      }
      statusTxt += `│\n`
      statusTxt += `╰➺ *Usuario:* @${m.sender.split('@')[0]}\n`
      statusTxt += `\n> PAIN COMMUNITY`
      
      return conn.sendMessage(m.chat, {
        text: statusTxt,
        contextInfo: {
          mentionedJid: [m.sender]
        }
      }, { quoted: m })
      
    } else if (action === 'debug') {
      let debugInfo = `╭─「 *DEBUG PUBLICACIONES* 」─╮\n`
      debugInfo += `│\n`
      debugInfo += `╰➺ *Chat ID:* ${m.chat}\n`
      debugInfo += `╰➺ *DB Existe:* ${!!global.db.data.publicaciones}\n`
      debugInfo += `╰➺ *Chat Existe:* ${!!global.db.data.publicaciones[m.chat]}\n`
      
      if (global.db.data.publicaciones[m.chat]) {
        debugInfo += `╰➺ *Enabled:* ${global.db.data.publicaciones[m.chat].enabled}\n`
        debugInfo += `╰➺ *Image:* ${global.db.data.publicaciones[m.chat].image ? 'Sí' : 'No'}\n`
        debugInfo += `╰➺ *Text:* ${global.db.data.publicaciones[m.chat].text ? 'Sí' : 'No'}\n`
        debugInfo += `╰➺ *ImageType:* ${global.db.data.publicaciones[m.chat].imageType}\n`
        debugInfo += `╰➺ *Interval:* ${global.db.data.publicaciones[m.chat].interval}\n`
        debugInfo += `╰➺ *SavedBy:* ${global.db.data.publicaciones[m.chat].savedBy}\n`
        debugInfo += `╰➺ *SavedAt:* ${global.db.data.publicaciones[m.chat].savedAt}\n`
      }
      
      debugInfo += `│\n`
      debugInfo += `╰➺ *Usuario:* @${m.sender.split('@')[0]}\n`
      debugInfo += `\n> PAIN COMMUNITY`
      
      return conn.sendMessage(m.chat, {
        text: debugInfo,
        contextInfo: {
          mentionedJid: [m.sender]
        }
      }, { quoted: m })
      
    } else if (action === 'all') {
      let allInfo = `╭─「 *TODAS LAS PUBLICACIONES* 」─╮\n`
      allInfo += `│\n`
      
      if (!global.db.data.publicaciones || Object.keys(global.db.data.publicaciones).length === 0) {
        allInfo += `╰➺ *No hay publicaciones configuradas*\n`
      } else {
        let activeCount = 0
        let totalCount = 0
        
        for (const [chatId, config] of Object.entries(global.db.data.publicaciones)) {
          if (config && typeof config === 'object') {
            totalCount++
            if (config.enabled === true && config.image && config.image.trim() !== '') {
              activeCount++
              const groupName = await conn.getName(chatId) || 'Grupo'
              const interval = Math.round(config.interval / 60000)
              allInfo += `╰➺ *${groupName}* - ${interval}m\n`
            }
          }
        }
        
        allInfo += `│\n`
        allInfo += `╰➺ *Activas:* ${activeCount}\n`
        allInfo += `╰➺ *Total:* ${totalCount}\n`
      }
      
      allInfo += `│\n`
      allInfo += `╰➺ *Usuario:* @${m.sender.split('@')[0]}\n`
      allInfo += `\n> PAIN COMMUNITY`
      
      return conn.sendMessage(m.chat, {
        text: allInfo,
        contextInfo: {
          mentionedJid: [m.sender]
        }
      }, { quoted: m })
      
    } else {
      return conn.sendMessage(m.chat, {
        text: `《✧》*SISTEMA DE PUBLICACIONES AUTOMÁTICAS*\n\n*COMANDOS:*\n• ${usedPrefix}publicg on - Activar spam\n• ${usedPrefix}publicg off - Desactivar spam\n• ${usedPrefix}publicg status - Ver estado\n• ${usedPrefix}publicg time <tiempo> - Configurar intervalo\n• ${usedPrefix}publicg debug - Información de debug\n• ${usedPrefix}publicg all - Ver todas las publicaciones\n\n*FORMATOS DE TIEMPO:*\n• 5m = 5 minutos\n• 30s = 30 segundos\n• 2h = 2 horas\n\n*PASOS:*\n1. Envía imagen/video con texto\n2. Responde con .savep\n3. Configura tiempo: .publicg time 5m\n4. Activa: .publicg on\n\n*FUNCIONA:* Automáticamente según el intervalo configurado`
      }, { quoted: m })
    }
    
  } catch (e) {
    console.error('Error en publicg:', e)
    return conn.sendMessage(m.chat, {
      text: '《✧》Ocurrió un error al configurar la publicación automática.'
    }, { quoted: m })
  }
}

handler.command = ['publicg', 'publicacion', 'spam']
handler.group = true
handler.admin = true

export default handler
