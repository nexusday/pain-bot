import fetch from "node-fetch"
import cheerio from "cheerio"
import { JSDOM } from "jsdom"

const handler = async (m, { conn, text, usedPrefix }) => {
  if (!text) {
    return conn.sendMessage(m.chat, {
      text: `[?] Uso incorrecto\n> *Uso:* ${usedPrefix}hentai <b¨²squeda | url>`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  conn.hentai = conn.hentai || {}
  const isUrl = text.includes('https://veohentai.com/ver/')

  try {
   
    if (isUrl) {
      const videoInfo = await getInfo(text)
      if (!videoInfo) {
        return conn.sendMessage(m.chat, {
          text: `[?] Error con la URL`,
          contextInfo: { ...rcanal.contextInfo }
        }, { quoted: m })
      }

      const peso = await size(videoInfo.videoUrl)

      const cap = `? HENTAI DOWNLOAD ?

> *T¨ªtulo:* ${videoInfo.title}
> *Vistas:* ${videoInfo.views}
> *Likes:* ${videoInfo.likes}
> *Dislikes:* ${videoInfo.dislikes}
> *Peso:* ${peso}
> *Link:* ${text}`

      return await conn.sendMessage(m.chat, {
        video: { url: videoInfo.videoUrl },
        caption: cap,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    
    const results = await searchHentai(text)
    if (!results.length) {
      return conn.sendMessage(m.chat, {
        text: `[?] No se encontraron resultados.`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    const list = results.slice(0, 10).map((r, i) =>
      `*${i + 1}.*\n> *T¨ªtulo:* ${r.titulo}\n> *Link:* ${r.url}`
    ).join('\n\n')

    const caption = `? RESULTADOS ?
> *B¨²squeda:* ${text}
> *Resultados:* ${results.length}

${list}

> *Responde con un n¨²mero (1-10) para descargar*`

    const { key } = await conn.sendMessage(m.chat, {
      text: caption,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })

    conn.hentai[m.sender] = {
      result: results.slice(0, 10),
      key,
      timeout: setTimeout(() => delete conn.hentai[m.sender], 120_000)
    }

  } catch (e) {
    console.error(e)
    return conn.sendMessage(m.chat, {
      text: `[?] Error inesperado\n> ${e.message}`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }
}

handler.before = async (m, { conn }) => {
  conn.hentai = conn.hentai || {}
  const session = conn.hentai[m.sender]
  if (!session) return
  if (!m.quoted || m.quoted.id !== session.key.id) return

  const n = parseInt(m.text.trim())
  if (isNaN(n) || n < 1 || n > session.result.length) return

  clearTimeout(session.timeout)
  delete conn.hentai[m.sender]
  m.commandExecuted = true

  try {
    const link = session.result[n - 1].url
    const videoInfo = await getInfo(link)
    if (!videoInfo) throw new Error('No se pudo obtener el video')

    const peso = await size(videoInfo.videoUrl)

    const cap = `? HENTAI DOWNLOAD ?
> *T¨ªtulo:* ${videoInfo.title}
> *Vistas:* ${videoInfo.views}
> *Likes:* ${videoInfo.likes}
> *Dislikes:* ${videoInfo.dislikes}
> *Peso:* ${peso}
> *Link:* ${link}`

    await conn.sendMessage(m.chat, {
      video: { url: videoInfo.videoUrl },
      caption: cap,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })

  } catch (e) {
    console.error(e)
    await conn.sendMessage(m.chat, {
      text: `[?] Error\n> ${e.message}`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }
}

handler.command = ['hentai', 'hent', 'hentaisearch']
handler.tags = ['nsfw']
handler.help = ['hentai <b¨²squeda | url>']

export default handler



async function searchHentai(text) {
  try {
    const res = await fetch(`https://veohentai.com/?s=${encodeURIComponent(text)}`)
    const html = await res.text()
    const $ = cheerio.load(html)

    const results = []
    $(".grid a").each((_, el) => {
      const url = $(el).attr("href")
      const titulo = $(el).find("h2").text().trim()
      if (url && titulo) results.push({ titulo, url })
    })
    return results
  } catch {
    return []
  }
}

async function getInfo(url) {
  try {
    const html = await (await fetch(url)).text()
    const dom = new JSDOM(html)
    const doc = dom.window.document

    const iframe = doc.querySelector("iframe")
    if (!iframe) return null

    const iframeHtml = await (await fetch(iframe.src)).text()
    const match = iframeHtml.match(/u=([^&"]+)/)
    if (!match) return null

    return {
      videoUrl: Buffer.from(match[1], 'base64').toString(),
      title: doc.querySelector("h1")?.textContent.trim() || 'Sin t¨ªtulo',
      views: doc.querySelector("h4")?.textContent.trim() || 'N/A',
      likes: doc.querySelector("#num-like")?.textContent.trim() || '0',
      dislikes: doc.querySelector("#num-dislike")?.textContent.trim() || '0'
    }
  } catch {
    return null
  }
}

async function size(url) {
  try {
    const res = await fetch(url, { method: 'HEAD' })
    const bytes = Number(res.headers.get('content-length'))
    if (!bytes) return 'Desconocido'
    if (bytes > 1e9) return (bytes / 1e9).toFixed(2) + ' GB'
    if (bytes > 1e6) return (bytes / 1e6).toFixed(2) + ' MB'
    return (bytes / 1e3).toFixed(2) + ' KB'
  } catch {
    return 'Desconocido'
  }
}