import fetch from 'node-fetch'

const API_URL = () =>
  `${(global.APIs?.delirius?.url || 'https://api.delirius.online').replace(/\/$/, '')}/nsfw/corean`

let handler = async (m, { conn }) => {
  try {
    const response = await fetch(API_URL(), {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Accept: 'image/*,application/json'
      }
    })

    if (!response.ok) {
      return m.reply('*[❗] No se pudo obtener la imagen. Intenta de nuevo más tarde.*')
    }

    const contentType = String(response.headers.get('content-type') || '')
    let imageBuffer

    if (contentType.includes('image/')) {
      imageBuffer = Buffer.from(await response.arrayBuffer())
    } else {
      const data = await response.json()
      const imageUrl = data?.data?.url || data?.data?.image || data?.url || data?.image
      if (!imageUrl) {
        return m.reply('*[❗] No se pudo obtener la imagen. Intenta de nuevo más tarde.*')
      }
      const imgRes = await fetch(imageUrl)
      if (!imgRes.ok) {
        return m.reply('*[❗] No se pudo obtener la imagen. Intenta de nuevo más tarde.*')
      }
      imageBuffer = Buffer.from(await imgRes.arrayBuffer())
    }

    if (!imageBuffer?.length) {
      return m.reply('*[❗] No se pudo obtener la imagen. Intenta de nuevo más tarde.*')
    }

    await conn.sendMessage(
      m.chat,
      {
        image: imageBuffer,
        mentions: [m.sender]
      },
      { quoted: m }
    )
  } catch (e) {
    console.error('Error en comando corean:', e)
    m.reply('*[❗] Ocurrió un error al obtener la imagen. Por favor, inténtalo de nuevo más tarde.*')
  }
}

handler.help = ['#corean', '#coreanas']
handler.tags = ['nsfw']
handler.command = ['corean', 'coreanas']

export default handler
