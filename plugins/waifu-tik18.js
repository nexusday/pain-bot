import fetch from 'node-fetch'

const API_URL = () =>
  `${(global.APIs?.delirius?.url || 'https://api.delirius.online').replace(/\/$/, '')}/nsfw/tiktok`

let handler = async (m, { conn }) => {
  try {
    await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } }).catch(() => {})

    const response = await fetch(API_URL(), {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Accept: 'video/*,application/json'
      }
    })

    if (!response.ok) {
      await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {})
      return m.reply('*[❗] No se pudo obtener el video. Intenta de nuevo más tarde.*')
    }

    const contentType = String(response.headers.get('content-type') || '')
    let videoBuffer
    let mimetype = 'video/mp4'

    if (contentType.includes('video/')) {
      mimetype = contentType.split(';')[0].trim() || mimetype
      videoBuffer = Buffer.from(await response.arrayBuffer())
    } else {
      const data = await response.json()
      const videoUrl =
        data?.data?.url || data?.data?.video || data?.data?.download || data?.url || data?.video
      if (!videoUrl) {
        await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {})
        return m.reply('*[❗] No se pudo obtener el video. Intenta de nuevo más tarde.*')
      }
      const vidRes = await fetch(videoUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } })
      if (!vidRes.ok) {
        await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {})
        return m.reply('*[❗] No se pudo obtener el video. Intenta de nuevo más tarde.*')
      }
      mimetype = String(vidRes.headers.get('content-type') || mimetype).split(';')[0].trim() || mimetype
      videoBuffer = Buffer.from(await vidRes.arrayBuffer())
    }

    if (!videoBuffer?.length) {
      await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {})
      return m.reply('*[❗] No se pudo obtener el video. Intenta de nuevo más tarde.*')
    }

    await conn.sendMessage(
      m.chat,
      {
        video: videoBuffer,
        mimetype,
        fileName: 'tik18.mp4',
        mentions: [m.sender]
      },
      { quoted: m }
    )

    await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {})
  } catch (e) {
    console.error('Error en comando tik18:', e)
    await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {})
    m.reply('*[❗] Ocurrió un error al obtener el video. Por favor, inténtalo de nuevo más tarde.*')
  }
}

handler.help = ['#tik18', '#tk18', '#tk']
handler.tags = ['nsfw']
handler.command = ['tik18', 'tk18', 'tk']

export default handler
