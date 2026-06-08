import { mkdir, writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import fetch from 'node-fetch'
import sharp from 'sharp'
import { webp2png } from '../lib/webp2mp4.js'

const MAX_SIDE = 4096
const MIN_SIDE = 16

function isImageMedia(mime = '', mtype = '') {
  return /image|webp|sticker/i.test(mime) || /imageMessage|stickerMessage/i.test(mtype)
}

function resolveMediaTarget(m) {
  if (m.quoted) {
    const mime = (m.quoted.msg || m.quoted).mimetype || m.quoted.mediaType || ''
    const mtype = m.quoted.mtype || ''
    if (isImageMedia(mime, mtype) && m.quoted.download) return m.quoted
  }

  const mime = (m.msg || m).mimetype || m.mediaType || ''
  const mtype = m.mtype || ''
  if (isImageMedia(mime, mtype) && m.download) return m

  return null
}

function clampDims(width, height) {
  let w = Math.max(MIN_SIDE, Math.min(MAX_SIDE, width))
  let h = Math.max(MIN_SIDE, Math.min(MAX_SIDE, height))

  if (width > MAX_SIDE || height > MAX_SIDE) {
    const ratio = Math.min(MAX_SIDE / width, MAX_SIDE / height)
    w = Math.max(MIN_SIDE, Math.round(width * ratio))
    h = Math.max(MIN_SIDE, Math.round(height * ratio))
  }

  return { width: w, height: h }
}

function parseResizeArgs(args, origW, origH) {
  const input = (args.join(' ') || '').trim().toLowerCase()
  if (!input || !origW || !origH) return null

  const pctMatch = input.match(/^(\d{1,3})%$/)
  if (pctMatch) {
    const pct = Math.min(500, Math.max(1, Number(pctMatch[1])))
    return clampDims(
      Math.round(origW * pct / 100),
      Math.round(origH * pct / 100)
    )
  }

  const dimMatch = input.match(/^(\d*)x(\d*)$/i)
  if (dimMatch) {
    let width = dimMatch[1] ? Number(dimMatch[1]) : 0
    let height = dimMatch[2] ? Number(dimMatch[2]) : 0
    if (!width && !height) return null

    if (width && !height) {
      height = Math.round(origH * (width / origW))
    } else if (height && !width) {
      width = Math.round(origW * (height / origH))
    }

    return clampDims(width, height)
  }

  if (/^\d+$/.test(input)) {
    const width = Number(input)
    const height = Math.round(origH * (width / origW))
    return clampDims(width, height)
  }

  return null
}

async function loadImageBuffer(media, mime) {
  if (/webp/i.test(mime)) {
    try {
      return await sharp(media).rotate().toBuffer()
    } catch {
      const url = await webp2png(media)
      if (!url) throw new Error('No se pudo convertir el sticker')
      const res = await fetch(url)
      return Buffer.from(await res.arrayBuffer())
    }
  }

  if (/image\//i.test(mime)) {
    return sharp(media).rotate().toBuffer()
  }

  throw new Error('Formato no compatible')
}

async function resizeImage(buffer, dims) {
  const out = await sharp(buffer)
    .resize({
      width: dims.width,
      height: dims.height,
      fit: 'inside',
      withoutEnlargement: false
    })
    .jpeg({ quality: 90 })
    .toBuffer()

  const meta = await sharp(out).metadata()
  return { buffer: out, width: meta.width, height: meta.height }
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

let handler = async (m, { conn, args, usedPrefix, command }) => {
  let tmpPath = ''

  try {
    const target = resolveMediaTarget(m)

    if (!target) {
      return conn.sendMessage(m.chat, {
        text: `*[❗] Enviá una *imagen* o *sticker* con el comando, o respondé a uno con ${usedPrefix + command} tamaño*\n\nEjemplos:\n> ${usedPrefix + command} 800\n> ${usedPrefix + command} 800x600\n> ${usedPrefix + command} x600\n> ${usedPrefix + command} 50%`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    const mime = (target.msg || target).mimetype || target.mediaType || ''
    const media = await target.download()
    if (!media?.length) throw new Error('No se pudo descargar la imagen')

    const source = await loadImageBuffer(media, mime)
    const sourceMeta = await sharp(source).metadata()
    const dims = parseResizeArgs(args, sourceMeta.width, sourceMeta.height)

    if (!dims) {
      return conn.sendMessage(m.chat, {
        text: `*[❗] Indicá el tamaño deseado.*\n\nFormatos:\n> ${usedPrefix + command} 800 → ancho 800px\n> ${usedPrefix + command} x600 → alto 600px\n> ${usedPrefix + command} 800x600 → máximo 800×600\n> ${usedPrefix + command} 50% → escala al 50%`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    const { buffer, width, height } = await resizeImage(source, dims)

    const tmpDir = join(process.cwd(), 'tmp')
    if (!existsSync(tmpDir)) await mkdir(tmpDir, { recursive: true })

    tmpPath = join(tmpDir, `resize_${Date.now()}.jpg`)
    await writeFile(tmpPath, buffer)

    const caption = `*[✓] Imagen redimensionada*\n> Original: ${sourceMeta.width}×${sourceMeta.height} (${formatSize(media.length)})\n> Nuevo: ${width}×${height} (${formatSize(buffer.length)})`

    await conn.sendMessage(m.chat, {
      image: { url: tmpPath },
      caption,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  } catch (e) {
    console.error('[resize] Error:', e)
    conn.sendMessage(m.chat, {
      text: `*[❌] Error al redimensionar: ${e.message || 'desconocido'}*`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  } finally {
    if (tmpPath) {
      try { await unlink(tmpPath) } catch {}
    }
  }
}

handler.help = ['#resize + {imagen/sticker con caption o respondiendo} tamaño → cambia el tamaño de la imagen']
handler.tags = ['herramientas']
handler.command = ['resize', 'redimensionar', 'rs', 'tamaño', 'tamano']

export default handler
