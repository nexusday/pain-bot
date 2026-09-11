
let handler = async (m, { conn, args, usedPrefix, command }) => {
  try {
    if (!args[0]) {
      return conn.sendMessage(m.chat, {
        text: `[❗] Uso incorrecto\n\n> *Ejemplo:* ${usedPrefix}${command} Sunkovvz`,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }

    let nombreUsuario = args[0].trim()
        
    if (nombreUsuario.startsWith('@')) {
      nombreUsuario = nombreUsuario.slice(1)
    }

    if (nombreUsuario.length < 1) {
      return conn.sendMessage(m.chat, {
        text: '[❗] Username inválido.',
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }


    const urlApi = `https://bytebazz-api.koyeb.app/api/stalker/tiktok2?username=${encodeURIComponent(nombreUsuario)}&apikey=8jkh5icbf05`
    const respuestaApi = await fetch(urlApi)
    const datos = await respuestaApi.json()

    if (!datos.status || !datos.resultado) {
      throw new Error('Perfil no encontrado o API no disponible')
    }

    const perfil = datos.resultado

    
    const formatearNumero = (num) => {
      if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
      if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
      return num.toString()
    }

    const textoInfo = `
 🌴 𝗧𝗜𝗞𝗧𝗢𝗞 𝗣𝗥𝗢𝗙𝗜𝗟𝗘 🌴

> *Nombre:* ${perfil.apodo || 'N/A'}
> *Usuario:* @${perfil.nombre_usuario || nombreUsuario}
> *Seguidores:* ${perfil.seguidores ? formatearNumero(perfil.seguidores) : 'N/A'}
> *Siguiendo:* ${perfil.siguiendo ? formatearNumero(perfil.siguiendo) : 'N/A'}
> *Likes:* ${perfil.me_gusta ? formatearNumero(perfil.me_gusta) : 'N/A'}
> *Videos:* ${perfil.videos ? formatearNumero(perfil.videos) : 'N/A'}
> *Verificado:* ${perfil.verificado ? 'Sí' : 'No'}
> *Privada:* ${perfil.cuenta_privada ? 'Sí' : 'No'}
> *Biografía:* ${perfil.biografia || 'Sin biografía'}`


    if (perfil.avatar) {
      try {
        await conn.sendMessage(m.chat, {
          image: { url: perfil.avatar },
          caption: textoInfo,
          contextInfo: {
            ...rcanal.contextInfo,
            mentionedJid: [m.sender]
          }
        }, { quoted: m })
      } catch (error) {
        console.log('Error al enviar imagen:', error.message)
        
        await conn.sendMessage(m.chat, {
          text: textoInfo,
          contextInfo: {
            ...rcanal.contextInfo,
            mentionedJid: [m.sender]
          }
        }, { quoted: m })
      }
    } else {
      
      await conn.sendMessage(m.chat, {
        text: textoInfo,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [m.sender]
        }
      }, { quoted: m })
    }

  } catch (error) {
    console.error('Error en tik:', error)
    conn.sendMessage(m.chat, {
      text: `[❌] Error: ${error.message || 'No se pudo obtener la información del perfil'}`,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
}

handler.help = ['tik <usuario> �? Obtiene información completa de un perfil de TikTok']
handler.tags = ['herramientas', 'osint']
handler.command = ['tik']

export default handler
