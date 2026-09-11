import { downloadTikTok, searchTikTok } from './tiktok-2.js'

const RE_URL_TT =
  /(?:https?:\/\/)?(?:www\.|vm\.|vt\.|m\.|t\.)?tiktok\.com\/[^\s]+/i

function construirLeyendaBusqueda(video) {
  const autor = video.author?.nickname || video.author?.unique_id || 'Desconocido'
  return `𝗥𝗘𝗦𝗨𝗟𝗧𝗔𝗗𝗢 𝗗𝗘 𝗧𝗜𝗞𝗧𝗢𝗞

> *[+] Título:* ${video.title || 'Sin título'}
> *[+] Autor:* ${autor}
> *[+] Región:* ${video.region || 'Desconocida'}
> *[+] Duración:* ${video.duration || 'N/A'}s

> *[•] Estadísticas*
> *├─* Vistas: ${video.play_count?.toLocaleString?.() || video.play_count || 'N/A'}
> *├─* Me gusta: ${video.digg_count?.toLocaleString?.() || video.digg_count || 'N/A'}
> *├─* Comentarios: ${video.comment_count?.toLocaleString?.() || video.comment_count || 'N/A'}
> *├─* Compartidos: ${video.share_count?.toLocaleString?.() || video.share_count || 'N/A'}
> *└─* Descargas: ${video.download_count?.toLocaleString?.() || video.download_count || 'N/A'}`
}

function construirLeyendaEnlace(video) {
  return `𝗧𝗜𝗞𝗧𝗢𝗞 𝗩𝗜𝗗𝗘𝗢

> *[+] Título:* ${video.title || 'Sin título'}
> *[+] Autor:* ${video.author?.nickname || video.author?.unique_id || 'Desconocido'}
> *[+] Duración:* ${video.duration || 'N/A'}s`
}

async function enviarVideo(conn, m, video, leyenda) {
  if (video.type === 'image' && Array.isArray(video.images) && video.images.length) {
    for (const img of video.images.slice(0, 6)) {
      await conn.sendMessage(
        m.chat,
        { image: { url: img }, caption: leyenda, contextInfo: { ...rcanal.contextInfo } },
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
      caption: leyenda,
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

  const entrada = text.trim()
  const esUrl = RE_URL_TT.test(entrada)

  try {
    await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } }).catch(() => {})

    if (esUrl) {
    
      const link = entrada.match(RE_URL_TT)?.[0] || entrada
      const video = await downloadTikTok(link)
      await enviarVideo(conn, m, video, construirLeyendaEnlace(video))
    } else {
      const resultados = await searchTikTok(entrada, 1)
      const video = resultados[0]
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
      await enviarVideo(conn, m, video, construirLeyendaBusqueda(video))
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
