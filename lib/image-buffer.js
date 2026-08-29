import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import { fileTypeFromBuffer } from 'file-type'
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

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    proc.stderr.on('data', chunk => {
      err += chunk.toString()
    })
    proc.on('error', reject)
    proc.on('close', code => {
      if (code === 0) resolve()
      else reject(new Error(err.trim() || `ffmpeg salió con código ${code}`))
    })
  })
}

/** Convierte a JPEG (más compatible que PNG en servidores sin encoder png). */
async function decodeViaFfmpeg(input, ext = 'img') {
  ensureTmp()
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const inPath = path.join(TMP, `dec_in_${id}.${ext}`)
  const outPath = path.join(TMP, `dec_out_${id}.jpg`)
  fs.writeFileSync(inPath, input)

  try {
    await runFfmpeg([
      '-hide_banner',
      '-loglevel', 'error',
      '-y',
      '-i', inPath,
      '-frames:v', '1',
      '-q:v', '2',
      outPath
    ])
    return fs.readFileSync(outPath)
  } finally {
    cleanup(inPath, outPath)
  }
}

async function decodeWebpViaEzgif(input) {
  const url = await webp2png(input)
  if (!url) throw new Error('No se pudo convertir webp')
  const res = await fetch(url)
  if (!res.ok) throw new Error('No se pudo descargar imagen convertida')
  return Buffer.from(await res.arrayBuffer())
}

/**
 * Decodifica imagen/sticker a buffer raster (PNG/JPEG) usable por sharp.
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

  const isWebp = /webp/i.test(mime) || ext === 'webp'

  if (isWebp) {
    try {
      return await decodeWebpViaEzgif(input)
    } catch {}
  }

  try {
    return await decodeViaFfmpeg(input, ext)
  } catch (ffmpegErr) {
    if (isWebp) {
      return decodeWebpViaEzgif(input)
    }
    throw ffmpegErr
  }
}

export async function sharpMetadata(buffer) {
  try {
    const { Jimp } = await import('jimp')
    const img = await Jimp.read(buffer)
    return { width: img.bitmap.width, height: img.bitmap.height }
  } catch {
    const decoded = await decodeImageToPng(buffer)
    const { Jimp } = await import('jimp')
    const img = await Jimp.read(decoded)
    return { width: img.bitmap.width, height: img.bitmap.height }
  }
}

export async function sharpResizePng(buffer, width, height) {
  const { Jimp } = await import('jimp')
  const decoded = await decodeImageToPng(buffer)
  const img = await Jimp.read(decoded)
  img.resize({ w: width, h: height })
  return img.getBuffer('image/png')
}
