import fetch from "node-fetch"
import yts from "yt-search"

function nombreAutor(autor) {
  if (!autor) return '—'
  if (typeof autor === 'string') return autor.trim() || '—'
  return autor.name || autor.channel || '—'
}

function baseApi() {
  return (global.APIs?.delirius?.url || "https://api.delirius.online").replace(/\/$/, "")
}

function espera(ms) {
  return new Promise((resolver) => setTimeout(resolver, ms))
}

function pareceHtml(texto) {
  const limpio = String(texto || "").trim()
  return !limpio || limpio[0] === "<" || /^<!doctype/i.test(limpio)
}

async function pedirJson(url) {
  for (let intento = 0; intento < 3; intento++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 20000)
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          accept: "application/json",
          "user-agent": "Mozilla/5.0"
        }
      })
      const texto = await res.text()
      if (pareceHtml(texto)) {
        await espera(800 * (intento + 1))
        continue
      }
      return JSON.parse(texto)
    } catch {
      await espera(800 * (intento + 1))
    } finally {
      clearTimeout(timer)
    }
  }
  return null
}

async function buscarCancion(text) {
  const json = await pedirJson(`${baseApi()}/search/ytsearch?q=${encodeURIComponent(text)}`)
  const primero = json?.status && Array.isArray(json.data) ? json.data[0] : null
  if (primero?.url || primero?.videoId) {
    return {
      url: primero.url || `https://youtu.be/${primero.videoId}`,
      titulo: primero.title || "Desconocido",
      autor: primero.author || { name: "Desconocido" },
      duracion: primero.duration || "Desconocido",
      portada: primero.image || primero.thumbnail
    }
  }

  const busqueda = await yts(text).catch(() => null)
  const video = busqueda?.videos?.[0]
  if (!video?.url) return null
  return {
    url: video.url,
    titulo: video.title || "Desconocido",
    autor: video.author || { name: "Desconocido" },
    duracion: video.timestamp || "Desconocido",
    portada: video.thumbnail || video.image
  }
}

async function urlEsAudio(url) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 12000)
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: ctrl.signal,
      headers: { range: "bytes=0-1", "user-agent": "Mozilla/5.0" }
    })
    const tipo = res.headers.get("content-type") || ""
    if (/text\/html|text\/plain/i.test(tipo)) return false
    const trozo = Buffer.from(await res.arrayBuffer()).slice(0, 24).toString("utf8")
    if (pareceHtml(trozo)) return false
    return res.ok || res.status === 206
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

async function pedirAudio(urlVideo) {
  for (let intento = 0; intento < 2; intento++) {
    const json = await pedirJson(`${baseApi()}/download/ytmp3?url=${encodeURIComponent(urlVideo)}`)
    const datos = json?.status ? json.data : null
    const urlAudio = typeof datos?.download === "string" ? datos.download : datos?.download?.url
    if (!urlAudio || pareceHtml(urlAudio)) continue
    if (await urlEsAudio(urlAudio)) return { datos, urlAudio }
  }
  return null
}

const handler = async (m, { conn, text, usedPrefix }) => {
  try {
    if (!text?.trim())
      return conn.sendMessage(m.chat, {
        text: `[❗] Falta la canción o el enlace.\n\n> *Ejemplo:* ${usedPrefix}play <nombre o link>`,
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
      const encontrado = await buscarCancion(text)
      if (!encontrado) throw "sin resultados"
      urlVideo = encontrado.url
      titulo = encontrado.titulo || titulo
      autor = encontrado.autor || autor
      duracion = encontrado.duracion || duracion
      urlMiniatura = encontrado.portada
    }

    const audio = await pedirAudio(urlVideo)
    if (!audio?.urlAudio) throw "no se pudo obtener el audio"

    const datosInfo = audio.datos
    const urlAudio = audio.urlAudio
    const portada = datosInfo.image || urlMiniatura
    titulo = datosInfo.title || titulo
    autor = datosInfo.author || datosInfo.channel || autor
    duracion = datosInfo.duration || datosInfo.timestamp || duracion

    const canal = nombreAutor(autor)
    const informacion = `
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *${titulo || 'audio'}*
╰─ ✧  ✩
┊ canal  ·  \`${canal}\`
┊ duración  ·  \`${duracion || '—'}\`
┊ \`${urlVideo || '—'}\`
╰─────────`.trim()

    let envioPortada = false
    if (portada) {
      try {
        const miniatura = (await conn.getFile(portada)).data
        await conn.sendMessage(m.chat, { image: miniatura, caption: informacion, contextInfo: { ...rcanal?.contextInfo } }, { quoted: m })
        envioPortada = true
      } catch {}
    }
    if (!envioPortada) {
      await conn.sendMessage(m.chat, { text: informacion, contextInfo: { ...rcanal?.contextInfo } }, { quoted: m })
    }

   
    await conn.sendMessage(
      m.chat,
      { audio: { url: urlAudio }, fileName: `${titulo}.mp3`, mimetype: "audio/mpeg" },
      { quoted: m }
    )

  } catch (e) {
    const crudo = typeof e === "string" ? e : (e?.message || "no se pudo descargar")
    const detalle = /DOCTYPE|Unexpected token|not valid JSON|is not valid JSON/i.test(crudo)
      ? "no se pudo obtener el audio"
      : crudo
    return conn.sendMessage(m.chat, {
      text: `[❌] ${detalle}\n\n> *Ejemplo:* ${usedPrefix}play <nombre o link>`,
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