import fetch from 'node-fetch'

const TIKWM = 'https://www.tikwm.com'
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const TT_URL_RE =
  /(?:https?:\/\/)?(?:www\.|vm\.|vt\.|m\.|t\.)?tiktok\.com\/[^\s]+/i

function absMedia(url = '') {
  const u = String(url || '').trim()
  if (!u) return ''
  if (/^https?:\/\//i.test(u)) return u
  return `${TIKWM}${u.startsWith('/') ? u : `/${u}`}`
}

function extractVideoId(text = '') {
  const s = String(text)
  return (
    s.match(/\/video\/(\d{8,})/)?.[1] ||
    s.match(/\/v\/(\d{8,})/)?.[1] ||
    s.match(/(?:photo|photo\/)(\d{8,})/)?.[1] ||
    s.match(/(?:^|[^\d])(\d{15,20})(?:[^\d]|$)/)?.[1] ||
    null
  )
}

async function resolveInputUrl(input) {
  let url = String(input || '').trim()
  if (!url) return { url: '', id: null }
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`

  let id = extractVideoId(url)
  if (id) return { url, id }

 
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': UA, Accept: 'text/html' }
    })
    const finalUrl = res.url || url
    id = extractVideoId(finalUrl)
    return { url: finalUrl, id }
  } catch {
    return { url, id: null }
  }
}

async function tikwmJson(pathWithQuery) {
  const res = await fetch(`${TIKWM}${pathWithQuery}`, {
    headers: {
      'User-Agent': UA,
      Accept: 'application/json',
      Referer: `${TIKWM}/`,
      Cookie: 'current_language=en'
    }
  })
  const raw = await res.text()
  if (raw.trim().startsWith('<')) {
    throw new Error(`TikWM bloqueó la petición (${res.status})`)
  }
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error('TikWM no devolvió JSON válido')
  }
}

function normalizeTikwmVideo(data = {}) {
  const play = absMedia(data.hdplay || data.play || data.wmplay)
  const images = Array.isArray(data.images) ? data.images.map(absMedia) : []
  return {
    ...data,
    play,
    music: absMedia(data.music),
    cover: absMedia(data.cover),
    images,
    type: data.type || (images.length ? 'image' : 'video')
  }
}

async function downloadFromTikwm(urlOrId) {
  const json = await tikwmJson(`/api/?url=${encodeURIComponent(urlOrId)}&hd=1`)
  if (json?.code !== 0 || !json?.data) {
    throw new Error(json?.msg || 'TikWM no pudo procesar el enlace')
  }
  const video = normalizeTikwmVideo(json.data)
  if (!video.play && !video.images?.length) {
    throw new Error('Sin media descargable en TikWM')
  }
  return video
}

async function downloadFromTikmate(url) {
  const res = await fetch('https://api.tikmate.app/api/lookup', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'User-Agent': UA
    },
    body: `url=${encodeURIComponent(url)}`
  })
  const data = await res.json()
  if (!data?.success || !data?.token || !data?.id) {
    throw new Error(data?.message || 'TikMate falló')
  }
  return {
    title: data.desc || 'TikTok',
    author: {
      nickname: data.author_name,
      unique_id: data.author_id
    },
    duration: null,
    created_at: data.create_time,
    cover: data.cover,
    play: `https://tikmate.app/download/${data.token}/${data.id}.mp4`,
    music: '',
    images: [],
    type: 'video'
  }
}

async function downloadTikTok(inputUrl) {
  const { url, id } = await resolveInputUrl(inputUrl)
  const attempts = []
  if (id) attempts.push(id)
  if (url) attempts.push(url)

  let lastErr
  for (const target of [...new Set(attempts)]) {
    try {
      return await downloadFromTikwm(target)
    } catch (e) {
      lastErr = e
    }
  }

  try {
    return await downloadFromTikmate(url || inputUrl)
  } catch (e) {
    lastErr = e
  }

  throw lastErr || new Error('No se pudo descargar el TikTok')
}

