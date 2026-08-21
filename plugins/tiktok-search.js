import { downloadTikTok, searchTikTok } from './tiktok-2.js'

const TT_URL_RE =
  /(?:https?:\/\/)?(?:www\.|vm\.|vt\.|m\.|t\.)?tiktok\.com\/[^\s]+/i

function buildSearchCaption(video) {
  const author = video.author?.nickname || video.author?.unique_id || 'Desconocido'
  return `𝗥𝗘𝗦𝗨𝗟𝗧𝗔𝗗𝗢 𝗗𝗘 𝗧𝗜𝗞𝗧𝗢𝗞

> *[+] Título:* ${video.title || 'Sin título'}
> *[+] Autor:* ${author}
> *[+] Región:* ${video.region || 'Desconocida'}
> *[+] Duración:* ${video.duration || 'N/A'}s

> *[•] Estadísticas*
> *├─* Vistas: ${video.play_count?.toLocaleString?.() || video.play_count || 'N/A'}
> *├─* Me gusta: ${video.digg_count?.toLocaleString?.() || video.digg_count || 'N/A'}
> *├─* Comentarios: ${video.comment_count?.toLocaleString?.() || video.comment_count || 'N/A'}
> *├─* Compartidos: ${video.share_count?.toLocaleString?.() || video.share_count || 'N/A'}
> *└─* Descargas: ${video.download_count?.toLocaleString?.() || video.download_count || 'N/A'}`
}

function buildLinkCaption(video) {
  return `𝗧𝗜𝗞𝗧𝗢𝗞 𝗩𝗜𝗗𝗘𝗢

> *[+] Título:* ${video.title || 'Sin título'}
> *[+] Autor:* ${video.author?.nickname || video.author?.unique_id || 'Desconocido'}
> *[+] Duración:* ${video.duration || 'N/A'}s`
}

async function sendVideo(conn, m, video, caption) {
  if (video.type === 'image' && Array.isArray(video.images) && video.images.length) {
    for (const img of video.images.slice(0, 6)) {
      await conn.sendMessage(
        m.chat,
        { image: { url: img }, caption, contextInfo: { ...rcanal.contextInfo } },
        { quoted: m }
      )
    }
    return
  }

  if (!video.play) throw new Error('Sin URL de video')

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

let handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text?.trim()) {
    return conn.sendMessage(
      m.chat,
      {
        text:
          `*[❗] Ingresa un término o un enlace de TikTok.*\n` +
          `Ejemplo:\n> ${usedPrefix + command} funk\n> ${usedPrefix + command} https://www.tiktok.com/...`,
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
      await sendVideo(conn, m, video, buildLinkCaption(video))
    } else {
      const results = await searchTikTok(input, 1)
      const video = results[0]
      if (!video) {
        return conn.sendMessage(
          m.chat,
          {
            text: '*[❗] No se encontraron resultados para tu búsqueda.*',
            contextInfo: { ...rcanal.contextInfo }
          },
          { quoted: m }
        )
      }
      await sendVideo(conn, m, video, buildSearchCaption(video))
    }

    await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {})
  } catch (e) {
    console.error('Error en tiktok-search:', e)
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

handler.help = ['#tiktok <búsqueda | link>']
handler.tags = ['busqueda', 'descargas']
handler.command = ['tiktok', 'ttsearch', 'tt']

export default handler
