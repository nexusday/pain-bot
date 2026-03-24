import axios from 'axios'
import cheerio from 'cheerio'

let handler = async (m, { conn, text, args, usedPrefix, command }) => {
  if (!text) return conn.sendMessage(m.chat, {
    text: `[❗] Ingresa lo que deseas buscar en Pinterest\n> Ejemplo: ${usedPrefix + command}pinterest wallpaper`,
    contextInfo: { ...rcanal?.contextInfo }
  }, { quoted: m })

  try {
    if (text.includes("https://")) {
      let i = await dl(args[0])
      if (!i?.download) throw new Error('[❗] No se pudo obtener contenido del enlace.')

      let isVideo = i.download.includes(".mp4")
      await conn.sendMessage(m.chat, {
        [isVideo ? "video" : "image"]: { url: i.download },
        caption: `> *Título:* ${i.title || 'Sin título'}\n> *Tipo:* ${isVideo ? 'Video' : 'Imagen'}`,
        contextInfo: { ...rcanal?.contextInfo }
      }, { quoted: m })

    } else {

      const results = await pins(text)
      if (!results.length) {
        return conn.sendMessage(m.chat, {
          text: `[❗] No se encontraron resultados para: "${text}"`,
          contextInfo: { ...rcanal?.contextInfo }
        }, { quoted: m })
      }

      const medias = results.slice(0, 3).map(img => ({
        image: { url: img.image_large_url },
        caption: `> *Búsqueda:* ${text}`,
        contextInfo: { ...rcanal?.contextInfo }
      }))

      for (let media of medias) {
        await conn.sendMessage(m.chat, media, { quoted: m })
      }
    }

  } catch (e) {
    console.error('Error en Pinterest:', e)
    conn.sendMessage(m.chat, {
      text: '[❗] Se produjo un error al procesar Pinterest\n> Usa *.report* para informarlo.',
      contextInfo: { ...rcanal?.contextInfo }
    }, { quoted: m })
  }
}

handler.help = ['pinterest <búsqueda | link>']
handler.tags = ['downloader']
handler.command = ['pinterest', 'pin']
handler.group = true

export default handler


async function dl(url) {
  try {
    let res = await axios.get(url, { headers: { "User-Agent": "Mozilla/5.0" } })
    let $ = cheerio.load(res.data)

    let tag = $('script[data-test-id="video-snippet"]')
    if (tag.length) {
      let result = JSON.parse(tag.text())
      return {
        title: result.name,
        download: result.contentUrl
      }
    } else {
      let json = JSON.parse($("script[data-relay-response='true']").eq(0).text())
      let result = json.response.data["v3GetPinQuery"].data
      return {
        title: result.title,
        download: result.imageLargeUrl
      }
    }
  } catch {
    return { msg: "Error, inténtalo de nuevo más tarde" }
  }
}

const pins = async (judul) => {
  const link = `https://id.pinterest.com/resource/BaseSearchResource/get/?source_url=%2Fsearch%2Fpins%2F%3Fq%3D${encodeURIComponent(judul)}%26rs%3Dtyped&data=%7B%22options%22%3A%7B%22applied_unified_filters%22%3Anull%2C%22appliedProductFilters%22%3A%22---%22%2C%22article%22%3Anull%2C%22auto_correction_disabled%22%3Afalse%2C%22corpus%22%3Anull%2C%22customized_rerank_type%22%3Anull%2C%22domains%22%3Anull%2C%22dynamicPageSizeExpGroup%22%3A%22control%22%2C%22filters%22%3Anull%2C%22journey_depth%22%3Anull%2C%22page_size%22%3Anull%2C%22price_max%22%3Anull%2C%22price_min%22%3Anull%2C%22query_pin_sigs%22%3Anull%2C%22query%22%3A%22${encodeURIComponent(judul)}%22%2C%22redux_normalize_feed%22%3Atrue%2C%22request_params%22%3Anull%2C%22rs%22%3A%22typed%22%2C%22scope%22%3A%22pins%22%2C%22selected_one_bar_modules%22%3Anull%2C%22seoDrawerEnabled%22%3Afalse%2C%22source_id%22%3Anull%2C%22source_module_id%22%3Anull%2C%22source_url%22%3A%22%2Fsearch%2Fpins%2F%3Fq%3D${encodeURIComponent(judul)}%26rs%3Dtyped%22%2C%22top_pin_id%22%3Anull%2C%22top_pin_ids%22%3Anull%7D%2C%22context%22%3A%7B%7D%7D`
  const headers = {
    'accept': 'application/json, text/javascript, */*; q=0.01',
    'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'priority': 'u=1, i',
    'referer': 'https://id.pinterest.com/',
    'screen-dpr': '1',
    'sec-ch-ua': '"Not(A:Brand";v="99", "Google Chrome";v="133", "Chromium";v="133")',
    'sec-ch-ua-full-version-list': '"Not(A:Brand";v="99.0.0.0", "Google Chrome";v="133.0.6943.142", "Chromium";v="133.0.6943.142")',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-ch-ua-platform-version': '"10.0.0"',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    'x-app-version': 'c056fb7',
    'x-pinterest-appstate': 'active',
    'x-pinterest-pws-handler': 'www/index.js',
    'x-pinterest-source-url': '/',
    'x-requested-with': 'XMLHttpRequest'
  }

  try {
    const res = await axios.get(link, { headers })
    if (res.data?.resource_response?.data?.results) {
      return res.data.resource_response.data.results.map(item => {
        if (item.images) {
          return {
            image_large_url: item.images.orig?.url || null,
            image_medium_url: item.images['564x']?.url || null,
            image_small_url: item.images['236x']?.url || null
          }
        }
        return null
      }).filter(img => img !== null)
    }
    return []
  } catch (error) {
    console.error('Error Pinterest API:', error)
    return []
  }
}