import fetch from 'node-fetch'

const TIKTOK_REGEX = /(?:https?:\/\/)?(?:www\.|vm\.|vt\.|m\.|t\.)?tiktok\.com\/[^\s]+/i
const IG_REGEX = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:reel|reels|p|tv)\/[\w-]+/i
const LINK_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi

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

export function isDescargaBypassUrl(url = '') {
  return isTikTokUrl(url) || isInstagramUrl(url)
}

export function shouldBypassAntiLinkForDescargas(text = '', chatId) {
  if (!isModoDescargasEnabled(chatId)) return false

  const links = String(text).match(LINK_REGEX) || []
  if (!links.length) return false

  return links.every(link => isDescargaBypassUrl(link))
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

export async function handleModoDescargas(m, conn, commandExecuted = false) {
  if (!m.isGroup || m.fromMe || commandExecuted) return false
  if (!isModoDescargasEnabled(m.chat)) return false
  if (!m.text?.trim()) return false
  if (hasCommandPrefix(m)) return false

  const target = extractDescargaTarget(m.text)
  if (!target) return false

  const rcanal = global.rcanal || { contextInfo: {} }

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
