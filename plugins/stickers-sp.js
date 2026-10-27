import { MAX_TEXT, normalizarTextoBrat, textoAStickerBrat } from '../lib/brat.js'
import { addExif } from '../lib/sticker.js'
import { resolveStickerMeta } from './stickers-sticker.js'

function resolverTexto(m, args) {
  const desdeArgs = normalizarTextoBrat(args.join(' ') || '')
  const desdeCita = normalizarTextoBrat(m.quoted?.text || '')
  return desdeArgs || desdeCita
}

let handler = async (m, { conn, args, usedPrefix, command }) => {
  try {
    const texto = resolverTexto(m, args)

    if (!texto) {
      return conn.reply(
        m.chat,
        `*[❗] Escribe el texto Brat.*\n\n` +
          `Ejemplos:\n` +
          `> ${usedPrefix + command} 365 party girl\n` +
          `> ${usedPrefix + command} so brat\n` +
          `> (responde un mensaje con ${usedPrefix + command})`,
        m,
        global.rcanal
      )
    }

    if (texto.length > MAX_TEXT) {
      return conn.reply(
        m.chat,
        `*[❗] Texto muy largo.* Máximo ${MAX_TEXT} caracteres (tienes ${texto.length}).`,
        m,
        global.rcanal
      )
    }

    const { packname, author } = resolveStickerMeta(m, conn)
    const webp = await textoAStickerBrat(texto)
    const stickerFinal = await addExif(webp, packname, author)

    await conn.sendFile(m.chat, stickerFinal, 'sticker.webp', '', m, null, global.rcanal)
  } catch (error) {
    console.error('[brat]', error)
    return conn.reply(
      m.chat,
      `*[❌] Error al crear el sticker Brat.*\n> ${error?.message || error}`,
      m,
      global.rcanal
    )
  }
}

handler.help = ['#brat + {texto} → sticker estilo Brat (fondo blanco, texto negro borroso y mayúsculas intactas)']
handler.tags = ['stickers']
handler.command = ['brat', 'sp', 'stickerplain', 'memetext', 'bratgen']

export default handler
