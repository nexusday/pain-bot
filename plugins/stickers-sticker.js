import fs from 'fs'
import path from 'path'
import fetch from 'node-fetch'
import fluent from 'fluent-ffmpeg'
import { fileTypeFromBuffer as fromBuffer } from 'file-type'
import { addExif } from '../lib/sticker.js'


let handler = async (m, { conn, args }) => {
  let q = m.quoted ? m.quoted : m
  let mime = (q.msg || q).mimetype || q.mediaType || ''
  let buffer

  try {
    if (/image|video|webp|webm/.test(mime) && q.download) {
      buffer = await q.download()
    } else if (args[0] && isUrl(args[0])) {
      const res = await fetch(args[0])
      buffer = await res.buffer()
    } else {
      return conn.reply(m.chat, '[❗] Por favor, responde a una imagen o video para crear un sticker.', m, rcanal)
    }

    const username = '@' + (conn.getName(m.sender) || 'Usuario')
    let nombreBot = global.namebot || 'PAIN BOT'
    
    const packname = `👑 𝗢𝘄𝗻𝗲𝗿𝘀: \n✰ Sunkovv`
    const author = `\n\n🪐 𝗕𝗼𝘁:\n↳${nombreBot}\n\n🍁 𝑼𝒔𝒖𝒂𝒓𝒊𝒐:\n↳${username}`

    const stickerData = await toWebp(buffer)
    const finalSticker = await addExif(stickerData, packname, author)

    await conn.sendFile(m.chat, finalSticker, 'sticker.webp', '', m, null, rcanal)
  } catch (e) {
    console.error(e)
    conn.reply(m.chat, '[❌] Error al crear el sticker.', m, rcanal)
  }
}

handler.help = ['#sticker • #s • #stickers + {imagen/video o link}']
handler.tags = ['stickers']
handler.command = ['s', 'stickers', 'sticker']

export default handler


function cleanupTempFiles(...filePaths) {
  filePaths.forEach(filePath => {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }
    } catch (error) {
      console.error('Error cleaning up temp file:', filePath, error.message)
    }
  })
}

async function toWebp(buffer, opts = {}) {
  const { ext } = await fromBuffer(buffer)
  if (!/(png|jpg|jpeg|mp4|mkv|m4p|gif|webp|webm)/i.test(ext)) throw '[❌] Archivo no compatible.'

  
  const tempDir = path.join(process.cwd(), 'tmp')
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true })
  }
  const input = path.join(tempDir, `${Date.now()}.${ext}`)
  const output = path.join(tempDir, `${Date.now()}.webp`)

  fs.writeFileSync(input, buffer)

  const options = [
    '-vcodec', 'libwebp',
    '-vf', `scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000,fps=15,split[a][b];[a]palettegen=reserve_transparent=on:transparency_color=ffffff[p];[b][p]paletteuse`,
    ...(ext.match(/(mp4|mkv|m4p|gif|webm)/)
      ? ['-loop', '0', '-preset', 'default', '-an', '-vsync', '0']
      : []
    )
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
      .on('error', (err) => {
        
        cleanupTempFiles(input)
        reject(err)
      })
  })
}

function isUrl(text) {
  return /^https?:\/\/\S+\.(jpg|jpeg|png|gif|webp|mp4|webm)$/i.test(text)
}
