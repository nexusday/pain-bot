import { downloadTikTok, searchTikTok } from './tiktok-2.js'

const RE_URL_TT =
  /(?:https?:\/\/)?(?:www\.|vm\.|vt\.|m\.|t\.)?tiktok\.com\/[^\s]+/i

function construirLeyendaBusqueda(video) {
  const autor = video.author?.nickname || video.author?.unique_id || 'Desconocido'
  return fichaTik(video.title, [
    ['autor', autor],
    ['región', video.region || '—'],
    ['duración', `${video.duration || '—'}s`],
    ['vistas', video.play_count ?? '—'],
    ['me gusta', video.digg_count ?? '—']
  ])
}

function construirLeyendaEnlace(video) {
  const autor = video.author?.nickname || video.author?.unique_id || 'Desconocido'
  return fichaTik(video.title, [
    ['autor', autor],
    ['duración', `${video.duration || '—'}s`]
  ])
}

function fichaTik(titulo, lineas) {
  const cuerpo = lineas
    .map(([nombre, valor]) => `┊ ${nombre}  ·  \`${String(valor).replace(/`/g, "'")}\``)
    .join('\n')
  return `
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *${String(titulo || 'TikTok').replace(/\s+/g, ' ').slice(0, 70)}*
╰─ ✧  ✩
${cuerpo}
╰─────────`.trim()
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
    } else if (/^\d+$/.test(entrada)) {
      const indice = parseInt(entrada, 10) - 1
      const cacheBusqueda = global.lastTtSearch?.[m.sender]
      if (!cacheBusqueda?.results?.length || Date.now() - cacheBusqueda.at > 10 * 60 * 1000) {
        throw new Error('No hay búsqueda reciente. Usa primero /tiktok <texto>')
      }
      const video = cacheBusqueda.results[indice]
      if (!video) throw new Error(`Elige un número del 1 al ${cacheBusqueda.results.length}.`)
      await enviarVideo(conn, m, video, construirLeyendaEnlace(video))
    } else {
      const resultados = (await searchTikTok(entrada, 4)).filter(video => video?.play)
      if (!resultados.length) {
        return conn.sendMessage(
          m.chat,
          {
            text: '*[❗] No se encontraron resultados para tu búsqueda.*',
            contextInfo: { ...rcanal.contextInfo }
          },
          { quoted: m }
        )
      }

      if (!global.lastTtSearch) global.lastTtSearch = {}
      global.lastTtSearch[m.sender] = { query: entrada, results: resultados, at: Date.now() }

      const tarjetas = resultados.map((video, i) => {
        const autor = video.author?.nickname || video.author?.unique_id || 'TikTok'
        return {
          video: { url: video.play },
          caption: `
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *${String(video.title || 'TikTok').replace(/\s+/g, ' ').slice(0, 70)}*
╰─ ✧  ✩
┊ autor  ·  \`${autor}\`
┊ duración  ·  \`${video.duration || '—'}s\`
╰─────────`.trim(),
          footer: 'descargar',
          nativeFlow: [{ text: 'Descargar', id: `${usedPrefix}tiktok ${i + 1}` }]
        }
      })

      await conn.sendMessageLia(m.chat, {
        text: `
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *TikTok*
╰─ ✧  ✩
┊ búsqueda  ·  \`${entrada.slice(0, 40)}\`
┊ resultados  ·  \`${tarjetas.length}\`
╰─────────`.trim(),
        footer: 'descargar',
        cards: tarjetas,
        linkPreview: null
      }, { quoted: m, keepQuoted: true })
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
