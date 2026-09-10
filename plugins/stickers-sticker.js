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

    const { packname, author } = resolveStickerMeta(m, conn)

    const stickerData = await toWebp(buffer)
    const finalSticker = await addExif(stickerData, packname, author)
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
  } catch (e) {
    console.error(e)
    conn.reply(m.chat, '[❌] Error al crear el sticker.', m, rcanal)
  }
}

handler.help = ['#sticker • #s • #stickers + {imagen/video o link}']
handler.tags = ['stickers']
handler.command = ['s', 'stickers', 'sticker']

export default handler

/** Usa pack/autor de .setmeta; si no hay, el diseño por defecto del bot. */
export function resolveStickerMeta(m, conn) {
  const user = global.db?.data?.users?.[m.sender] || {}
  const username = m.pushName || conn?.getName?.(m.sender) || 'Usuario'
  const nombreBot = global.namebot || 'PAIN BOT'

  const defaultPack = `👑 𝗢𝘄𝗻𝗲𝗿𝘀: \n✰ Sunkovv`
  const defaultAuthor = `\n\n🪐 𝗕𝗼𝘁:\n↳${nombreBot}\n\n🍁 𝑼𝒔𝒖𝒂𝒓𝒊𝒐:\n↳@${username}`

  const customPack = String(user.packname || '').trim()
  const customAuthor = String(user.author || '').trim()

  return {
    packname: customPack || defaultPack,
    author: customAuthor || defaultAuthor
  }
}


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

/** Detecta WebP animado (ANIM/ANMF o flag VP8X). */
export function isAnimatedWebP(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 20) return false
  if (buffer[0] !== 0x52 || buffer[1] !== 0x49 || buffer[2] !== 0x46 || buffer[3] !== 0x46) return false
  if (buffer.toString('ascii', 8, 12) !== 'WEBP') return false

  let offset = 12
  while (offset + 8 <= buffer.length) {
    const chunkFourCC = buffer.toString('ascii', offset, offset + 4)
    const chunkSize = buffer.readUInt32LE(offset + 4)
    if (chunkFourCC === 'ANIM' || chunkFourCC === 'ANMF') return true
    if (chunkFourCC === 'VP8X' && offset + 8 < buffer.length) {
      if (buffer[offset + 8] & 0x02) return true
    }
    offset += 8 + chunkSize + (chunkSize % 2)
    if (chunkSize < 0) break
  }
  return false
}

/**
 * Imagen → webp estático.
 * Video/GIF → webp animado (máx ~7s, peso controlado) para WhatsApp.
 */
async function toWebp(buffer) {
  const type = await fromBuffer(buffer)
  if (!type?.ext) throw '[❌] Archivo no compatible.'
  const { ext, mime } = type
  if (!/(png|jpe?g|mp4|mkv|m4p|gif|webp|webm)/i.test(ext)) throw '[❌] Archivo no compatible.'

  // Ya es webp animado: no re-encodificar (rompe frames a veces)
  if (ext === 'webp' && isAnimatedWebP(buffer)) return buffer

  const isAnimInput =
    /(mp4|mkv|m4p|gif|webm)/i.test(ext) ||
    /video\//i.test(mime || '') ||
    /gif/i.test(mime || '')

  const tempDir = path.join(process.cwd(), 'tmp')
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true })

  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const input = path.join(tempDir, `${stamp}.${ext}`)
  const output = path.join(tempDir, `${stamp}.webp`)
  fs.writeFileSync(input, buffer)

  const runFfmpeg = (quality = 50, durationSec = 7) =>
    new Promise((resolve, reject) => {
      const options = isAnimInput
        ? [
            '-vcodec', 'libwebp',
            // Sin palettegen: más fiable para animación en WA. Pad con -1:-1.
            '-vf',
            'scale=512:512:force_original_aspect_ratio=decrease,fps=15,pad=512:512:-1:-1:color=white@0.0,setsar=1',
            '-loop', '0',
            '-ss', '0',
            '-t', String(durationSec),
            '-preset', 'default',
            '-an',
            '-vsync', '0',
            '-q:v', String(quality)
          ]
        : [
            '-vcodec', 'libwebp',
            '-vf',
            'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:-1:-1:color=0x00000000,setsar=1',
            '-frames:v', '1',
            '-lossless', '0',
            '-compression_level', '6',
            '-q:v', '60'
          ]

      fluent(input)
        .addOutputOptions(options)
        .toFormat('webp')
        .save(output)
        .on('end', () => {
          try {
            resolve(fs.readFileSync(output))
          } catch (err) {
            reject(err)
          }
        })
        .on('error', reject)
    })

  try {
    let result = await runFfmpeg(50, 7)

    // WhatsApp anima bien bajo ~1MB; si pesa mucho, recomprimir / acortar
    if (isAnimInput && result.length > 900 * 1024) {
      result = await runFfmpeg(35, 6)
    }
    if (isAnimInput && result.length > 900 * 1024) {
      result = await runFfmpeg(25, 5)
    }

    if (isAnimInput && !isAnimatedWebP(result)) {
      throw new Error('FFmpeg generó un webp sin animación')
    }

    return result
  } finally {
    cleanupTempFiles(input, output)
  }
}

function isUrl(text) {
  return /^https?:\/\/\S+\.(jpg|jpeg|png|gif|webp|mp4|webm)$/i.test(text)
}

export { toWebp, isUrl }
