import fetch from 'node-fetch'


async function traducirAlEspanol(text) {
  try {
    const respuestaApi = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=es&dt=t&q=${encodeURIComponent(text)}`)
    const datos = await respuestaApi.json()
    return datos[0][0][0] || text
  } catch (error) {
    console.error('Error traduciendo:', error)
    return text
  }
}

let handler = async (m, { conn, text, args, usedPrefix, command }) => {
  if (!text) {
    return conn.sendMessage(m.chat, {
      text: `BÚSQUEDA \n\n*Uso:* ${usedPrefix}google <búsqueda>\n*Ejemplo:* ${usedPrefix}google Pain\n*Ejemplo:* ${usedPrefix}google anime\n`,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }

  try {
    
    const consultaBusqueda = encodeURIComponent(text)
    const urlBusqueda = `https://api.duckduckgo.com/?q=${consultaBusqueda}&format=json&no_html=1&skip_disambig=1`
    
    const respuestaApi = await fetch(urlBusqueda)
    const datos = await respuestaApi.json()
    
    if (!datos.AbstractText && (!datos.RelatedTopics || datos.RelatedTopics.length === 0)) {
      await conn.sendMessage(m.chat, {
        text: 'NO SE ENCONTRARON RESULTADOS \n\n *No se encontraron resultados*\n *Intenta con otros términos*\n',
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
      return
    }

   
    let textoInfo = 'RESULTADOS \n\n'
    textoInfo += `*Búsqueda:* ${text}\n\n`

  
    if (datos.AbstractText) {
      const textoTraducido = await traducirAlEspanol(datos.AbstractText)
      textoInfo += '╭INFORMACIÓN \n\n'
      textoInfo += `╰➺  *${textoTraducido}*\n`
      if (datos.AbstractSource) {
        textoInfo += `╰➺  *Fuente:* ${datos.AbstractSource}\n`
      }
      if (datos.AbstractURL) {
        textoInfo += `╰➺  *Enlace:* ${datos.AbstractURL}\n`
      }
      textoInfo += '\n'
    }

    
    if (datos.RelatedTopics && datos.RelatedTopics.length > 0) {
      textoInfo += 'TEMAS\n\n'
      
      const temas = datos.RelatedTopics.slice(0, 2) 
      for (let i = 0; i < temas.length; i++) {
        const tema = temas[i]
        if (tema.Text) {
          const textoTraducido = await traducirAlEspanol(tema.Text)
          textoInfo += `╰➺  *${i + 1}. ${textoTraducido.substring(0, 110)}${textoTraducido.length > 100 ? '...' : ''}*\n`
          if (tema.FirstURL) {
            textoInfo += `╰➺  *Enlace:* ${tema.FirstURL}\n\n`
          }
        }
      }
      
      textoInfo += '\n\n'
    }

  
    let urlImagen = null
    if (datos.Image) {
      urlImagen = datos.Image
    } else if (datos.RelatedTopics && datos.RelatedTopics.length > 0) {
    
      for (const tema of datos.RelatedTopics) {
        if (tema.Icon && tema.Icon.URL) {
          urlImagen = tema.Icon.URL
          break
        }
      }
    }

    
    if (urlImagen) {
      try {
        await conn.sendMessage(m.chat, {
          image: { url: urlImagen },
          caption: textoInfo + '',
          contextInfo: {
            ...rcanal.contextInfo
          }
        }, { quoted: m })
      } catch (errorImg) {
        console.error('Error enviando imagen:', errorImg)
      
        await conn.sendMessage(m.chat, {
          text: textoInfo + '',
          contextInfo: {
            ...rcanal.contextInfo
          }
        }, { quoted: m })
      }
    } else {
    
      await conn.sendMessage(m.chat, {
        text: textoInfo + '',
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }

  } catch (error) {
    console.error('Error en búsqueda de DuckDuckGo:', error)
    
    await conn.sendMessage(m.chat, {
      text: 'ERROR\n\n*Error en la búsqueda*\n*Por favor, inténtalo más tarde*\n',
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
}

handler.help = ['#google <búsqueda>']
handler.tags = ['búsquedas', 'internet']
handler.command = ['google', 'g', 'buscar', 'search']

export default handler 