import axios from 'axios'

let handler = async (m, { conn, text, args, usedPrefix, command }) => {
  if (!text) {
    return conn.sendMessage(m.chat, {
      text: `[❗] Uso incorrecto\n\n> *Ejemplo:*\n ${usedPrefix + command} carla`,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }

  const nombreUsuario = text.trim().toLowerCase()
  
  try {
   
    const urlApi = `https://bytebazz-api.koyeb.app/api/busqueda/onlyfans?username=${encodeURIComponent(nombreUsuario)}&apikey=8jkh5icbf05`
    const { data } = await axios.get(urlApi)

    if (!data.status) {
      await conn.sendMessage(m.chat, {
        text: `[❗] No se encontró el usuario.`,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
      return
    }

    const datosUsuario = data.user
    
   
    const infoUsuario = ` *${datosUsuario.name}* 
> *Nombre:* ${datosUsuario.name}
> *Username:* @${datosUsuario.username}
> *ID:* ${datosUsuario.id}
> *Verificado:* ${datosUsuario.isVerified ? 'Sí ✅' : 'No ❌'}

> *Descripción:*
> ${datosUsuario.about || 'Sin descripción'}

> *Estadísticas:*
> Posts: ${datosUsuario.postsCount || 0}
> Fotos: ${datosUsuario.photosCount || 0}
> Videos: ${datosUsuario.videosCount || 0}
> Audios: ${datosUsuario.audiosCount || 0}
> Total: ${datosUsuario.mediasCount || 0}

> *Información adicional:*
> Fecha de registro: ${new Date(datosUsuario.joinDate).toLocaleDateString()}
> Última vez visto: ${new Date(datosUsuario.lastSeen).toLocaleDateString()}
> Contenido adulto: ${datosUsuario.isAdultContent ? 'Sí 🔞' : 'No ✅'}
> Precio suscripción: $${datosUsuario.subscribePrice || 0}

> *Enlaces:*
> [Website] (${datosUsuario.website})`

   
    if (datosUsuario.avatar) {
      try {
        const respuestaAvatar = await axios.get(datosUsuario.avatar, { responseType: 'arraybuffer' })
        const bufferAvatar = Buffer.from(respuestaAvatar.data)
        
        await conn.sendMessage(m.chat, {
          image: bufferAvatar,
          caption: infoUsuario,
          contextInfo: {
            ...rcanal.contextInfo
          }
        }, { quoted: m })
      } catch (errorAvatar) {
        console.error('Error descargando avatar:', errorAvatar)
        
       
        await conn.sendMessage(m.chat, {
          text: infoUsuario,
          contextInfo: {
            ...rcanal.contextInfo
          }
        }, { quoted: m })
      }
    } else {
    
      await conn.sendMessage(m.chat, {
        text: infoUsuario,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }

   
    if (datosUsuario.header) {
      try {
        const respuestaHeader = await axios.get(datosUsuario.header, { responseType: 'arraybuffer' })
        const bufferHeader = Buffer.from(respuestaHeader.data)
        
        await conn.sendMessage(m.chat, {
          image: bufferHeader,
          caption: `> Su Banner de *${datosUsuario.name}*`,
          contextInfo: {
            ...rcanal.contextInfo
          }
        }, { quoted: m })
      } catch (errorHeader) {
        console.error('Error descargando header:', errorHeader)
      }
    }

  } catch (error) {
    console.error('Error en comando onlyfans-info:', error)
    
    await conn.sendMessage(m.chat, {
      text: `[❌] Error al buscar, api caido.`,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
}

handler.help = ['onlyfans <username>', 'of <username>', 'onlyfansinfo <username>']
handler.tags = ['búsquedas']
handler.command = ['onlyfans', 'of', 'onlyfansinfo']

export default handler 