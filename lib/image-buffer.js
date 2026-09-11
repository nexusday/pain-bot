import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import { fileTypeFromBuffer } from 'file-type'
import { webp2png } from './webp2mp4.js'
import fetch from 'node-fetch'

const TMP = path.join(process.cwd(), 'tmp')

function asegurarTmp() {
  if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true })
}

function limpiar(...archivos) {
  for (const f of archivos) {
    try {
      if (f && fs.existsSync(f)) fs.unlinkSync(f)
    } catch {}
  }
}

function ejecutarFfmpeg(args) {
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
async function decodificarViaFfmpeg(entrada, ext = 'img') {
  asegurarTmp()
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const rutaEntrada = path.join(TMP, `dec_in_${id}.${ext}`)
  const rutaSalida = path.join(TMP, `dec_out_${id}.jpg`)
  fs.writeFileSync(rutaEntrada, entrada)

  try {
    await ejecutarFfmpeg([
      '-hide_banner',
      '-loglevel', 'error',
      '-y',
      '-i', rutaEntrada,
      '-frames:v', '1',
      '-q:v', '2',
      rutaSalida
    ])
    return fs.readFileSync(rutaSalida)
  } finally {
    limpiar(rutaEntrada, rutaSalida)
  }
}

async function decodificarWebpViaEzgif(entrada) {
  const url = await webp2png(entrada)
  if (!url) throw new Error('No se pudo convertir webp')
  const res = await fetch(url)
  if (!res.ok) throw new Error('No se pudo descargar imagen convertida')
  return Buffer.from(await res.arrayBuffer())
}

/**
 * Decodifica imagen/sticker a buffer raster (PNG/JPEG) usable por sharp/jimp.
 */
export async function decodificarImagenAPng(buffer, mimeHint = '') {
  const entrada = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || [])
  if (!entrada.length) throw new Error('Imagen vacía o no válida')

  let ext = 'img'
  let mime = String(mimeHint || '')
  try {
    const detectado = await fileTypeFromBuffer(entrada)
    if (detectado?.ext) ext = detectado.ext
    if (detectado?.mime) mime = detectado.mime
  } catch {}

  const esWebp = /webp/i.test(mime) || ext === 'webp'

  if (esWebp) {
    try {
      return await decodificarWebpViaEzgif(entrada)
    } catch {}
  }

  try {
    return await decodificarViaFfmpeg(entrada, ext)
  } catch (ffmpegErr) {
    if (esWebp) {
      return decodificarWebpViaEzgif(entrada)
    }
    throw ffmpegErr
  }
}

export async function metadatosSharp(buffer) {
  try {
    const { Jimp } = await import('jimp')
    const img = await Jimp.read(buffer)
    return { width: img.bitmap.width, height: img.bitmap.height }
  } catch {
    const decodificado = await decodificarImagenAPng(buffer)
    const { Jimp } = await import('jimp')
    const img = await Jimp.read(decodificado)
    return { width: img.bitmap.width, height: img.bitmap.height }
  }
}

export async function redimensionarPngSharp(buffer, ancho, alto) {
  const { Jimp } = await import('jimp')
  const decodificado = await decodificarImagenAPng(buffer)
  const img = await Jimp.read(decodificado)
  img.resize({ w: ancho, h: alto })
  return img.getBuffer('image/png')
}

export {
  decodificarImagenAPng as decodeImageToPng,
  metadatosSharp as sharpMetadata,
  redimensionarPngSharp as sharpResizePng
}
