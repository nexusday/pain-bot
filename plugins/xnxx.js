import fetch from 'node-fetch'
import cheerio from 'cheerio'

const handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text) {
    return conn.sendMessage(m.chat, {
      text: `xnxx ʙᴜsᴄᴀᴅᴏʀ\n\n *Uso:* ${usedPrefix}xnxx <búsqueda>\n *Ejemplo:* ${usedPrefix}xnxx anime\n *URL:* ${usedPrefix}xnxx <url>\n\n`,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }

  conn.xnxx = conn.xnxx || {}
  const isUrl = text.includes('xnxx.com')

  if (isUrl) {
    await conn.sendMessage(m.chat, {
      text: `ᴘʀᴏᴄᴇsᴀɴᴅᴏ\n\n *URL:* ${text}\n *Estado:* Descargando...`,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })

    try {
      const res = await xnxxdl(text)
      const { dur, qual, views } = res.result.info

      const texto = `ᴠɪᴅᴇᴏ xnxx\n\n *Título:* ${res.result.title}\n *Duración:* ${dur || 'Desconocida'}\n *Calidad:* ${qual || 'Desconocida'}\n *Vistas:* ${views || 'Desconocidas'}\n`

      const dll = res.result.files.high || res.result.files.low
      if (!dll) throw new Error('No se pudo obtener el enlace de descarga')

      await conn.sendMessage(m.chat, {
        video: { url: dll },
        caption: texto,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    } catch (error) {
      console.error('Error en descarga XNXX:', error)
      await conn.sendMessage(m.chat, {
        text: `[❌] *Error:* ${error.message}\n[❌] *Verifica la URL*`,
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

  const res = await search(encodeURIComponent(text))
  if (!res.result?.length) {
    return conn.sendMessage(m.chat, {
      text: `ɴᴏ ʀᴇsᴜʟᴛᴀᴅᴏs\n\n *Búsqueda:* ${text}\n *Estado:* No se encontraron videos\n`,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }

  const lista = res.result.slice(0, 10).map((v, i) =>
    `*${i + 1}.*\n *Título:* ${v.title}\n *Info:* ${v.info || 'Sin información'}\n *Link:* ${v.link}`
  ).join('\n\n')

  const leyenda = `ʀᴇsᴜʟᴛᴀᴅᴏs ᴅᴇ ʙᴜsǫᴜᴇᴅᴀ\n\n *Búsqueda:* ${text}\n *Resultados:* ${res.result.length}\n\n${lista}\n\n *Escribe solo el número (1-10) para descargar*\n *Ejemplo: 3, 7, 1*\n *O usa directamente la URL*\n\n`

  const { key } = await conn.sendMessage(m.chat, {
    text: leyenda,
    contextInfo: {
      ...rcanal.contextInfo
    }
  }, { quoted: m })

  conn.xnxx[m.sender] = {
    result: res.result.slice(0, 10),
    key,
    downloads: 0,
    timeout: setTimeout(() => delete conn.xnxx[m.sender], 120_000),
  }
}

handler.before = async (m, { conn }) => {
  conn.xnxx = conn.xnxx || {}
  const session = conn.xnxx[m.sender]

  if (!session) return
  if (!m.quoted || m.quoted.id !== session.key.id) return

  const n = parseInt(m.text.trim())
  if (isNaN(n) || n < 1 || n > session.result.length) return

  clearTimeout(session.timeout)
  delete conn.xnxx[m.sender]

  m.commandExecuted = true

  try {
    await conn.sendMessage(m.chat, {
      text: `ᴘʀᴏᴄᴇsᴀɴᴅᴏ\n\n *Video:* ${n}/${session.result.length}\n *Estado:* Descargando...`,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })

    const link = session.result[n - 1].link
    const res = await xnxxdl(link)
    const { dur, qual, views } = res.result.info

    const texto = `ᴠɪᴅᴇᴏ xnxx\n\n *Título:* ${res.result.title}\n *Duración:* ${dur || 'Desconocida'}\n *Calidad:* ${qual || 'Desconocida'}\n *Vistas:* ${views || 'Desconocidas'}\n`

    const dll = res.result.files.high || res.result.files.low
    if (!dll) throw new Error('No se pudo obtener el enlace de descarga')

    await conn.sendMessage(m.chat, {
      video: { url: dll },
      caption: texto,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  } catch (error) {
    console.error('Error en descarga XNXX:', error)
    await conn.sendMessage(m.chat, {
      text: `[❌] *Error:* ${error.message}\n *Inténtalo más tarde*`,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  } finally {
    session.downloads++
  }
}

handler.command = ['xnxxsearch', 'xnxxdl', 'xnxx']
handler.tags = ['descargas', 'buscador', 'nsfw']
handler.help = ['xnxx <búsqueda> - Buscar y descargar videos NSFW']

export default handler

function parseInfo(infoStr = '') {
  const lines = infoStr.split('\n').map(v => v.trim()).filter(Boolean)
  const [line1, line2] = lines
  let dur = '', qual = '', views = ''
  if (line1) {
    const durMatch = line1.match(/(\d+\s?min)/i)
    dur = durMatch ? durMatch[1] : ''
  }
  if (line2) {
    const parts = line2.split('-').map(v => v.trim()).filter(Boolean)
    if (parts.length >= 2) {
      qual = parts[0]
      views = parts[1]
    } else if (parts.length === 1) {
      qual = parts[0]
    }
  }
  return { dur, qual, views }
}

async function xnxxdl(URL) {
  return new Promise((resolve, reject) => {
    fetch(`${URL}`, { method: 'get' }).then((res) => res.text()).then((res) => {
      const $ = cheerio.load(res, { xmlMode: false })
      const title = $('meta[property="og:title"]').attr('content')
      const duration = $('meta[property="og:duration"]').attr('content')
      const image = $('meta[property="og:image"]').attr('content')
      const videoType = $('meta[property="og:video:type"]').attr('content')
      const videoWidth = $('meta[property="og:video:width"]').attr('content')
      const videoHeight = $('meta[property="og:video:height"]').attr('content')
      const info = $('span.metadata').text()
      const videoScript = $('#video-player-bg > script:nth-child(6)').html()
      const files = {
        low: (videoScript.match('html5player.setVideoUrlLow\\(\'(.*?)\'\\);') || [])[1],
        high: videoScript.match('html5player.setVideoUrlHigh\\(\'(.*?)\'\\);' || [])[1],
        HLS: videoScript.match('html5player.setVideoHLS\\(\'(.*?)\'\\);' || [])[1],
        thumb: videoScript.match('html5player.setThumbUrl\\(\'(.*?)\'\\);' || [])[1],
        thumb69: videoScript.match('html5player.setThumbUrl169\\(\'(.*?)\'\\);' || [])[1],
        thumbSlide: videoScript.match('html5player.setThumbSlide\\(\'(.*?)\'\\);' || [])[1],
        thumbSlideBig: videoScript.match('html5player.setThumbSlideBig\\(\'(.*?)\'\\);' || [])[1]
      }
      resolve({ status: 200, result: { title, URL, duration, image, videoType, videoWidth, videoHeight, info: parseInfo(info), files } })
    }).catch((err) => reject({ code: 503, status: false, result: err }))
  })
}

async function search(query) {
  return new Promise((resolve, reject) => {
    const baseurl = 'https://www.xnxx.com'

    fetch(`${baseurl}/search/${query}/${Math.floor(Math.random() * 3) + 1}`, { method: 'get' })
      .then((res) => res.text())
      .then((res) => {
        const $ = cheerio.load(res, { xmlMode: false })
        const title = []
        const url = []
        const desc = []
        const results = []

        $('div.mozaique').each(function (a, b) {
          $(b).find('div.thumb').each(function (c, d) {
            url.push(baseurl + $(d).find('a').attr('href').replace('/THUMBNUM/', '/'))
          })
        })

        $('div.mozaique').each(function (a, b) {
          $(b).find('div.thumb-under').each(function (c, d) {
            desc.push($(d).find('p.metadata').text())
            $(d).find('a').each(function (error, f) {
              title.push($(f).attr('title'))
            })
          })
        })

        for (let i = 0; i < title.length; i++) {
          results.push({ title: title[i], info: desc[i], link: url[i] })
        }

        resolve({ code: 200, status: true, result: results })
      })
      .catch((err) => reject({ code: 503, status: false, result: err }))
  })
}
