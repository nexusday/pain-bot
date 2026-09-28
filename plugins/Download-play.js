import fetch from "node-fetch"
import yts from "yt-search"
import fs from "fs"
import path from "path"
import crypto from "crypto"
import { execFile } from "child_process"
import { promisify } from "util"

const execFileAsync = promisify(execFile)

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

const API_IZUKA = "https://my.izuka-api.xyz/api/downloader/yt-dl"

function enlaceAudio(datos, usarIzuka) {
  if (!datos) return ""
  if (usarIzuka) {
    if (typeof datos.downloadUrl === "string") return datos.downloadUrl
    if (typeof datos.download_url === "string") return datos.download_url
    return ""
  }
  if (typeof datos.download === "string") return datos.download
  return datos.download?.url || ""
}

function audioDeEnlace(url) {
  const mime = decodeURIComponent((String(url).match(/[?&]mime=([^&]+)/i) || [])[1] || "")
  if (/webm/i.test(mime)) return { mime: "audio/webm", ext: "webm" }
  if (/mp4|m4a|aac/i.test(mime)) return { mime: "audio/mp4", ext: "m4a" }
  return { mime: "audio/mpeg", ext: "mp3" }
}

async function mp3DesdeEnlace(url) {
  const dir = path.join(process.cwd(), "tmp")
  fs.mkdirSync(dir, { recursive: true })
  const salida = path.join(dir, `play_${crypto.randomBytes(6).toString("hex")}.mp3`)
  try {
    await execFileAsync("ffmpeg", [
      "-y",
      "-user_agent", "Mozilla/5.0",
      "-i", url,
      "-vn", "-map_metadata", "-1",
      "-ac", "2", "-ar", "44100",
      "-c:a", "libmp3lame", "-b:a", "128k",
      salida
    ], { timeout: 120000 })
    const mp3 = fs.readFileSync(salida)
    if (mp3.length < 1000 || mp3.slice(0, 3).toString() !== "ID3") {
      throw new Error("no se pudo obtener el audio")
    }
    return mp3
  } finally {
    fs.rmSync(salida, { force: true })
  }
}

async function bajarPorPartes(url) {
  const headersBase = { "user-agent": "Mozilla/5.0", accept: "*/*" }
  async function pedir(rango) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 20000)
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { ...headersBase, range: rango }
      })
      if (!(res.ok || res.status === 206)) throw new Error("no se pudo bajar el audio")
      const buf = Buffer.from(await res.arrayBuffer())
      const total = Number((res.headers.get("content-range") || "").split("/")[1]) || buf.length
      return { buf, total }
    } finally {
      clearTimeout(timer)
    }
  }

  const cabeza = await pedir("bytes=0-1")
  const total = cabeza.total
  if (!total || total < 1000) throw new Error("no se pudo obtener el audio")
  if (total > 16 * 1024 * 1024) throw new Error("el audio pesa demasiado")

  const trozos = []
  const paso = 1024 * 1024
  for (let inicio = 0; inicio < total; inicio += paso) {
    const fin = Math.min(total - 1, inicio + paso - 1)
    const parte = await pedir(`bytes=${inicio}-${fin}`)
    trozos.push(parte.buf)
  }
  const audio = Buffer.concat(trozos)
  if (audio.length < 1000 || pareceHtml(audio.slice(0, 20).toString("utf8"))) {
    throw new Error("no se pudo obtener el audio")
  }
  return audio
}

function idDeYoutube(url) {
  return String(url || "").match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([A-Za-z0-9_-]{11})/)?.[1] || null
}

async function convertirAMp3(buffer) {
  const dir = path.join(process.cwd(), "tmp")
  fs.mkdirSync(dir, { recursive: true })
  const id = crypto.randomBytes(6).toString("hex")
  const entrada = path.join(dir, `play_${id}.bin`)
  const salida = path.join(dir, `play_${id}.mp3`)
  try {
    fs.writeFileSync(entrada, buffer)
    await execFileAsync("ffmpeg", [
      "-y", "-i", entrada, "-vn", "-map_metadata", "-1",
      "-ac", "2", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "128k", salida
    ], { timeout: 120000 })
    const mp3 = fs.readFileSync(salida)
    if (!mp3.length) throw new Error("no se pudo obtener el audio")
    return mp3
  } finally {
    fs.rmSync(entrada, { force: true })
    fs.rmSync(salida, { force: true })
  }
}

async function bajarUrl(url) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 60000)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "user-agent": "Mozilla/5.0", accept: "*/*" }
    })
    if (!res.ok) throw new Error("no se pudo bajar el audio")
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length < 1000 || pareceHtml(buf.slice(0, 20).toString("utf8"))) {
      throw new Error("no se pudo obtener el audio")
    }
    return buf
  } finally {
    clearTimeout(timer)
  }
}

