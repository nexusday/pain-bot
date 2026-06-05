import fetch from 'node-fetch'


async function translateToSpanish(text) {
  try {
    const response = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=es&dt=t&q=${encodeURIComponent(text)}`)
    const data = await response.json()
    return data[0][0][0] || text
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
    
    const searchQuery = encodeURIComponent(text)
    const searchUrl = `https://api.duckduckgo.com/?q=${searchQuery}&format=json&no_html=1&skip_disambig=1`
    
    const response = await fetch(searchUrl)
    const data = await response.json()
    
    if (!data.AbstractText && (!data.RelatedTopics || data.RelatedTopics.length === 0)) {
      await conn.sendMessage(m.chat, {
        text: 'NO SE ENCONTRARON RESULTADOS \n\n *No se encontraron resultados*\n *Intenta con otros términos*\n',
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
      return
    }

   
    let infoText = 'RESULTADOS \n\n'
    infoText += `*Búsqueda:* ${text}\n\n`

  
    if (data.AbstractText) {
      const translatedText = await translateToSpanish(data.AbstractText)
      infoText += '╭INFORMACIÓN \n\n'
      infoText += `╰➺  *${translatedText}*\n`
      if (data.AbstractSource) {
        infoText += `╰➺  *Fuente:* ${data.AbstractSource}\n`
      }
      if (data.AbstractURL) {
        infoText += `╰➺  *Enlace:* ${data.AbstractURL}\n`
      }
      infoText += '\n'
    }

    
    if (data.RelatedTopics && data.RelatedTopics.length > 0) {
      infoText += 'TEMAS\n\n'
      
      const topics = data.RelatedTopics.slice(0, 2) 
      for (let i = 0; i < topics.length; i++) {
        const topic = topics[i]
        if (topic.Text) {
          const translatedText = await translateToSpanish(topic.Text)
          infoText += `╰➺  *${i + 1}. ${translatedText.substring(0, 110)}${translatedText.length > 100 ? '...' : ''}*\n`
          if (topic.FirstURL) {
            infoText += `╰➺  *Enlace:* ${topic.FirstURL}\n\n`
          }
        }
      }
      
      infoText += '\n\n'
    }

  
    let imageUrl = null
    if (data.Image) {
      imageUrl = data.Image
    } else if (data.RelatedTopics && data.RelatedTopics.length > 0) {
    
      for (const topic of data.RelatedTopics) {
        if (topic.Icon && topic.Icon.URL) {
          imageUrl = topic.Icon.URL
          break
        }
      }
    }

    
    if (imageUrl) {
      try {
        await conn.sendMessage(m.chat, {
          image: { url: imageUrl },
          caption: infoText + '',
          contextInfo: {
            ...rcanal.contextInfo
          }
        }, { quoted: m })
      } catch (imgError) {
        console.error('Error enviando imagen:', imgError)
      
        await conn.sendMessage(m.chat, {
          text: infoText + '',
          contextInfo: {
            ...rcanal.contextInfo
          }
        }, { quoted: m })
      }
    } else {
    
      await conn.sendMessage(m.chat, {
        text: infoText + '',
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