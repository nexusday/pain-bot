import fetch from "node-fetch"

const handler = async (m, { conn, text, usedPrefix }) => {
  try {
    if (!text?.trim())
      return conn.sendMessage(m.chat, {
        text: " ִֶָ☾. Ingresa el nombre o enlace de YouTube.",
        contextInfo: { ...rcanal?.contextInfo }
      }, { quoted: m })

    const esUrl = /youtu\.be|youtube\.com/.test(text)
    let urlVideo
    let titulo = "Desconocido"
    let autor = { name: "Desconocido" }
    let duracion = "Desconocido"
    let urlMiniatura

    if (esUrl) {
      urlVideo = text.trim()
    } else {
      
      const urlBusqueda = `https://api.delirius.online/search/ytsearch?q=${encodeURIComponent(text)}`
      const resBusqueda = await fetch(urlBusqueda).then(r => r.json())
      if (!resBusqueda?.status || !Array.isArray(resBusqueda.data) || resBusqueda.data.length === 0)
        throw "[❗] No se encontraron resultados para la búsqueda."
      const primero = resBusqueda.data[0]
      urlVideo = primero.url || `https://youtu.be/${primero.videoId}`
      titulo = primero.title || titulo
      autor = primero.author || autor
      duracion = primero.duration || duracion
      urlMiniatura = primero.image || primero.thumbnail
    }

    
    const apiDescarga = `https://api.delirius.online/download/ytmp3?url=${encodeURIComponent(urlVideo)}`
    const resDescarga = await fetch(apiDescarga).then(r => r.json())
    if (!resDescarga?.status || !resDescarga.data)
      throw "[❗] No se pudo obtener el audio desde la URL."

    const datosInfo = resDescarga.data
    const urlAudio = typeof datosInfo.download === "string" ? datosInfo.download : datosInfo.download?.url
    const portada = datosInfo.image || urlMiniatura
    titulo = datosInfo.title || titulo

    if (!urlAudio)
      throw "[❗] No se encontró la URL del audio."

    const informacion = `ִֶָ☾. 𝗣𝗹𝗮𝘆 ִֶָ☾.
 𓍯  *Título:* ${titulo}
 𓍯  *Canal:* ${autor.name || autor}
 𓍯  *Duración:* ${duracion}
 𓍯  *Enlace:* ${urlVideo}`

    
    if (portada) {
      try {
        const miniatura = (await conn.getFile(portada)).data
        await conn.sendMessage(m.chat, { image: miniatura, caption: informacion, contextInfo: { ...rcanal?.contextInfo } }, { quoted: m })
      } catch (e) {
       
      }
    } else {
      await conn.sendMessage(m.chat, { text: informacion, contextInfo: { ...rcanal?.contextInfo } }, { quoted: m })
    }

   
    await conn.sendMessage(
      m.chat,
      { audio: { url: urlAudio }, fileName: `${titulo}.mp3`, mimetype: "audio/mpeg" },
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

function formatearVistas(views) {
  if (views === undefined) return "No disponible"
  if (views >= 1_000_000_000) return `${(views / 1_000_000_000).toFixed(1)}B (${views.toLocaleString()})`
  if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M (${views.toLocaleString()})`
  if (views >= 1_000) return `${(views / 1_000).toFixed(1)}k (${views.toLocaleString()})`
  return views.toString()
}