import fs from 'fs'
import path from 'path'
import fetch from 'node-fetch'
import fluent from 'fluent-ffmpeg'
import { fileTypeFromBuffer as fromBuffer } from 'file-type'
import { addExif } from '../lib/sticker.js'

async function cleanupTempFiles(...filePaths) {
  for (const filePath of filePaths) {
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    } catch (err) {
      console.error('Error cleaning temp file:', filePath, err.message)
    }
  }
}

async function toWebp(buffer, opts = {}) {
  const ft = await fromBuffer(buffer)
  const ext = ft?.ext
  if (!/(png|jpg|jpeg|mp4|mkv|m4p|gif|webp|webm)/i.test(ext)) throw '[❌] Archivo no compatible.'

  const tempDir = path.join(process.cwd(), 'tmp')
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true })
  const input = path.join(tempDir, `${Date.now()}.${ext}`)
  const output = path.join(tempDir, `${Date.now()}.webp`)

  fs.writeFileSync(input, buffer)

  const options = [
    '-vcodec', 'libwebp',
    '-vf', `scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000,fps=15,split[a][b];[a]palettegen=reserve_transparent=on:transparency_color=ffffff[p];[b][p]paletteuse`,
    ...(ext.match(/(mp4|mkv|m4p|gif|webm)/) ? ['-loop', '0', '-preset', 'default', '-an', '-vsync', '0'] : [])
  ]

  return new Promise((resolve, reject) => {
    fluent(input)
      .addOutputOptions(options)
      .toFormat('webp')
      .save(output)
      .on('end', () => {
        try {
          const result = fs.readFileSync(output)
          cleanupTempFiles(input, output)
          resolve(result)
        } catch (error) {
          cleanupTempFiles(input, output)
          reject(error)
        }
      })
      .on('error', err => {
        cleanupTempFiles(input)
        reject(err)
      })
  })
}

const handler = async (m, { conn, text, args }) => {
  try {
    const query = (text || args.join(' ') || '').trim()
    if (!query) return conn.reply(m.chat, `Uso: search-sticker <término>`, m, rcanal)

    const searchUrl = `https://api.delirius.store/search/tenor?q=${encodeURIComponent(query)}`
    const res = await fetch(searchUrl).then(r => r.json())
    if (!res?.status || !Array.isArray(res.data) || res.data.length === 0)
      return conn.reply(m.chat, '[❗] No se encontraron stickers para: ' + query, m, rcanal)

    // Seleccionar 2 resultados aleatorios (Fisher-Yates)
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

        await conn.sendFile(m.chat, finalSticker, 'sticker.webp', item.title || '', m, null, rcanal)
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
