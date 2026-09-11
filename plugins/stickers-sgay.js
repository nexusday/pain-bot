import { addExif } from '../lib/sticker.js'
import { toWebp, resolveStickerMeta } from './stickers-sticker.js'
import {
  applyGayFilter,
  resolveMediaTarget,
  loadImageBuffer,
  resolveText,
  DEFAULT_TEXT,
  MAX_TEXT
} from './img-imgay.js'

let handler = async (m, { conn, text, usedPrefix, command }) => {
  try {
    const destino = resolveMediaTarget(m)
    const textoMsg = resolveText(m, text, usedPrefix, command)

    if (!destino) {
      return conn.reply(
        m.chat,
        `*[❗] Responde a una foto (o envíala con el comando) y escribe el texto.*\n\n` +
          `Ejemplos:\n` +
          `> ${usedPrefix + command} Lo suponia\n` +
          `> ${usedPrefix + command} ya sabía 🏳️‍🌈\n` +
          `> Sin texto usa: *${DEFAULT_TEXT}*\n\n` +
          `> Imagen (no sticker): *${usedPrefix}imgay*`,
        m,
        global.rcanal
      )
    }

    const textoFinal = textoMsg || DEFAULT_TEXT
    if (textoFinal.length > MAX_TEXT) {
      return conn.reply(
        m.chat,
        `*[❗] Texto muy largo.* Máximo ${MAX_TEXT} caracteres.`,
        m,
        global.rcanal
      )
    }

    const tipoMime = (destino.msg || destino).mimetype || destino.mediaType || ''
    const media = await destino.download()
    const foto = await loadImageBuffer(media, tipoMime)

    await conn.sendMessage(m.chat, { react: { text: '', key: m.key } }).catch(() => {})

    const filtrado = await applyGayFilter(foto, textoFinal)
    const webp = await toWebp(filtrado)
    const { packname, author } = resolveStickerMeta(m, conn)
    const stickerFinal = await addExif(webp, packname, author)

    await conn.sendFile(m.chat, stickerFinal, 'sticker.webp', '', m, null, global.rcanal)
  } catch (error) {
    console.error('[sgay]', error)
    return conn.reply(
      m.chat,
      `*[❌] Error al crear el sticker.*\n> ${error?.message || error}`,
      m,
      global.rcanal
    )
  }
}

handler.help = ['#sgay + {foto + texto} → filtro + texto (sticker)']
handler.tags = ['stickers', 'fun']
handler.command = ['sgay', 'sgayfilter', 'stickergay']

export default handler
