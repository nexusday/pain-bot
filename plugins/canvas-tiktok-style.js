import { buildTextEffectUrl, extractImageUrl } from '../lib/textpro-api.js'
import { tr } from '../lib/lang.js'

const TIMEOUT_MS = 45_000
const MAX_IMAGE_BYTES = 10 * 1024 * 1024

const handler = async (m, { conn, text, usedPrefix, command }) => {
  const partes = String(text || '').split('|').map((parte) => parte.trim())
  if (partes.length !== 2 || partes.some((parte) => !parte)) {
    return conn.sendMessage(m.chat, {
      text: `*[❗] ${tr(conn, 'Escribe las dos partes del texto separadas por |.', 'Enter both text parts separated by |.', 'Escreva as duas partes do texto separadas por |.')}*\n*${tr(conn, 'Ejemplo', 'Example', 'Exemplo')}:* ${usedPrefix + command} Hola | XD`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  try {
    const url = buildTextEffectUrl(global.APIs.qasim, '/api/photooxy/tiktok', partes[0], partes[1])
    const respuesta = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!respuesta.ok) throw new Error(`API Photooxy respondió HTTP ${respuesta.status}`)

    const imagen = extractImageUrl(await respuesta.json())
    if (!imagen) {
      return conn.sendMessage(m.chat, {
        text: `*[❗] ${tr(conn, 'No se pudo generar la imagen.', 'Could not generate the image.', 'Não foi possível gerar a imagem.')}*`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    const descarga = await fetch(imagen, {
      headers: {
        accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        referer: 'https://photooxy.com/',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
    if (!descarga.ok) throw new Error(`Imagen Photooxy respondió HTTP ${descarga.status}`)

    const mime = descarga.headers.get('content-type') || ''
    if (!mime.startsWith('image/')) {
      throw new Error(`Photooxy devolvió un tipo de contenido no válido: ${mime || 'desconocido'}`)
    }

    const longitud = Number(descarga.headers.get('content-length'))
    if (Number.isFinite(longitud) && longitud > MAX_IMAGE_BYTES) {
      throw new Error('La imagen de Photooxy supera el límite de 10 MB.')
    }
    const buffer = Buffer.from(await descarga.arrayBuffer())
    if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) {
      throw new Error('La imagen de Photooxy está vacía o supera el límite de 10 MB.')
    }

    return conn.sendMessage(m.chat, {
      image: buffer,
      caption: `Photooxy TikTok: ${partes.join(' ')}`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  } catch (error) {
    console.error('Error en canvas Photooxy TikTok:', error?.message || error)
    return conn.sendMessage(m.chat, {
      text: `*[❌] ${tr(conn, 'No se pudo consultar Photooxy. Inténtalo de nuevo más tarde.', 'Could not reach Photooxy. Please try again later.', 'Não foi possível consultar o Photooxy. Tente novamente mais tarde.')}*`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }
}

handler.help = ['tiktokstyle <texto1> | <texto2>']
handler.tags = ['canvas']
handler.command = ['tiktokstyle', 'ttstyle']

export default handler
