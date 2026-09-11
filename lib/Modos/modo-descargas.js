import fetch from 'node-fetch'
import { estaModoActivo } from './modo-utils.js'
import { downloadTikTok as downloadTikTokApi, absMedia, sanitizeTikTokUrl } from '../../plugins/tiktok-2.js'

const REGEX_TIKTOK = /(?:https?:\/\/)?(?:www\.|vm\.|vt\.|m\.|t\.)?tiktok\.com\/[^\s<>'"\]]+/i
const REGEX_IG = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:reel|reels|p|tv)\/[\w-]+/i
const REGEX_ENLACE = /(https?:\/\/[^\s<>'"\]]+|www\.[^\s<>'"\]]+)/gi
const TTL_PENDIENTE = 2 * 60 * 1000

export function estaModoDescargasActivo(chatId) {
  return estaModoActivo('modoDescargas', chatId)
}

export function esUrlTikTok(url = '') {
  return /(?:^|\/\/)(?:www\.|vm\.|vt\.|m\.|t\.)?tiktok\.com\//i.test(url)
}

export function esUrlInstagram(url = '') {
  return /instagram\.com\/(?:reel|reels|p|tv)\//i.test(url)
}

export function esUrlYouTube(url = '') {
  return /youtu\.be|youtube\.com/i.test(url)
}

export function esUrlBypassDescarga(url = '') {
  return esUrlTikTok(url) || esUrlInstagram(url) || esUrlYouTube(url)
}

export function debeOmitirAntiLinkPorDescargas(texto = '', chatId) {
  if (!estaModoDescargasActivo(chatId)) return false

  const enlaces = String(texto).match(REGEX_ENLACE) || []
  if (!enlaces.length) return false

  return enlaces.every(enlace => esUrlBypassDescarga(enlace))
}

function clavePendiente(chat, sender) {
  return `${chat}:${sender}`
}

function obtenerPendiente(chat, sender) {
  const clave = clavePendiente(chat, sender)
  const pendiente = global.pendingYtDescarga?.[clave]
  if (!pendiente) return null
  if (Date.now() - pendiente.at > TTL_PENDIENTE) {
    delete global.pendingYtDescarga[clave]
    return null
  }
  return pendiente
}

function establecerPendiente(chat, sender, datos) {
  if (!global.pendingYtDescarga) global.pendingYtDescarga = {}
  global.pendingYtDescarga[clavePendiente(chat, sender)] = { ...datos, at: Date.now() }
}

function limpiarPendiente(chat, sender) {
  delete global.pendingYtDescarga?.[clavePendiente(chat, sender)]
}

function recortarTexto(texto = '', max = 100) {
  const valor = String(texto).replace(/\s+/g, ' ').trim()
  if (!valor || valor === '-') return ''
  return valor.length > max ? `${valor.slice(0, max - 1)}…` : valor
}

function limpiarNombreArchivo(titulo = 'archivo') {
  return String(titulo)
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 80) || 'archivo'
}

function parsearEleccionYt(texto = '') {
  const valor = String(texto).trim().toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\w\sáéíóúñ]/gi, '')
    .trim()

  if (/^(mp4|video|vid|v)$/.test(valor)) return 'video'
  if (/^(mp3|musica|music|audio|play|cancion|song|m|a)$/.test(valor)) return 'audio'
  return null
}

/** Solo true si el mensaje EMPIEZA como comando (no si la URL contiene ".") */
function tienePrefijoComando(m) {
  const texto = (m.text || '').trim()
  if (!texto) return false

  const prefijo = global.prefix

  if (prefijo instanceof RegExp) {
    return prefijo.test(texto)
  }

  if (Array.isArray(prefijo)) {
    return prefijo.some(p => {
      if (p instanceof RegExp) return p.test(texto)
      return texto.startsWith(String(p))
    })
  }

  if (typeof prefijo === 'string') return texto.startsWith(prefijo)
  return false
}

