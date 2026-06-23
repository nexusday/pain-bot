import fetch from 'node-fetch'

const TIKTOK_REGEX = /(?:https?:\/\/)?(?:www\.|vm\.|vt\.|m\.|t\.)?tiktok\.com\/[^\s]+/i
const IG_REGEX = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:reel|reels|p|tv)\/[\w-]+/i
const LINK_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi
const PENDING_TTL = 2 * 60 * 1000

import { isModeActive } from './modo-utils.js'

export function isModoDescargasEnabled(chatId) {
  return isModeActive('modoDescargas', chatId)
}

export function isTikTokUrl(url = '') {
  return /(?:^|\/\/)(?:www\.|vm\.|vt\.|m\.|t\.)?tiktok\.com\//i.test(url)
}

export function isInstagramUrl(url = '') {
  return /instagram\.com\/(?:reel|reels|p|tv)\//i.test(url)
}

export function isYouTubeUrl(url = '') {
  return /youtu\.be|youtube\.com/i.test(url)
}

export function isDescargaBypassUrl(url = '') {
  return isTikTokUrl(url) || isInstagramUrl(url) || isYouTubeUrl(url)
}

export function shouldBypassAntiLinkForDescargas(text = '', chatId) {
  if (!isModoDescargasEnabled(chatId)) return false

  const links = String(text).match(LINK_REGEX) || []
  if (!links.length) return false

  return links.every(link => isDescargaBypassUrl(link))
}

function pendingKey(chat, sender) {
  return `${chat}:${sender}`
}

function getPending(chat, sender) {
  const key = pendingKey(chat, sender)
  const pending = global.pendingYtDescarga?.[key]
  if (!pending) return null
  if (Date.now() - pending.at > PENDING_TTL) {
    delete global.pendingYtDescarga[key]
    return null
  }
  return pending
}

function setPending(chat, sender, data) {
  if (!global.pendingYtDescarga) global.pendingYtDescarga = {}
  global.pendingYtDescarga[pendingKey(chat, sender)] = { ...data, at: Date.now() }
}

function clearPending(chat, sender) {
  delete global.pendingYtDescarga?.[pendingKey(chat, sender)]
}

function trimText(text = '', max = 100) {
  const value = String(text).replace(/\s+/g, ' ').trim()
  if (!value || value === '-') return ''
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

function cleanFileName(title = 'archivo') {
  return String(title)
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 80) || 'archivo'
}

function parseYtChoice(text = '') {
  const value = String(text).trim().toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\w\sáéíóúñ]/gi, '')
    .trim()

  if (/^(mp4|video|vid|v)$/.test(value)) return 'video'
  if (/^(mp3|musica|music|audio|play|cancion|song|m|a)$/.test(value)) return 'audio'
  return null
}

function hasCommandPrefix(m) {
  const text = (m.text || '').trim()
  if (!text) return false

  const prefix = global.prefix
  const escape = str => str.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&')

  if (prefix instanceof RegExp) return prefix.test(text)
  if (Array.isArray(prefix)) {
    return prefix.some(p => {
      if (p instanceof RegExp) return p.test(text)
      return new RegExp(escape(p)).test(text)
    })
  }
  if (typeof prefix === 'string') return new RegExp(escape(prefix)).test(text)
  return false
}

export function extractDescargaTarget(text = '') {
  const value = String(text).trim()
  if (!value) return null

  const tiktok = value.match(TIKTOK_REGEX)?.[0]
  if (tiktok) return { type: 'tiktok', url: tiktok }

  const ig = value.match(IG_REGEX)?.[0]
  if (ig) return { type: 'instagram', url: ig }

  const links = value.match(LINK_REGEX) || []
  const yt = links.find(link => isYouTubeUrl(link))
  if (yt) return { type: 'youtube', url: yt }

  return null
}

async function reactMsg(conn, chat, key, emoji) {
  await conn.sendMessage(chat, {
    react: { text: emoji, key }
  }).catch(() => {})
}

async function downloadTikTok(url) {
  const res = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}?hd=1`)
  const data = await res.json()
  const video = data?.data
  if (!video?.play && !video?.images?.length) return null
  return video
}

async function downloadInstagram(url) {
  const res = await fetch(`https://api.delirius.store/download/instagram?url=${encodeURIComponent(url)}`)
  const data = await res.json()
  if (!data?.status || !Array.isArray(data.data) || !data.data.length) return null
  return data.data[0]
}

async function downloadYouTubeVideo(url, format = '360p') {
  const downloadApi = `https://api.delirius.store/download/ytmp4?url=${encodeURIComponent(url)}&format=${encodeURIComponent(format)}`
  const dres = await fetch(downloadApi).then(r => r.json())
  if (!dres?.status || !dres.data) return null
  return dres.data
}

async function downloadYouTubeAudio(url) {
  const downloadApi = `https://api.delirius.store/download/ytmp3?url=${encodeURIComponent(url)}`
  const dres = await fetch(downloadApi).then(r => r.json())
  if (!dres?.status || !dres.data) return null
  return dres.data
}

