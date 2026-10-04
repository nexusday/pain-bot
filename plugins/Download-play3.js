import fetch from "node-fetch"
import yts from "yt-search"

const API = "https://api-abztech.zone.id"

function espera(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function pareceHtml(texto) {
  const limpio = String(texto || "").trim()
  return !limpio || limpio.startsWith("<") || /^<!doctype/i.test(limpio)
}

async function pedirJson(url, { timeoutMs = 15000, intentos = 2 } = {}) {
  for (let intento = 0; intento < intentos; intento++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          accept: "application/json",
          "user-agent": "Mozilla/5.0"
        }
      })

      const texto = await res.text()

      if (pareceHtml(texto)) {
        if (intento + 1 < intentos) {
          await espera(1000 * (intento + 1))
          continue
        }
        return null
      }

      return JSON.parse(texto)

    } catch {
      if (intento + 1 < intentos) {
        await espera(1000 * (intento + 1))
      }
    } finally {
      clearTimeout(timer)
    }
  }

  return null
}

async function buscarYouTube(texto) {
  const resultado = await yts(texto).catch(() => null)
  const video = resultado?.videos?.[0]

  if (!video?.url) return null

  return {
    url: video.url,
    titulo: video.title || "Desconocido",
    autor: video.author?.name || "Desconocido",
    duracion: video.timestamp || "Desconocido",
    thumbnail: video.thumbnail || null
  }
}

async function descargarAudio(urlVideo) {
  const endpoint = new URL(`${API}/download/ytmp3`)
  endpoint.searchParams.set("url", urlVideo)

  const json = await pedirJson(endpoint.toString(), {
    timeoutMs: 20000,
    intentos: 2
  })

  if (!json?.status || !json?.download) {
    return null
  }

  const descarga = json.download

  if (
    typeof descarga.downloadUrl !== "string" ||
    !descarga.downloadUrl.startsWith("http")
  ) {
    return null
  }

  return descarga
}

const handler = async (m, { conn, text, usedPrefix }) => {
  try {
    if (!text?.trim()) {
      return conn.sendMessage(
        m.chat,
        {
          text:
            `[❗] Falta la canción.\n\n` +
            `> *Ejemplo:* ${usedPrefix}play3 HUMBE - fantasmas`,
          contextInfo: { ...rcanal?.contextInfo }
        },
        { quoted: m }
      )
    }

    const consulta = text.trim()

    /*
     * Si el usuario pone directamente un enlace de YouTube,
     * usamos ese enlace.
     *
     * Si pone un nombre, yt-search obtiene la URL.
     */
    const enlace =
      consulta.match(
        /https?:\/\/(?:www\.|m\.|music\.)?(?:youtube\.com\/\S+|youtu\.be\/\S+)/i
      )?.[0] || null

    let video

    if (enlace) {
      video = {
        url: enlace,
        titulo: "YouTube",
        autor: "Desconocido",
        duracion: "Desconocido",
        thumbnail: null
      }
    } else {
      video = await buscarYouTube(consulta)

      if (!video) {
        throw "No encontré resultados para esa búsqueda."
      }
    }

    /*
     * ABZTech:
     * /download/ytmp3?url=URL_DE_YOUTUBE
     */
    const audio = await descargarAudio(video.url)

    if (!audio?.downloadUrl) {
      throw "No se pudo obtener el audio."
    }

    const titulo = audio.title || video.titulo || "audio"
    const thumbnail = audio.thumbnail || video.thumbnail
    const duracion = audio.duration || video.duracion || "Desconocido"

    const informacion = `
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *${titulo}*
╰─ ✧  ✩
┊ duración  ·  \`${duracion}\`
┊ formato    ·  \`MP3\`
╰─────────`.trim()

    /*
     * Enviar portada primero
     */
    let envioPortada = false

    if (thumbnail) {
      try {
        const miniatura = (await conn.getFile(thumbnail)).data

        await conn.sendMessage(
          m.chat,
          {
            image: miniatura,
            caption: informacion,
            contextInfo: { ...rcanal?.contextInfo }
          },
          { quoted: m }
        )

        envioPortada = true
      } catch {}
    }

    if (!envioPortada) {
      await conn.sendMessage(
        m.chat,
        {
          text: informacion,
          contextInfo: { ...rcanal?.contextInfo }
        },
        { quoted: m }
      )
    }

    /*
     * Enviar MP3 directamente desde la URL de descarga
     */
    await conn.sendMessage(
      m.chat,
      {
        audio: {
          url: audio.downloadUrl
        },
        fileName: `${titulo.replace(/[\\/:*?"<>|]/g, "")}.mp3`,
        mimetype: "audio/mpeg"
      },
      { quoted: m }
    )

  } catch (e) {
    const error =
      typeof e === "string"
        ? e
        : e?.message || "No se pudo descargar el audio."

    return conn.sendMessage(
      m.chat,
      {
        text:
          `[❌] ${error}\n\n` +
          `> *Ejemplo:* ${usedPrefix}play3 HUMBE - fantasmas`,
        contextInfo: { ...rcanal?.contextInfo }
      },
      { quoted: m }
    )
  }
}

handler.command = ["play3"]
handler.tags = ["descargas"]
handler.help = ["play3 <canción>"]
handler.group = true

export default handler