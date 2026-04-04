import fetch from "node-fetch"

const handler = async (m, { conn, text, usedPrefix }) => {
  try {
    if (!text?.trim())
      return conn.sendMessage(m.chat, {
        text: " ִֶָ☾. Ingresa el nombre o enlace de YouTube.",
        contextInfo: { ...rcanal?.contextInfo }
      }, { quoted: m })

    
    let format = "360"
    let query = text.trim()
    const fm = query.match(/(.+)\s+\|?\s*(\d{3,4})$/)
    if (fm) {
      query = fm[1].trim()
      format = fm[2]
    }

    const isUrl = /youtu\.be|youtube\.com/.test(query)
    let videoUrl
    let title = "Desconocido"
    let author = { name: "Desconocido" }
    let duration = "Desconocido"
    let thumbUrl

    if (isUrl) {
      videoUrl = query
    } else {
      const searchUrl = `https://api.delirius.store/search/ytsearch?q=${encodeURIComponent(query)}`
      const sres = await fetch(searchUrl).then(r => r.json())
      if (!sres?.status || !Array.isArray(sres.data) || sres.data.length === 0)
        throw "[❗] No se encontraron resultados para la búsqueda."
      const first = sres.data[0]
      videoUrl = first.url || `https://youtu.be/${first.videoId}`
      title = first.title || title
      author = first.author || author
      duration = first.duration || duration
      thumbUrl = first.image || first.thumbnail
    }

    const downloadApi = `https://api.delirius.store/download/ytmp4?url=${encodeURIComponent(videoUrl)}&format=${encodeURIComponent(format)}`
    const dres = await fetch(downloadApi).then(r => r.json())
    if (!dres?.status || !dres.data)
      throw "[❗] No se pudo obtener el video desde la URL."

    const infoData = dres.data
    const videoDownload = typeof infoData.download === "string" ? infoData.download : infoData.download?.url
    const cover = infoData.image || thumbUrl
    title = infoData.title || title

    if (!videoDownload)
      throw "[❗] No se encontró la URL del video."

    const info = `ִֶָ☾. 𝗩𝗶𝗱𝗲𝗼 ִֶָ☾.\n 𓍯  *Título:* ${title}\n 𓍯  *Canal:* ${author.name || author}\n 𓍯  *Duración:* ${duration}\n 𓍯  *Formato:* ${infoData.format || format}\n 𓍯  *Enlace:* ${videoUrl}`

  
    await conn.sendMessage(
      m.chat,
      { video: { url: videoDownload }, caption: info, fileName: `${title}.mp4`, mimetype: "video/mp4" },
      { quoted: m }
    )

  } catch (e) {
    return conn.sendMessage(m.chat, {
      text: typeof e === "string"
        ? e
        : `[❌] Se ha producido un problema.\\n> Usa *${usedPrefix}report* para informarlo.\\n\\n${e.message}`,
      contextInfo: { ...rcanal?.contextInfo }
    }, { quoted: m })
  }
}

handler.command = ["download", "downloadvideo", "ytmp4", "video"]
handler.tags = ["descargas"]
handler.group = true

export default handler
