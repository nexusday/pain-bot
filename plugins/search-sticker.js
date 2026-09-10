import fetch from 'node-fetch'
import { addExif } from '../lib/sticker.js'
import { toWebp, isAnimatedWebP } from './stickers-sticker.js'

const handler = async (m, { conn, text, args }) => {
  try {
    const query = (text || args.join(' ') || '').trim()
    if (!query) return conn.reply(m.chat, `Uso: search-sticker <término>`, m, rcanal)

    const searchUrl = `https://api.delirius.online/search/tenor?q=${encodeURIComponent(query)}`
    const res = await fetch(searchUrl).then(r => r.json())
    if (!res?.status || !Array.isArray(res.data) || res.data.length === 0)
      return conn.reply(m.chat, '[❗] No se encontraron stickers para: ' + query, m, rcanal)

    const candidates = Array.from(res.data)
    const shuffle = (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[arr[i], arr[j]] = [arr[j], arr[i]]
      }
      return arr
    }
    const totalToSend = Math.min(2, candidates.length)
    const results = shuffle(candidates).slice(0, totalToSend)
    const username = '@' + (conn.getName(m.sender) || 'Usuario')
    let sent = 0

    for (const item of results) {
      try {
        const mediaUrl = item.mp4 || item.gif
        if (!mediaUrl) continue

        const r = await fetch(mediaUrl)
        if (!r.ok) continue
        const arrayBuffer = await r.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        const webp = await toWebp(buffer)
        const packname = `${query}`
        const author = `${username}` + '\n' + (global.namebot || 'PAIN BOT')
        const finalSticker = await addExif(webp, packname, author)
        const animated = isAnimatedWebP(finalSticker)

        await conn.sendMessage(
          m.chat,
          {
            sticker: finalSticker,
            ...(animated ? { isAnimated: true } : {}),
            contextInfo: rcanal?.contextInfo
          },
          { quoted: m }
        )
        sent++
      } catch (err) {
        console.error('Error procesando resultado de sticker:', err.message)
        continue
      }
    }

    if (sent === 0) return conn.reply(m.chat, '[❌] No se pudieron generar stickers.', m, rcanal)
  } catch (e) {
    console.error('Error en search-sticker:', e)
    return conn.reply(m.chat, '[❌] Error al buscar stickers.', m, rcanal)
  }
}

handler.help = ['search-sticker <término>']
handler.tags = ['stickers']
handler.command = ['search-sticker', 'bsticker', 'sticker-search']

export default handler