function obtenerTextoEscaneo(m) {
  const partes = [
    m?.text,
    m?.body,
    m?.msg?.text,
    m?.msg?.caption,
    m?.msg?.matchedText,
    m?.msg?.canonicalUrl,
    m?.message?.extendedTextMessage?.text,
    m?.message?.extendedTextMessage?.matchedText,
    m?.message?.extendedTextMessage?.contextInfo?.externalAdReply?.sourceUrl,
    m?.message?.extendedTextMessage?.contextInfo?.externalAdReply?.originalUrl,
    m?.msg?.contextInfo?.externalAdReply?.sourceUrl,
    m?.msg?.contextInfo?.externalAdReply?.originalUrl,
    m?.msg?.contextInfo?.externalAdReply?.mediaUrl,
  ]
  return partes
    .filter(v => typeof v === 'string' && v.trim())
    .join(' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, ' ')
}

function limpiarUrlCapturada(crudo = '') {
  let url = String(crudo || '')
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '')
    .trim()
  url = url.replace(/^[\s<'"(\[]+/, '').replace(/[\s>'"\)\],]+$/g, '')
  url = url.replace(/[)\]}>.,;:!?]+$/g, '')
  if (url && !/^https?:\/\//i.test(url) && /^(www\.|vm\.|vt\.|m\.|t\.)?tiktok\.com\//i.test(url)) {
    url = `https://${url}`
  }
  if (url && !/^https?:\/\//i.test(url) && /^www\./i.test(url)) {
    url = `https://${url}`
  }
  return url
}

export function extraerObjetivoDescarga(texto = '') {
  const valor = String(texto).trim()
  if (!valor) return null

  const tiktokCrudo = valor.match(REGEX_TIKTOK)?.[0]
  if (tiktokCrudo) {
    const url = sanitizeTikTokUrl(tiktokCrudo) || limpiarUrlCapturada(tiktokCrudo)
    if (url) return { type: 'tiktok', url }
  }

  const ig = valor.match(REGEX_IG)?.[0]
  if (ig) return { type: 'instagram', url: limpiarUrlCapturada(ig) }

  const enlaces = valor.match(REGEX_ENLACE) || []
  const yt = enlaces.find(enlace => esUrlYouTube(enlace))
  if (yt) return { type: 'youtube', url: limpiarUrlCapturada(yt) }

  return null
}

async function reaccionarMsg(conn, chat, key, emoji) {
  await conn.sendMessage(chat, {
    react: { text: emoji, key }
  }).catch(() => {})
}

async function descargarInstagram(url) {
  const res = await fetch(`https://api.delirius.online/download/instagram?url=${encodeURIComponent(url)}`)
  const datos = await res.json()
  if (!datos?.status || !Array.isArray(datos.data) || !datos.data.length) return null
  return datos.data[0]
}

async function descargarYouTubeVideo(url, formato = '360p') {
  const apiDescarga = `https://api.delirius.online/download/ytmp4?url=${encodeURIComponent(url)}&format=${encodeURIComponent(formato)}`
  const dres = await fetch(apiDescarga).then(r => r.json())
  if (!dres?.status || !dres.data) return null
  return dres.data
}

async function descargarYouTubeAudio(url) {
  const apiDescarga = `https://api.delirius.online/download/ytmp3?url=${encodeURIComponent(url)}`
  const dres = await fetch(apiDescarga).then(r => r.json())
  if (!dres?.status || !dres.data) return null
  return dres.data
}

