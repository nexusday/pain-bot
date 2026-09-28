import fetch from "node-fetch"
import yts from "yt-search"
import { toAudio } from "../lib/converter.js"

const API_NEXUS = "https://nexus-light-7uyb.onrender.com/download/ytmp3"

function nombreAutor(autor) {
  if (!autor) return "—"
  if (typeof autor === "string") return autor.trim() || "—"
  return autor.name || autor.channel || "—"
}

function espera(ms) {
  return new Promise((resolver) => setTimeout(resolver, ms))
}

function pareceHtml(texto) {
  const limpio = String(texto || "").trim()
  return !limpio || limpio[0] === "<" || /^<!doctype/i.test(limpio)
}

async function pedirJson(url, topeMs = 20000) {
  for (let intento = 0; intento < 2; intento++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), topeMs)
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
        await espera(1200 * (intento + 1))
        continue
      }
      return JSON.parse(texto)
    } catch {
      await espera(1200 * (intento + 1))
    } finally {
      clearTimeout(timer)
    }
  }
  return null
}

async function buscarCancion(text) {
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

function segundosDeTexto(texto) {
  const partes = String(texto || "").trim().split(":").map((n) => Number(n))
  if (!partes.length || partes.some((n) => !Number.isFinite(n))) return 0
  if (partes.length === 2) return partes[0] * 60 + partes[1]
  if (partes.length === 3) return partes[0] * 3600 + partes[1] * 60 + partes[2]
  return 0
}

async function pedirAudio(urlVideo) {
  const json = await pedirJson(`${API_NEXUS}?url=${encodeURIComponent(urlVideo)}`, 55000)
  const datos = json?.status ? json.data : null
  const urlAudio = typeof datos?.dl_url === "string" ? datos.dl_url : ""
  if (!urlAudio || pareceHtml(urlAudio)) return null
  return { datos, urlAudio }
}

function esMp3(buffer) {
  if (!buffer || buffer.length < 1000) return false
  if (buffer.subarray(0, 3).toString("latin1") === "ID3") return true
  return buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0
}

async function segundosDelArchivo(buffer) {
  try {
    const mm = await import("music-metadata")
    const meta = await mm.parseBuffer(buffer)
    const segundos = Math.round(Number(meta?.format?.duration) || 0)
    return segundos > 0 ? segundos : 0
  } catch {
    return 0
  }
}

function textoDuracion(segundos) {
  const total = Math.max(0, Math.floor(segundos))
  const horas = Math.floor(total / 3600)
  const minutos = Math.floor((total % 3600) / 60)
  const resto = total % 60
  const mm = String(minutos).padStart(horas ? 2 : 1, "0")
  const ss = String(resto).padStart(2, "0")
  return horas ? `${horas}:${mm}:${ss}` : `${minutos}:${ss}`
}

async function cuerpo(res) {
  if (typeof res.arrayBuffer === "function") return Buffer.from(await res.arrayBuffer())
  return res.buffer()
}

async function bajarMp3(url) {
  for (let intento = 0; intento < 3; intento++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 90000)
    try {
      const opciones = {
        signal: ctrl.signal,
        redirect: "follow",
        headers: {
          accept: "*/*",
          "user-agent": "Mozilla/5.0",
          referer: "https://www.youtube.com/"
        }
      }
      let res = typeof globalThis.fetch === "function"
        ? await globalThis.fetch(url, opciones).catch(() => null)
        : null
      if (!res?.ok) res = await fetch(url, opciones)
      if (!res?.ok) {
        await espera(1200 * (intento + 1))
        continue
      }
      const buffer = await cuerpo(res)
      if (esMp3(buffer)) return buffer
    } catch {}
    finally {
      clearTimeout(timer)
    }
    await espera(1200 * (intento + 1))
  }
  return null
}

const handler = async (m, { conn, text, usedPrefix }) => {
  try {
    if (!text?.trim()) {
      return conn.sendMessage(m.chat, {
        text: `[❗] Falta la canción o el enlace.\n\n> *Ejemplo:* ${usedPrefix}play3 <nombre o link>`,
        contextInfo: { ...rcanal?.contextInfo }
      }, { quoted: m })
    }

    const citado = m.mtype === "interactiveResponseMessage" ? null : m
    const enlace = (String(text).match(/https?:\/\/(?:www\.|m\.|music\.)?(?:youtube\.com\/\S+|youtu\.be\/\S+)/i) || [""])[0]
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
      autor = { name: elegido.author || "Desconocido" }
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

    let audio = await pedirAudio(urlVideo)
    if (!audio?.urlAudio) throw "no se pudo obtener el audio"
    let archivo = await bajarMp3(audio.urlAudio)
    if (!archivo) {
      audio = await pedirAudio(urlVideo)
      archivo = audio?.urlAudio ? await bajarMp3(audio.urlAudio) : null
    }
    if (!archivo) throw "no se pudo obtener el audio"

    const segundos = segundosDeTexto(duracion) || await segundosDelArchivo(archivo)
    if (segundos > 0) duracion = textoDuracion(segundos)

    const datosInfo = audio.datos
    titulo = datosInfo.title || titulo
    autor = datosInfo.author || autor
    const portada = datosInfo.thumbnail || urlMiniatura
    const canal = nombreAutor(autor)
    const informacion = `
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *${titulo || "audio"}*
╰─ ✧  ✩
┊ canal  ·  \`${canal}\`
┊ duración  ·  \`${duracion || "—"}\`
┊ \`${urlVideo || "—"}\`
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

    let convertido
    let audioEnvio = archivo
    let tipoAudio = "audio/mpeg"
    try {
      convertido = await toAudio(archivo, "mp3")
      audioEnvio = convertido.data
      tipoAudio = "audio/ogg; codecs=opus"
    } catch {}
    await conn.sendMessage(
      m.chat,
      {
        audio: audioEnvio,
        fileName: `${titulo}.mp3`,
        mimetype: tipoAudio,
        ptt: false,
        ...(segundos > 0 ? { seconds: segundos } : {})
      },
      { quoted: citado }
    )
    await convertido?.delete?.().catch(() => {})
  } catch (e) {
    const crudo = typeof e === "string" ? e : (e?.message || "no se pudo descargar")
    const detalle = /DOCTYPE|Unexpected token|not valid JSON|is not valid JSON|aborted/i.test(crudo)
      ? "no se pudo obtener el audio"
      : crudo
    return conn.sendMessage(m.chat, {
      text: `[❌] ${detalle}\n\n> *Ejemplo:* ${usedPrefix}play3 <nombre o link>`,
      contextInfo: { ...rcanal?.contextInfo }
    }, { quoted: m })
  }
}

handler.command = ["play3"]
handler.tags = ["descargas"]
handler.group = true

export default handler