async function sendTikTokMedia(m, conn, video, rcanal) {
  const caption = `ִֶָ☾. *TikTok auto-descarga*

> *Título:* ${video.title || 'Sin título'}
> *Autor:* ${video.author?.nickname || video.author?.unique_id || 'Desconocido'}`

  if (video.type === 'image' && Array.isArray(video.images) && video.images.length) {
    for (const img of video.images.slice(0, 4)) {
      await conn.sendMessage(m.chat, {
        image: { url: img },
        caption,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }
    return
  }

  await conn.sendMessage(m.chat, {
    video: { url: video.play },
    caption,
    contextInfo: { ...rcanal.contextInfo }
  }, { quoted: m })
}

async function sendInstagramMedia(m, conn, media, sourceUrl, rcanal) {
  const caption = `ִֶָ☾. *Instagram auto-descarga*

> *Enlace:* ${sourceUrl}`

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

async function sendYouTubeVideo(m, conn, url, rcanal) {
  const data = await downloadYouTubeVideo(url)
  if (!data) throw new Error('No se pudo obtener el video.')

  const videoDownload = typeof data.download === 'string' ? data.download : data.download?.url
  if (!videoDownload) throw new Error('No se encontró la URL del video.')

  const title = data.title || 'Video'
  const channel = data.author || data.channel || 'Desconocido'
  const cover = data.image
  const info = `ִֶָ☾. *YouTube auto-descarga · Video*

 𓍯  *Título:* ${trimText(title, 90)}
 𓍯  *Canal:* ${trimText(channel, 50)}
 𓍯  *Formato:* ${data.format || '360p'}
 𓍯  *Enlace:* ${url}`

  if (cover) {
    try {
      const thumb = (await conn.getFile(cover)).data
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
      fileName: `${cleanFileName(title)}.mp4`,
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
      fileName: `${cleanFileName(title)}.mp4`,
      mimetype: 'video/mp4',
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }
}

async function sendYouTubeAudio(m, conn, url, rcanal) {
  const data = await downloadYouTubeAudio(url)
  if (!data) throw new Error('No se pudo obtener el audio.')

  const audioUrl = typeof data.download === 'string' ? data.download : data.download?.url
  if (!audioUrl) throw new Error('No se encontró la URL del audio.')

  const title = data.title || 'Audio'
  const channel = data.author || data.channel || 'Desconocido'
  const cover = data.image
  const info = `ִֶָ☾. *YouTube auto-descarga · Música*

 𓍯  *Título:* ${trimText(title, 90)}
 𓍯  *Canal:* ${trimText(channel, 50)}
 𓍯  *Enlace:* ${url}`

  if (cover) {
    try {
      const thumb = (await conn.getFile(cover)).data
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
    fileName: `${cleanFileName(title)}.mp3`,
    mimetype: 'audio/mpeg',
    contextInfo: { ...rcanal.contextInfo }
  }, { quoted: m })
}

async function askYouTubeChoice(m, conn, url, rcanal) {
  setPending(m.chat, m.sender, { url })

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

async function handlePendingYouTubeChoice(m, conn, rcanal) {
  const pending = getPending(m.chat, m.sender)
  if (!pending) return false

  const choice = parseYtChoice(m.text)
  if (!choice) return false

  clearPending(m.chat, m.sender)

  await reactMsg(conn, m.chat, m.key, '⏳')

  try {
    if (choice === 'video') {
      await sendYouTubeVideo(m, conn, pending.url, rcanal)
    } else {
      await sendYouTubeAudio(m, conn, pending.url, rcanal)
    }
    await reactMsg(conn, m.chat, m.key, '✅')
    return true
  } catch (e) {
    console.error('Error en YouTube auto-descarga:', e)
    await reactMsg(conn, m.chat, m.key, '❌')
    await conn.sendMessage(m.chat, {
      text: `[❗] No se pudo descargar el contenido de YouTube.\n\n> ${e.message || 'Intenta de nuevo más tarde.'}`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
    return true
  }
}

export async function handleModoDescargas(m, conn, commandExecuted = false) {
  if (!m.isGroup || m.fromMe || commandExecuted) return false
  if (!m.text?.trim()) return false
  if (hasCommandPrefix(m)) return false

  const rcanal = global.rcanal || { contextInfo: {} }

  const pendingHandled = await handlePendingYouTubeChoice(m, conn, rcanal)
  if (pendingHandled) return true

  if (!isModoDescargasEnabled(m.chat)) return false

  const target = extractDescargaTarget(m.text)
  if (!target) return false

  if (target.type === 'youtube') {
    await askYouTubeChoice(m, conn, target.url, rcanal)
    return true
  }

  await reactMsg(conn, m.chat, m.key, '⏳')

  try {
    if (target.type === 'tiktok') {
      const video = await downloadTikTok(target.url)
      if (!video) {
        await reactMsg(conn, m.chat, m.key, '❌')
        return false
      }
      await sendTikTokMedia(m, conn, video, rcanal)
      await reactMsg(conn, m.chat, m.key, '✅')
      return true
    }

    if (target.type === 'instagram') {
      const media = await downloadInstagram(target.url)
      if (!media?.url) {
        await reactMsg(conn, m.chat, m.key, '❌')
        return false
      }
      await sendInstagramMedia(m, conn, media, target.url, rcanal)
      await reactMsg(conn, m.chat, m.key, '✅')
      return true
    }
  } catch (e) {
    console.error('Error en modo-descargas:', e)
    await reactMsg(conn, m.chat, m.key, '❌')
  }

  return false
}
