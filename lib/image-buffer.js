import fs from 'fs'
import path from 'path'
import fluent from 'fluent-ffmpeg'
import { fileTypeFromBuffer } from 'file-type'
import sharp from './sharp.js'
import { webp2png } from './webp2mp4.js'
import fetch from 'node-fetch'

const TMP = path.join(process.cwd(), 'tmp')

function ensureTmp() {
  if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true })
}

function cleanup(...files) {
  for (const f of files) {
    try {
      if (f && fs.existsSync(f)) fs.unlinkSync(f)
    } catch {}
  }
}

async function decodeViaFfmpeg(input, ext = 'img') {
  ensureTmp()
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const inPath = path.join(TMP, `dec_in_${id}.${ext}`)
  const outPath = path.join(TMP, `dec_out_${id}.png`)
  fs.writeFileSync(inPath, input)

  try {
    await new Promise((resolve, reject) => {
      fluent(inPath)
        .outputOptions(['-frames:v', '1', '-y'])
        .toFormat('png')
        .on('error', reject)
        .on('end', resolve)
        .save(outPath)
    })
    return fs.readFileSync(outPath)
  } finally {
    cleanup(inPath, outPath)
  }
}

async function decodeWebpViaEzgif(input) {
  const url = await webp2png(input)
  if (!url) throw new Error('No se pudo convertir webp')
  const res = await fetch(url)
  if (!res.ok) throw new Error('No se pudo descargar png convertido')
  return Buffer.from(await res.arrayBuffer())
}

/**
 * Decodifica cualquier imagen/sticker a PNG.
 * Sharp primero; si falla (ej. wasm/libvips en servidor), usa ffmpeg/ezgif.
 */
export async function decodeImageToPng(buffer, mimeHint = '') {
  const input = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || [])
  if (!input.length) throw new Error('Imagen vacía o no válida')

  let ext = 'img'
  let mime = String(mimeHint || '')
  try {
    const detected = await fileTypeFromBuffer(input)
    if (detected?.ext) ext = detected.ext
    if (detected?.mime) mime = detected.mime
  } catch {}

  const tries = [
    async () => sharp(input).png().toBuffer(),
    async () => sharp(input).jpeg({ quality: 95 }).toBuffer()
  ]

  for (const fn of tries) {
    try {
      const out = await fn()
      if (out?.length) return out
    } catch {}
  }

  if (/webp/i.test(mime) || ext === 'webp') {
    try {
      return await decodeWebpViaEzgif(input)
    } catch {}
  }

  try {
    return await decodeViaFfmpeg(input, ext)
  } catch (ffmpegErr) {
    if (/webp/i.test(mime) || ext === 'webp') {
      return decodeWebpViaEzgif(input)
    }
    throw ffmpegErr
  }
}

export async function sharpMetadata(buffer) {
  try {
    return await sharp(buffer).metadata()
  } catch {
    const png = await decodeImageToPng(buffer)
    return sharp(png).metadata()
  }
}

export async function sharpResizePng(buffer, width, height) {
  try {
    return await sharp(buffer)
      .resize(width, height, { fit: 'inside' })
      .png()
      .toBuffer()
  } catch {
    const decoded = await decodeImageToPng(buffer)
    return sharp(decoded)
      .resize(width, height, { fit: 'inside' })
      .png()
      .toBuffer()
  }
}