async function enviarMediaTikTok(m, conn, video, rcanal) {
  const caption = `ִֶָ☾. *TikTok auto-descarga*

> *Título:* ${video.title || 'Sin título'}
> *Autor:* ${video.author?.nickname || video.author?.unique_id || 'Desconocido'}`

  if (video.type === 'image' && Array.isArray(video.images) && video.images.length) {
    for (const img of video.images.slice(0, 4)) {
      await conn.sendMessage(m.chat, {
        image: { url: absMedia(img) || img },
        caption,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }
    return
  }

  const play = absMedia(video.play) || video.play
  if (!play) throw new Error('Sin URL de video descargable')

  await conn.sendMessage(m.chat, {
    video: { url: play },
    caption,
    contextInfo: { ...rcanal.contextInfo }
  }, { quoted: m })
}

async function enviarMediaInstagram(m, conn, media, urlOrigen, rcanal) {
  const caption = `ִֶָ☾. *Instagram auto-descarga*

> *Enlace:* ${urlOrigen}`

  if (media.type === 'video') {
    await conn.sendMessage(m.chat, {
      video: { url: media.url },
      fileName: 'instagram.mp4',
      caption,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
    return
  }

  await conn.sendMessage(m.chat, {
    image: { url: media.url },
    caption,
    contextInfo: { ...rcanal.contextInfo }
  }, { quoted: m })
}

async function enviarYouTubeVideo(m, conn, url, rcanal) {
  const datos = await descargarYouTubeVideo(url)
  if (!datos) throw new Error('No se pudo obtener el video.')

  const videoDownload = typeof datos.download === 'string' ? datos.download : datos.download?.url
  if (!videoDownload) throw new Error('No se encontró la URL del video.')

  const titulo = datos.title || 'Video'
  const canal = datos.author || datos.channel || 'Desconocido'
  const portada = datos.image
  const info = `ִֶָ☾. *YouTube auto-descarga · Video*

 𓍯  *Título:* ${recortarTexto(titulo, 90)}
 𓍯  *Canal:* ${recortarTexto(canal, 50)}
 𓍯  *Formato:* ${datos.format || '360p'}
 𓍯  *Enlace:* ${url}`

  if (portada) {
    try {
      const thumb = (await conn.getFile(portada)).data
      await conn.sendMessage(m.chat, {
        image: thumb,
        caption: info,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    } catch {}
  }

  try {
    await conn.sendMessage(m.chat, {
      video: { url: videoDownload },
      caption: info,
      fileName: `${limpiarNombreArchivo(titulo)}.mp4`,
      mimetype: 'video/mp4',
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  } catch {
    const res = await fetch(videoDownload)
    if (!res.ok) throw new Error('No se pudo descargar el MP4.')
    const buffer = Buffer.from(await res.arrayBuffer())
    await conn.sendMessage(m.chat, {
      video: buffer,
      caption: info,
      fileName: `${limpiarNombreArchivo(titulo)}.mp4`,
      mimetype: 'video/mp4',
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }
}

async function enviarYouTubeAudio(m, conn, url, rcanal) {
  const datos = await descargarYouTubeAudio(url)
  if (!datos) throw new Error('No se pudo obtener el audio.')

  const audioUrl = typeof datos.download === 'string' ? datos.download : datos.download?.url
  if (!audioUrl) throw new Error('No se encontró la URL del audio.')

  const titulo = datos.title || 'Audio'
  const canal = datos.author || datos.channel || 'Desconocido'
  const portada = datos.image
  const info = `ִֶָ☾. *YouTube auto-descarga · Música*

 𓍯  *Título:* ${recortarTexto(titulo, 90)}
 𓍯  *Canal:* ${recortarTexto(canal, 50)}
 𓍯  *Enlace:* ${url}`

  if (portada) {
    try {
      const thumb = (await conn.getFile(portada)).data
      await conn.sendMessage(m.chat, {
        image: thumb,
        caption: info,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    } catch {}
  } else {
    await conn.sendMessage(m.chat, {
      text: info,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  await conn.sendMessage(m.chat, {
    audio: { url: audioUrl },
    fileName: `${limpiarNombreArchivo(titulo)}.mp3`,
    mimetype: 'audio/mpeg',
    contextInfo: { ...rcanal.contextInfo }
  }, { quoted: m })
}

async function pedirEleccionYouTube(m, conn, url, rcanal) {
  establecerPendiente(m.chat, m.sender, { url })

  await conn.sendMessage(m.chat, {
    text: `ִֶָ☾. *YouTube detectado*

@${m.sender.split('@')[0]}, ¿deseas *MP3* o *MP4*?

 𓍯  *MP3* → solo audio (música)
 𓍯  *MP4* → video con imagen

> Responde *mp3* o *mp4* (una sola vez).`,
    contextInfo: {
      ...rcanal.contextInfo,
      mentionedJid: [m.sender]
    }
  }, { quoted: m })
}

async function manejarEleccionYouTubePendiente(m, conn, rcanal) {
  const pendiente = obtenerPendiente(m.chat, m.sender)
  if (!pendiente) return false

  const eleccion = parsearEleccionYt(m.text)
  if (!eleccion) return false

  limpiarPendiente(m.chat, m.sender)

  await reaccionarMsg(conn, m.chat, m.key, '⏳')

  try {
    if (eleccion === 'video') {
      await enviarYouTubeVideo(m, conn, pendiente.url, rcanal)
    } else {
      await enviarYouTubeAudio(m, conn, pendiente.url, rcanal)
    }
    await reaccionarMsg(conn, m.chat, m.key, '✅')
    return true
  } catch (e) {
    console.error('Error en YouTube auto-descarga:', e)
    await reaccionarMsg(conn, m.chat, m.key, '❌')
    await conn.sendMessage(m.chat, {
      text: `[❗] No se pudo descargar el contenido de YouTube.\n\n> ${e.message || 'Intenta de nuevo más tarde.'}`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
    return true
  }
}

export async function manejarModoDescargas(m, conn, comandoEjecutado = false) {
  if (!m.isGroup || m.fromMe || comandoEjecutado) return false
  if (tienePrefijoComando(m)) return false

  const rcanal = global.rcanal || { contextInfo: {} }

  const pendienteManejada = await manejarEleccionYouTubePendiente(m, conn, rcanal)
  if (pendienteManejada) return true

  if (!estaModoDescargasActivo(m.chat)) return false

  const textoEscaneo = obtenerTextoEscaneo(m)
  if (!textoEscaneo.trim()) return false

  const objetivo = extraerObjetivoDescarga(textoEscaneo)
  if (!objetivo) return false

  if (objetivo.type === 'youtube') {
    await pedirEleccionYouTube(m, conn, objetivo.url, rcanal)
    return true
  }

  await reaccionarMsg(conn, m.chat, m.key, '⏳')

  try {
    if (objetivo.type === 'tiktok') {
   
      const video = await downloadTikTokApi(objetivo.url)
      if (!video?.play && !(video?.images?.length)) {
        throw new Error('La API no devolvió media descargable')
      }
      await enviarMediaTikTok(m, conn, video, rcanal)
      await reaccionarMsg(conn, m.chat, m.key, '✅')
      return true
    }

    if (objetivo.type === 'instagram') {
      const media = await descargarInstagram(objetivo.url)
      if (!media?.url) throw new Error('No se pudo obtener el media de Instagram')
      await enviarMediaInstagram(m, conn, media, objetivo.url, rcanal)
      await reaccionarMsg(conn, m.chat, m.key, '✅')
      return true
    }
  } catch (e) {
    console.error('Error en modo-descargas:', e?.message || e)
    await reaccionarMsg(conn, m.chat, m.key, '❌')
    await conn.sendMessage(m.chat, {
      text: `*[❗] No se pudo auto-descargar.*\n> ${e?.message || e}`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m }).catch(() => {})
    return true
  }

  return false
}

export {
  estaModoDescargasActivo as isModoDescargasEnabled,
  esUrlTikTok as isTikTokUrl,
  esUrlInstagram as isInstagramUrl,
  esUrlYouTube as isYouTubeUrl,
  esUrlBypassDescarga as isDescargaBypassUrl,
  debeOmitirAntiLinkPorDescargas as shouldBypassAntiLinkForDescargas,
  extraerObjetivoDescarga as extractDescargaTarget,
  manejarModoDescargas as handleModoDescargas
}
