import axios from 'axios'

const CABECERAS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*'
}

function esLinkPinterest(texto = '') {
  return /https?:\/\/(www\.)?(pinterest\.[a-z.]+|pin\.it)\//i.test(texto)
}

async function buscarPinterest(consulta) {
  const url = `https://api.delirius.online/search/pinterest?text=${encodeURIComponent(consulta)}`
  const { data, status } = await axios.get(url, {
    timeout: 45000,
    headers: CABECERAS,
    validateStatus: () => true
  })
  if (status >= 400 || !data?.status) return []

  const lista = Array.isArray(data.results)
    ? data.results
    : Array.isArray(data.data)
      ? data.data
      : []

  return lista
    .map(item => {
      if (typeof item === 'string') return item
      return (
        item?.image_large_url ||
        item?.images?.orig?.url ||
        item?.image ||
        item?.url ||
        item?.media?.url ||
        null
      )
    })
    .filter(Boolean)
}

async function descargarPin(urlPin) {
  const url = `https://api.delirius.online/download/pinterestdl?url=${encodeURIComponent(urlPin)}`
  const { data, status } = await axios.get(url, {
    timeout: 45000,
    headers: CABECERAS,
    validateStatus: () => true
  })
  if (status >= 400 || !data?.status) return null

  const d = data.data || data.result || data
  const media =
    d?.download ||
    d?.url ||
    d?.media ||
    d?.image ||
    d?.imageLargeUrl ||
    d?.image_large_url ||
    d?.video ||
    null

  if (!media) return null
  return {
    title: d.title || d.description || 'Pinterest',
    download: media
  }
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text?.trim()) {
    return conn.sendMessage(m.chat, {
      text: `[❗] Ingresa lo que deseas buscar en Pinterest\n> Ejemplo: ${usedPrefix + command} wallpaper`,
      contextInfo: { ...rcanal?.contextInfo }
    }, { quoted: m })
  }

  try {
    const consulta = text.trim()

    if (esLinkPinterest(consulta)) {
      const link = consulta.split(/\s+/)[0]
      const i = await descargarPin(link)
      if (!i?.download) {
        return conn.sendMessage(m.chat, {
          text: '[❗] No se pudo obtener el contenido de ese enlace de Pinterest.',
          contextInfo: { ...rcanal?.contextInfo }
        }, { quoted: m })
      }

      const esVideo = /\.mp4($|\?)/i.test(i.download) || /video/i.test(i.download)
      await conn.sendMessage(m.chat, {
        [esVideo ? 'video' : 'image']: { url: i.download },
        caption: `> *Título:* ${i.title || 'Sin título'}\n> *Tipo:* ${esVideo ? 'Video' : 'Imagen'}`,
        contextInfo: { ...rcanal?.contextInfo }
      }, { quoted: m })
      return
    }

    const resultados = await buscarPinterest(consulta)
    if (!resultados.length) {
      return conn.sendMessage(m.chat, {
        text: `[❗] No se encontraron resultados para: "${consulta}"`,
        contextInfo: { ...rcanal?.contextInfo }
      }, { quoted: m })
    }

    for (const urlImg of resultados.slice(0, 3)) {
      await conn.sendMessage(m.chat, {
        image: { url: urlImg },
        caption: `> *Búsqueda:* ${consulta}`,
        contextInfo: { ...rcanal?.contextInfo }
      }, { quoted: m })
    }
  } catch (e) {
    console.error('Error en Pinterest:', e)
    conn.sendMessage(m.chat, {
      text: '[❗] Se produjo un error al procesar Pinterest. Inténtalo de nuevo.',
      contextInfo: { ...rcanal?.contextInfo }
    }, { quoted: m })
  }
}

handler.help = ['pinterest <búsqueda | link>']
handler.tags = ['downloader']
handler.command = ['pinterest', 'pin']
handler.group = true

export default handler
