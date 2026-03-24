import fetch from "node-fetch"

const handler = async (m, { conn, text, usedPrefix }) => {
  try {
    if (!text?.trim())
      return conn.sendMessage(m.chat, {
        text: " ִֶָ☾. Ingresa el nombre o enlace de YouTube.",
        contextInfo: { ...rcanal?.contextInfo }
      }, { quoted: m })

    const isUrl = /youtu\.be|youtube\.com/.test(text)
    let videoUrl
    let title = "Desconocido"
    let author = { name: "Desconocido" }
    let duration = "Desconocido"
    let thumbUrl

    if (isUrl) {
      videoUrl = text.trim()
    } else {
      
      const searchUrl = `https://api.delirius.store/search/ytsearch?q=${encodeURIComponent(text)}`
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

    
    const downloadApi = `https://api.delirius.store/download/ytmp3?url=${encodeURIComponent(videoUrl)}`
    const dres = await fetch(downloadApi).then(r => r.json())
    if (!dres?.status || !dres.data)
      throw "[❗] No se pudo obtener el audio desde la URL."

    const infoData = dres.data
    const audioUrl = typeof infoData.download === "string" ? infoData.download : infoData.download?.url
    const cover = infoData.image || thumbUrl
    title = infoData.title || title

    if (!audioUrl)
      throw "[❗] No se encontró la URL del audio."

    const info = `ִֶָ☾. 𝗣𝗹𝗮𝘆 ִֶָ☾.
 𓍯  *Título:* ${title}
 𓍯  *Canal:* ${author.name || author}
 𓍯  *Duración:* ${duration}
 𓍯  *Enlace:* ${videoUrl}`

    
    if (cover) {
      try {
        const thumb = (await conn.getFile(cover)).data
        await conn.sendMessage(m.chat, { image: thumb, caption: info, contextInfo: { ...rcanal?.contextInfo } }, { quoted: m })
      } catch (e) {
       
      }
    } else {
      await conn.sendMessage(m.chat, { text: info, contextInfo: { ...rcanal?.contextInfo } }, { quoted: m })
    }

   
    await conn.sendMessage(
      m.chat,
      { audio: { url: audioUrl }, fileName: `${title}.mp3`, mimetype: "audio/mpeg" },
      { quoted: m }
    )

  } catch (e) {
    return conn.sendMessage(m.chat, {
      text: typeof e === "string"
        ? e
        : `[❌] Se ha producido un problema.\n> Usa *${usedPrefix}report* para informarlo.\n\n${e.message}`,
      contextInfo: { ...rcanal?.contextInfo }
    }, { quoted: m })
  }
}

handler.command = ["play", "ytmp3", "playaudio"]
handler.tags = ["descargas"]
handler.group = true

export default handler

function formatViews(views) {
  if (views === undefined) return "No disponible"
  if (views >= 1_000_000_000) return `${(views / 1_000_000_000).toFixed(1)}B (${views.toLocaleString()})`
  if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M (${views.toLocaleString()})`
  if (views >= 1_000) return `${(views / 1_000).toFixed(1)}k (${views.toLocaleString()})`
  return views.toString()
}