async function searchTikTok(query, limit = 3) {

  try {
    const res = await fetch(`${TIKWM}/api/feed/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Cookie: 'current_language=en',
        'User-Agent': UA,
        Referer: `${TIKWM}/`,
        Origin: TIKWM
      },
      body: new URLSearchParams({
        keywords: query,
        count: String(Math.max(limit, 10)),
        cursor: '0',
        HD: '1'
      })
    })
    const raw = await res.text()
    if (!raw.trim().startsWith('<')) {
      const data = JSON.parse(raw)
      const videos = (data?.data?.videos || []).filter(v => v.play)
      if (videos.length) return videos.slice(0, limit).map(normalizeTikwmVideo)
    }
  } catch {}

  
  const ch = await tikwmJson(
    `/api/challenge/search?keywords=${encodeURIComponent(query)}&count=5`
  )
  const challenge = ch?.data?.challenge_list?.[0]
  if (!challenge?.id) {
    throw new Error('Sin resultados de búsqueda')
  }

  const posts = await tikwmJson(
    `/api/challenge/posts?challenge_id=${encodeURIComponent(challenge.id)}&count=${Math.max(limit, 8)}&cursor=0`
  )
  const videos = (posts?.data?.videos || []).filter(v => v.play)
  if (!videos.length) throw new Error('Sin videos para ese término')
  return videos.slice(0, limit).map(normalizeTikwmVideo)
}

function buildCaption(video, prefix = '𝗧𝗜𝗞𝗧𝗢𝗞 𝗩𝗜𝗗𝗘𝗢') {
  return `${prefix}

> *[+] Título:* ${video.title || 'Sin título'}
> *[+] Autor:* ${video.author?.nickname || video.author?.unique_id || 'Desconocido'}
> *[+] Duración:* ${video.duration || 'N/A'}s`
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text?.trim()) {
    return conn.sendMessage(
      m.chat,
      {
        text: `*[❗] Ingresa un término o un enlace de TikTok.*\nEjemplo:\n> ${usedPrefix + command} https://www.tiktok.com/...\n> ${usedPrefix + command} baile`,
        contextInfo: { ...rcanal.contextInfo }
      },
      { quoted: m }
    )
  }

  const input = text.trim()
  const isUrl = TT_URL_RE.test(input)

  try {
    await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } }).catch(() => {})

    if (isUrl) {
      const link = input.match(TT_URL_RE)?.[0] || input
      const video = await downloadTikTok(link)
      const caption = buildCaption(video)

      if (video.type === 'image' && video.images?.length) {
        for (const img of video.images.slice(0, 8)) {
          await conn.sendMessage(
            m.chat,
            { image: { url: img }, caption, contextInfo: { ...rcanal.contextInfo } },
            { quoted: m }
          )
        }
        if (video.music) {
          await conn.sendMessage(
            m.chat,
            {
              audio: { url: video.music },
              mimetype: 'audio/mp4',
              fileName: 'tiktok_audio.mp4',
              contextInfo: { ...rcanal.contextInfo }
            },
            { quoted: m }
          )
        }
      } else {
        await conn.sendMessage(
          m.chat,
          {
            video: { url: video.play },
            caption,
            contextInfo: { ...rcanal.contextInfo }
          },
          { quoted: m }
        )
      }
    } else {
      const results = await searchTikTok(input, 3)
      for (let i = 0; i < results.length; i++) {
        const vid = results[i]
        await conn.sendMessage(
          m.chat,
          {
            video: { url: vid.play },
            caption: buildCaption(vid, `𝗧𝗜𝗞𝗧𝗢𝗞 ${i + 1}`),
            contextInfo: { ...rcanal.contextInfo }
          },
          { quoted: m }
        )
      }
    }

    await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {})
  } catch (e) {
    console.error('Error en tiktok2:', e)
    await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {})
    conn.sendMessage(
      m.chat,
      {
        text: `*[❗] Ocurrió un error al procesar TikTok.*\n> ${e?.message || e}`,
        contextInfo: { ...rcanal.contextInfo }
      },
      { quoted: m }
    )
  }
}

handler.help = ['tiktok2 <búsqueda | link>']
handler.tags = ['downloader']
handler.command = ['tiktok2', 'tt2', 'tiktoks2', 'tts2']

export default handler
export { downloadTikTok, searchTikTok, absMedia }