async function audioPorConversor(urlVideo) {
  const videoId = idDeYoutube(urlVideo)
  if (!videoId) return null
  const headers = {
    "user-agent": "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
    referer: "https://id.ytmp3.mobi/",
    accept: "application/json"
  }
  const initUrl = `https://d.ymcdn.org/api/v1/init?p=y&23=1llum1n471&_=${Math.random()}`
  const initRes = await fetch(initUrl, { headers })
  const init = await initRes.json().catch(() => null)
  if (!init?.convertURL) return null

  const convertRes = await fetch(`${init.convertURL}${init.convertURL.includes("?") ? "&" : "?"}v=${videoId}&f=mp3&_=${Math.random()}`, { headers })
  const convert = await convertRes.json().catch(() => null)
  if (!convert?.progressURL || !convert?.downloadURL) return null

  let progreso = 0
  for (let i = 0; i < 20 && progreso < 3; i++) {
    const estadoRes = await fetch(convert.progressURL, { headers })
    const estado = await estadoRes.json().catch(() => null)
    if ((estado?.error || 0) > 0) return null
    progreso = Number(estado?.progress || 0)
    if (progreso < 3) await espera(250)
  }
  if (progreso < 3) return null

  const crudo = await bajarUrl(convert.downloadURL)
  return convertirAMp3(crudo)
}

async function pedirAudio(urlVideo, usarIzuka) {
  for (let intento = 0; intento < 2; intento++) {
    const json = usarIzuka
      ? await pedirJson(`${API_IZUKA}?url=${encodeURIComponent(urlVideo)}&type=audio`)
      : await pedirJson(`${baseApi()}/download/ytmp3?url=${encodeURIComponent(urlVideo)}`)
    const datos = json?.status ? (usarIzuka ? json.result : json.data) : null
    const urlAudio = enlaceAudio(datos, usarIzuka)
    if (!urlAudio || pareceHtml(urlAudio)) continue
    if (usarIzuka || /googlevideo\.com/i.test(urlAudio) || await urlEsAudio(urlAudio)) {
      return { datos, urlAudio }
    }
  }
  return null
}

const handler = async (m, { conn, text, usedPrefix, command }) => {
  try {
    if (!text?.trim())
      return conn.sendMessage(m.chat, {
        text: `[❗] Falta la canción o el enlace.\n\n> *Ejemplo:* ${usedPrefix}play <nombre o link>`,
        contextInfo: { ...rcanal?.contextInfo }
      }, { quoted: m })

    const citado = m.mtype === 'interactiveResponseMessage' ? null : m
    const enlace = (String(text).match(/https?:\/\/(?:www\.|m\.|music\.)?(?:youtube\.com\/\S+|youtu\.be\/\S+)/i) || [''])[0]
    let urlVideo
    let titulo = "Desconocido"
    let autor = { name: "Desconocido" }
    let duracion = "Desconocido"
    let urlMiniatura

    if (enlace) {
      urlVideo = enlace
    } else if (/^\d+$/.test(text.trim())) {
      const indice = parseInt(text.trim(), 10) - 1
      const cacheBusqueda = global.lastYtSearch?.[m.sender]
      if (!cacheBusqueda?.results?.length || Date.now() - cacheBusqueda.at > 10 * 60 * 1000) {
        throw `[❗] No hay búsqueda reciente. Usa primero *${usedPrefix}yt <texto>*`
      }
      if (indice < 0 || indice >= cacheBusqueda.results.length) {
        throw `[❗] Elige un número del 1 al ${cacheBusqueda.results.length}.`
      }
      const elegido = cacheBusqueda.results[indice]
      urlVideo = elegido.url
      titulo = elegido.title || titulo
      autor = { name: elegido.author || 'Desconocido' }
      duracion = elegido.duration || duracion
      urlMiniatura = elegido.image
    } else {
      const encontrado = await buscarCancion(text)
      if (!encontrado) throw "sin resultados"
      urlVideo = encontrado.url
      titulo = encontrado.titulo || titulo
      autor = encontrado.autor || autor
      duracion = encontrado.duracion || duracion
      urlMiniatura = encontrado.portada
    }

    const usarIzuka = command !== "play3"
    const audio = await pedirAudio(urlVideo, usarIzuka)
    if (!audio?.urlAudio) throw "no se pudo obtener el audio"

    const datosInfo = audio.datos
    const urlAudio = audio.urlAudio
    const portada = datosInfo.thumbnail || datosInfo.image || urlMiniatura
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
        await conn.sendMessage(m.chat, { image: miniatura, caption: informacion, contextInfo: { ...rcanal?.contextInfo } }, { quoted: citado })
        envioPortada = true
      } catch {}
    }
    if (!envioPortada) {
      await conn.sendMessage(m.chat, { text: informacion, contextInfo: { ...rcanal?.contextInfo } }, { quoted: citado })
    }

   
    let bufferAudio = null
    if (usarIzuka || /googlevideo\.com/i.test(urlAudio)) {
      try {
        bufferAudio = await mp3DesdeEnlace(urlAudio)
      } catch (errorAudio) {
        console.error("[play] ffmpeg:", errorAudio?.message || errorAudio)
        bufferAudio = await audioPorConversor(urlVideo).catch(() => null)
      }
      if (!bufferAudio?.length) throw "no se pudo obtener el audio"
      await conn.sendMessage(m.chat, {
        audio: bufferAudio,
        mimetype: "audio/mpeg",
        ptt: false,
        fileName: `${titulo}.mp3`
      }, { quoted: citado })
    } else {
      await conn.sendMessage(m.chat, {
        audio: { url: urlAudio },
        mimetype: "audio/mpeg",
        ptt: false,
        fileName: `${titulo}.mp3`
      }, { quoted: citado })
    }

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

handler.command = ["play", "ytmp3", "playaudio", "play3"]
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