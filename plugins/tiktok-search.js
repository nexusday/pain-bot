import fetch from 'node-fetch'
//import { Sticker, StickerTypes } from 'wa-sticker-formatter'

let handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text) return conn.sendMessage(m.chat, {
    text: `*[❗] Ingresa un término de búsqueda.*\nEjemplo: ${usedPrefix + command} funk`,
    contextInfo: {
      ...rcanal.contextInfo
    }
  }, { quoted: m })
  
  try {
    
    const searchUrl = `https://bytebazz-api.koyeb.app/api/busqueda/tiktok?query=${encodeURIComponent(text)}&apikey=8jkh5icbf05`
    const response = await fetch(searchUrl)
    const data = await response.json()
    
    if (!data.status || !data.resultado || data.resultado.length === 0) {
      return conn.sendMessage(m.chat, {
        text: '*[❗] No se encontraron resultados para tu búsqueda.*',
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }
    
    const video = data.resultado[0]
    

    const info = `𝗥𝗘𝗦𝗨𝗟𝗧𝗔𝗗𝗢 𝗗𝗘 𝗧𝗜𝗞𝗧𝗢𝗞

> *[+] Título:* ${video.titulo || 'Sin título'}
> *[+] Autor:* ${video.autor || 'Desconocido'}
> *[+] Región:* ${video.region || 'Desconocida'}

> *[•] Estadísticas*
> *├─* Vistas: ${video.vistas ? video.vistas.toLocaleString() : 'N/A'}
> *├─* Me gusta: ${video.me_gusta ? video.me_gusta.toLocaleString() : 'N/A'}
> *├─* Comentarios: ${video.comentarios ? video.comentarios.toLocaleString() : 'N/A'}
> *├─* Compartidos: ${video.compartir ? video.compartir.toLocaleString() : 'N/A'}
> *├─* Descargas: ${video.descargas ? video.descargas.toLocaleString() : 'N/A'}
> *└─* Fecha: ${video.fecha_creacion ? new Date(video.fecha_creacion * 1000).toLocaleDateString() : 'N/A'}`
    
    await conn.sendMessage(m.chat, {
      video: { url: video.sin_marca_agua || video.con_marca_agua },
      caption: info,
      mentions: [m.sender],
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
    
  } catch (e) {
    console.error('Error en tiktok-search:', e)
    conn.sendMessage(m.chat, {
      text: '*[❗] Ocurrió un error al buscar en TikTok. Por favor, inténtalo de nuevo más tarde.*',
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
}

handler.help = ['#tiktok <búsqueda>']
handler.tags = ['busqueda']
handler.command = ['tiktok', 'ttsearch']
export default handler
