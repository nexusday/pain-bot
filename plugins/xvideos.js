import fetch from "node-fetch"
import axios from "axios"
import cheerio from "cheerio"

const handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text) {
    return conn.sendMessage(m.chat, {
      text: `xᴠɪᴅᴇᴏs ʙᴜsᴄᴀᴅᴏʀ\n\n *Uso:* ${usedPrefix}xvideos <búsqueda>\n *Ejemplo:* ${usedPrefix}xvideos amateur\n *URL:* ${usedPrefix}xvideos <url>\n\n`,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }

  conn.xvideos = conn.xvideos || {}
  const isUrl = text.includes('xvideos.com')
  
  if (isUrl) {
    await conn.sendMessage(m.chat, {
      text: `ᴘʀᴏᴄᴇsᴀɴᴅᴏ\n\n *URL:* ${text}\n *Estado:* Descargando...`,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
    
         try {
       const videoInfo = await xvideosdl(text)
       if (!videoInfo || !videoInfo.result) {
         return conn.sendMessage(m.chat, {
           text: `[❌] *Error:* No se encontró información del video\n[❌] *Verifica la URL*`,
           contextInfo: {
             ...rcanal.contextInfo
           }
         }, { quoted: m })
       }

       const videoUrl = videoInfo.result.url
       let peso = await size(videoInfo.result.url)

       const cap = `ᴠɪᴅᴇᴏ xᴠɪᴅᴇᴏs\n\n *Título:* ${videoInfo.result.title}\n *Vistas:* ${videoInfo.result.views}\n *Likes:* ${videoInfo.result.likes}\n *Peso:* ${peso}\n *Dislikes:* ${videoInfo.result.deslikes}\n *Link:* ${text}\n\n> PAIN COMMUNITY`

      await conn.sendMessage(m.chat, {
        video: { url: videoUrl },
        caption: cap,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
      
    } catch (e) {
      console.error('Error en descarga XVideos:', e)
      await conn.sendMessage(m.chat, {
        text: `[❌] *Error:* ${e.message}\n[❌] *Verifica la URL*`,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }
    return
  }

  
  await conn.sendMessage(m.chat, {
    text: `ʙᴜsᴄᴀɴᴅᴏ\n\n *Búsqueda:* ${text}\n *Estado:* Procesando...`,
    contextInfo: {
      ...rcanal.contextInfo
    }
  }, { quoted: m })

  const results = await searchXvideos(text)
  if (!results || results.length === 0) {
    return conn.sendMessage(m.chat, {
      text: `ɴᴏ ʀᴇsᴜʟᴛᴀᴅᴏs\n\n *Búsqueda:* ${text}\n *Estado:* No se encontraron videos\n`,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }

  const list = results.slice(0, 10).map((res, i) => 
    `*${i + 1}.*\n *Título:* ${res.title}\n *Link:* ${res.url}`
  ).join('\n\n')

  const caption = `ʀᴇsᴜʟᴛᴀᴅᴏs ᴅᴇ ʙᴜsǫᴜᴇᴅᴀ\n\n *Búsqueda:* ${text}\n *Resultados:* ${results.length}\n\n${list}\n│\n *Escribe solo el número (1-10) para descargar*\n *Ejemplo: 3, 7, 1*\n *O usa directamente la URL*\n\n`

  const { key } = await conn.sendMessage(m.chat, { 
    text: caption,
    contextInfo: {
      ...rcanal.contextInfo
    }
  }, { quoted: m })
  
  conn.xvideos[m.sender] = {
    result: results.slice(0, 10),
    key,
    downloads: 0,
    timeout: setTimeout(() => delete conn.xvideos[m.sender], 120_000),
  }
}

handler.before = async (m, { conn }) => {
  conn.xvideos = conn.xvideos || {}
  const session = conn.xvideos[m.sender]
  
  if (!session) return

  if (!m.quoted || m.quoted.id !== session.key.id) return

  const n = parseInt(m.text.trim())
  if (isNaN(n) || n < 1 || n > session.result.length) return
  
 
  clearTimeout(session.timeout)
  delete conn.xvideos[m.sender]
  
  m.commandExecuted = true
  
  try {
    await conn.sendMessage(m.chat, {
      text: `ᴘʀᴏᴄᴇsᴀɴᴅᴏ\n\n *Video:* ${n}/${session.result.length}\n *Estado:* Descargando...`,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
    
         const link = session.result[n - 1].url
     const videoInfo = await xvideosdl(link)
     
     if (!videoInfo || !videoInfo.result) {
       throw new Error('No se pudo obtener información del video')
     }

     const videoUrl = videoInfo.result.url
     let peso = await size(videoInfo.result.url)
     
     const cap = `ᴠɪᴅᴇᴏ xᴠɪᴅᴇᴏs\n\n *Título:* ${videoInfo.result.title}\n *Vistas:* ${videoInfo.result.views}\n *Likes:* ${videoInfo.result.likes}\n *Peso:* ${peso}\n *Dislikes:* ${videoInfo.result.deslikes}\n *Link:* ${link}\n`
    
    await conn.sendMessage(m.chat, {
      video: { url: videoUrl },
      caption: cap,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
    
  } catch (e) {
    console.error('Error en descarga XVideos:', e)
    await conn.sendMessage(m.chat, {
      text: `[❌] *Error:* ${e.message}\n *Inténtalo más tarde*`,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  } finally {
    session.downloads++
  }
}

handler.command = ['xvideos', 'xvsearch', 'xvideosdl', 'xvid']
handler.tags = ['descargas', 'buscador', 'nsfw']
handler.help = ['xvideos <búsqueda> - Buscar y descargar videos de XVideos']

export default handler

async function searchXvideos(query) {
  return new Promise(async (resolve, reject) => {
    try {
      const url = `https://www.xvideos.com/?k=${encodeURIComponent(query)}`
      const response = await axios.get(url)
      const $ = cheerio.load(response.data)

      const results = []
      $("div.mozaique > div").each((index, element) => {
        const title = $(element).find("p.title a").attr("title")
        const videoUrl = "https://www.xvideos.com" + $(element).find("p.title a").attr("href")
        const duration = $(element).find("span.duration").text().trim()
        const quality = $(element).find("span.video-hd-mark").text().trim()

        if (title && videoUrl) {
          results.push({ title, url: videoUrl, duration, quality })
        }
      })

      resolve(results)
    } catch (error) {
      console.error("Error en búsqueda XVideos:", error)
      resolve([])
    }
  })
}

async function xvideosdl(url) {
  return new Promise((resolve, reject) => {
    fetch(`${url}`, { method: 'get' })
      .then(res => res.text())
      .then(res => {
        let $ = cheerio.load(res, { xmlMode: false })
        const title = $("meta[property='og:title']").attr("content") || "Sin título"
        const keyword = $("meta[name='keywords']").attr("content") || ""
        const viewsText = $("div#video-tabs > div > div > div > div > strong.mobile-hide").text()
        const views = viewsText ? viewsText + " views" : "Desconocidas"
        const vote = $("div.rate-infos > span.rating-total-txt").text() || "0"
        const likes = $("span.rating-good-nbr").text() || "0"
        const deslikes = $("span.rating-bad-nbr").text() || "0"
        const thumb = $("meta[property='og:image']").attr("content") || ""
        const videoUrl = $("#html5video > #html5video_base > div > a").attr("href")
        
        if (!videoUrl) {
          reject(new Error("No se pudo obtener la URL del video"))
          return
        }
        
        resolve({ 
          status: 200, 
          result: { 
            title, 
            url: videoUrl, 
            keyword, 
            views, 
            vote, 
            likes, 
            deslikes, 
            thumb 
          } 
        })
      })
      .catch(err => reject(err))
  })
}

async function size(url) {
  try {
    const res = await fetch(url, { method: 'HEAD' })
    const size = parseInt(res.headers.get('content-length'), 10)

    if (!size) throw new Error('Size not available')

    if (size >= 1e9) return (size / 1e9).toFixed(2) + ' GB'
    if (size >= 1e6) return (size / 1e6).toFixed(2) + ' MB'
    if (size >= 1e3) return (size / 1e3).toFixed(2) + ' KB'
    return size + ' Bytes'
  } catch (err) {
    return 'Error: ' + err.message
  }
} 