import fetch from 'node-fetch'
import axios from 'axios'

const HEADERS = {
  'User-Agent': 'Mozilla/5.0',
  Accept: 'application/json',
}

const ES_MEDIA = u =>
  typeof u === 'string' && /\.(jpe?g|png|gif|webm|mp4)(\?|$)/i.test(u)

async function buscarRule34(tag) {
  const sources = [
    `https://rule34.xxx/index.php?page=dapi&s=post&q=index&json=1&tags=${tag}`,
    `https://xbooru.com/index.php?page=dapi&s=post&q=index&json=1&tags=${tag}`,
    `https://hypnohub.net/index.php?page=dapi&s=post&q=index&json=1&tags=${tag}`,
  ]

  for (const url of sources) {
    try {
      const res = await fetch(url, { headers: HEADERS })
      const type = res.headers.get('content-type') || ''
      if (!res.ok || !type.includes('json')) continue
      const json = await res.json()
      const data = Array.isArray(json) ? json : json?.post || json?.data || []
      const valid = data
        .map(i => i?.file_url || i?.large_file_url || i?.sample_url || i?.image)
        .filter(ES_MEDIA)
      if (valid.length) return [...new Set(valid)]
    } catch {}
  }
  return []
}

async function buscarDanbooru(tag) {
  const url = `https://danbooru.donmai.us/posts.json?tags=${encodeURIComponent(tag)}&limit=40`
  const res = await fetch(url, { headers: HEADERS })
  if (!res.ok) return []
  const json = await res.json()
  return (Array.isArray(json) ? json : [])
    .map(p => p?.file_url || p?.large_file_url)
    .filter(ES_MEDIA)
}

async function buscarGelbooru(tag) {
  const base = (global.APIs?.delirius?.url || 'https://api.delirius.online').replace(/\/$/, '')
  const url = `${base}/search/gelbooru?query=${encodeURIComponent(tag)}`
  const res = await axios.get(url, { timeout: 20000 })
  const data = res.data?.data || []
  return data.map(i => i?.image || i?.file_url || i?.url).filter(ES_MEDIA)
}

let handler = async (m, { conn, command, args, usedPrefix }) => {
  try {
    if (!args[0]) {
      return conn.sendMessage(m.chat, {
        text: `[❗] Uso: *${usedPrefix}${command} <tag>*\n> Ejemplo: *${usedPrefix}${command} sakura*`,
        contextInfo: { ...(global.rcanal?.contextInfo || {}) },
      }, { quoted: m })
    }

    await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } }).catch(() => {})

    const tag = args.join(' ').trim().replace(/\s+/g, '_')
    let mediaList = []

    switch (command) {
      case 'rule34':
      case 'rule':
      case 'r34':
        mediaList = await buscarRule34(encodeURIComponent(tag))
        break
      case 'danbooru':
      case 'dbooru':
        mediaList = await buscarDanbooru(tag)
        break
      case 'gelbooru':
      case 'gbooru':
        mediaList = await buscarGelbooru(tag)
        break
    }

    if (!mediaList.length) {
      await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } }).catch(() => {})
      return conn.sendMessage(m.chat, {
        text: `[❗] No se encontraron resultados para *${tag}*`,
        contextInfo: { ...(global.rcanal?.contextInfo || {}) },
      }, { quoted: m })
    }

    const media = mediaList[Math.floor(Math.random() * mediaList.length)]
    const caption = `𓂃 ࣪ ִֶָ☾. *${command}* » *${tag}*`
    const esVideo = /\.(mp4|webm)(\?|$)/i.test(media)

    if (esVideo) {
      await conn.sendMessage(m.chat, {
        video: { url: media },
        caption,
        mentions: [m.sender],
        contextInfo: { ...(global.rcanal?.contextInfo || {}) },
      }, { quoted: m })
    } else {
      await conn.sendMessage(m.chat, {
        image: { url: media },
        caption,
        mentions: [m.sender],
        contextInfo: { ...(global.rcanal?.contextInfo || {}) },
      }, { quoted: m })
    }

    await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {})
  } catch (error) {
    console.error('Error en rule34:', error)
    await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {})
    await conn.sendMessage(m.chat, {
      text: `[❗] Ocurrió un error.\n> ${error?.message || error}`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
  }
}

handler.help = ['#r34 <tag>', '#danbooru <tag>', '#gelbooru <tag>']
handler.tags = ['nsfw']
handler.command = ['r34', 'rule34', 'rule', 'danbooru', 'dbooru', 'gelbooru', 'gbooru']

export default handler
