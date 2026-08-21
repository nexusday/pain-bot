import sharp from '../lib/sharp.js'
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
    const target = resolveMediaTarget(m)
    const msgText = resolveText(m, text, usedPrefix, command)

    if (!target) {
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

    const finalText = msgText || DEFAULT_TEXT
    if (finalText.length > MAX_TEXT) {
      return conn.reply(
        m.chat,
        `*[❗] Texto muy largo.* Máximo ${MAX_TEXT} caracteres.`,
        m,
        global.rcanal
      )
    }

    const mime = (target.msg || target).mimetype || target.mediaType || ''
    const media = await target.download()
    const photo = await loadImageBuffer(media, mime)

    await conn.sendMessage(m.chat, { react: { text: '', key: m.key } }).catch(() => {})

    const filtered = await applyGayFilter(photo, finalText)
   
    const png = await sharp(filtered).png().toBuffer()
    const webp = await toWebp(png)
    const { packname, author } = resolveStickerMeta(m, conn)
    const finalSticker = await addExif(webp, packname, author)

    await conn.sendFile(m.chat, finalSticker, 'sticker.webp', '', m, null, global.rcanal)
  } catch (e) {
    console.error('[sgay]', e)
    return conn.reply(
      m.chat,
      `*[❌] Error al crear el sticker.*\n> ${e?.message || e}`,
      m,
      global.rcanal
    )
  }
}

handler.help = ['#sgay + {foto + texto} → filtro + texto (sticker)']
handler.tags = ['stickers', 'fun']
handler.command = ['sgay', 'sgayfilter', 'stickergay']

export default handler
