import fetch from "node-fetch"
import yts from "yt-search"

function baseApi() {
  return (global.APIs?.delirius?.url || "https://api.delirius.online").replace(/\/$/, "")
}

async function pedirYtmp3(urlVideo) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 20000)
  try {
    const res = await fetch(`${baseApi()}/download/ytmp3?url=${encodeURIComponent(urlVideo)}`, {
      signal: ctrl.signal,
      headers: { accept: "application/json", "user-agent": "Mozilla/5.0" }
    })
    const json = await res.json()
    const datos = json?.status ? json.data : null
    const url = typeof datos?.download === "string" ? datos.download : datos?.download?.url
    if (!url) return null
    return { datos, url }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
function nombreAutor(autor) {
  if (!autor) return "Desconocido"
  if (typeof autor === "string") return autor.trim() || "Desconocido"
  return autor.name || autor.channel || "Desconocido"
}

function tipoAudio(formato) {
  const f = String(formato || "").toLowerCase()
  if (f.includes("webm")) return { mime: "audio/webm", ext: "webm" }
  if (f.includes("mp4") || f.includes("m4a") || f.includes("aac")) return { mime: "audio/mp4", ext: "m4a" }
  return { mime: "audio/mpeg", ext: "mp3" }
}

const handler = async (m, { conn, text, usedPrefix }) => {
  if (!text?.trim()) {
    return conn.sendMessage(m.chat, {
      text: `[❗] Uso incorrecto.\n> *Ejemplo:* ${usedPrefix}play2 <canción o link>`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  try {
    const enlace = (String(text).match(/https?:\/\/(?:www\.|m\.|music\.)?(?:youtube\.com\/\S+|youtu\.be\/\S+)/i) || [""])[0]
    let videoUrl = enlace
    let titulo = "audio"
    let autor = "Desconocido"
    let duracion = "—"
    let portada = ""

    if (!videoUrl) {
      const busqueda = await yts(text).catch(() => null)
      const video = busqueda?.videos?.[0]
      if (!video?.url) {
        return conn.sendMessage(m.chat, {
          text: `[❗] No se encontró resultados para: ${text}`,
          contextInfo: { ...rcanal.contextInfo }
        }, { quoted: m })
      }
      videoUrl = video.url
      titulo = video.title || titulo
      autor = nombreAutor(video.author)
      duracion = video.timestamp || duracion
      portada = video.thumbnail || video.image || ""
    }

    const audio = await pedirYtmp3(videoUrl)
    if (!audio?.url) {
      return conn.sendMessage(m.chat, {
        text: `[❌] No se pudo descargar el audio.`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    titulo = audio.datos.title || titulo
    if (audio.datos.author || audio.datos.channel) {
      autor = nombreAutor(audio.datos.author || audio.datos.channel)
    }
    duracion = audio.datos.duration || audio.datos.timestamp || duracion
    portada = audio.datos.image || audio.datos.thumbnail || portada

    let miniatura
    if (portada) {
      try {
        miniatura = (await conn.getFile(portada)).data
      } catch {}
    }

    const archivo = tipoAudio(audio.datos.format)

    await conn.sendMessage(m.chat, {
      audio: { url: audio.url },
      mimetype: archivo.mime,
      fileName: `${titulo}.${archivo.ext}`,
      ptt: false,
      contextInfo: {
        externalAdReply: {
          title: `ִֶָ☾. 𝐓𝐢𝐭𝐮𝐥𝐨: ${titulo}`,
          body: `ִֶָ☾. 𝐀𝐮𝐭𝐨𝐫: ${autor} | 𝐃𝐮𝐫𝐚𝐜𝐢𝐨́𝐧: ${duracion}`,
          thumbnail: miniatura,
          mediaType: 1,
          renderLargerThumbnail: true,
          sourceUrl: videoUrl
        }
      }
    }, { quoted: m })
  } catch (e) {
    console.error("Error en play2:", e)
    await conn.sendMessage(m.chat, {
      text: `[❌] *Error:* ${e.message || e}`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }
}

handler.command = ["play2", "music2", "song2", "audio2"]
handler.tags = ["musica", "audio", "entretenimiento"]
handler.help = ["play2 <canción> - Reproducir música desde YouTube"]
handler.group = true

export default handler
