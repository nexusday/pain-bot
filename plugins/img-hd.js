import { mkdir, writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import fetch from 'node-fetch'
import sharp from 'sharp'
import { webp2png } from '../lib/webp2mp4.js'

const MAX_SIDE = 4096
const MAX_SCALE = 4

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

function clampScale(value) {
  return Math.min(MAX_SCALE, Math.max(1, value))
}

function autoScale(origW, origH) {
  const maxSide = Math.max(origW || 1, origH || 1)

  if (maxSide >= 2200) return 1.25
  if (maxSide >= 1600) return 1.5
  if (maxSide >= 1000) return 1.75
  if (maxSide < 500) return 2.5
  return 2
}

function parseScale(args, origW, origH) {
  const input = (args.join(' ') || '').trim().toLowerCase()
  if (!input) return autoScale(origW, origH)

  const xMatch = input.match(/^(\d(?:\.\d)?)x$/)
  if (xMatch) return clampScale(Number(xMatch[1]))

  if (/^\d+(?:\.\d)?$/.test(input)) return clampScale(Number(input))

  return autoScale(origW, origH)
}

function calcOutputDims(origW, origH, scale) {
  let width = Math.round((origW || 1) * scale)
  let height = Math.round((origH || 1) * scale)

  if (width > MAX_SIDE || height > MAX_SIDE) {
    const ratio = Math.min(MAX_SIDE / width, MAX_SIDE / height)
    width = Math.round(width * ratio)
    height = Math.round(height * ratio)
  }

  return { width, height, scale }
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

async function enhanceToHd(buffer, dims) {
  const out = await sharp(buffer)
    .rotate()
    .median(3)
    .normalize()
    .modulate({ brightness: 1.03, saturation: 1.1 })
    .sharpen({ sigma: 1.35, m1: 0.55, m2: 0.4 })
    .resize(dims.width, dims.height, {
      kernel: sharp.kernel.lanczos3,
      fit: 'fill',
      withoutEnlargement: false
    })
    .jpeg({ quality: 96, chromaSubsampling: '4:4:4' })
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
        text: `*[❗] Enviá una *imagen* o *sticker* con el comando, o respondé a uno con ${usedPrefix + command}*\n\nEjemplos:\n> ${usedPrefix + command}\n> ${usedPrefix + command} 2x\n> ${usedPrefix + command} 3`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    const mime = (target.msg || target).mimetype || target.mediaType || ''
    const media = await target.download()
    if (!media?.length) throw new Error('No se pudo descargar la imagen')

    const source = await loadImageBuffer(media, mime)
    const sourceMeta = await sharp(source).metadata()
    const scale = parseScale(args, sourceMeta.width, sourceMeta.height)
    const dims = calcOutputDims(sourceMeta.width, sourceMeta.height, scale)
    const { buffer, width, height } = await enhanceToHd(source, dims)

    const tmpDir = join(process.cwd(), 'tmp')
    if (!existsSync(tmpDir)) await mkdir(tmpDir, { recursive: true })

    tmpPath = join(tmpDir, `hd_${Date.now()}.jpg`)
    await writeFile(tmpPath, buffer)

    const caption = `*[✓] Imagen mejorada (HD)*\n> Original: ${sourceMeta.width}×${sourceMeta.height} (${formatSize(media.length)})\n> Mejorada: ${width}×${height} (${formatSize(buffer.length)})\n> Escala: ×${scale.toFixed(2).replace(/\.00$/, '')}`

    await conn.sendMessage(m.chat, {
      image: { url: tmpPath },
      caption,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  } catch (e) {
    console.error('[hd] Error:', e)
    conn.sendMessage(m.chat, {
      text: `*[❌] Error al mejorar la imagen: ${e.message || 'desconocido'}*`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  } finally {
    if (tmpPath) {
      try { await unlink(tmpPath) } catch {}
    }
  }
}

handler.help = ['#hd + {imagen/sticker con caption o respondiendo} → mejora nitidez y calidad']
handler.tags = ['herramientas']
handler.command = ['hd', 'mejorar', 'nitidez', 'enhd', 'calidad', 'upscale']

export default handler
