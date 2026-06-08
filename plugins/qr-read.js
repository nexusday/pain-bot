import fetch from 'node-fetch'
import sharp from 'sharp'
import jsQR from 'jsqr'
import { webp2png } from '../lib/webp2mp4.js'

function isImageMedia(mime = '', mtype = '') {
  return /image|webp|sticker/i.test(mime) || /imageMessage|stickerMessage/i.test(mtype)
}

function resolveMediaTarget(m) {
  if (m.quoted) {
    const mime = (m.quoted.msg || m.quoted).mimetype || m.quoted.mediaType || ''
    const mtype = m.quoted.mtype || ''
    if (isImageMedia(mime, mtype) && m.quoted.download) {
      return { target: m.quoted, mime, mtype }
    }
  }

  const mime = (m.msg || m).mimetype || m.mediaType || ''
  const mtype = m.mtype || ''
  if (isImageMedia(mime, mtype) && m.download) {
    return { target: m, mime, mtype }
  }

  return null
}

async function toRasterBuffer(media, mime) {
  if (/webp/i.test(mime)) {
    try {
      return sharp(media).rotate().png().toBuffer()
    } catch {
      const url = await webp2png(media)
      if (!url) throw new Error('No se pudo convertir el sticker')
      const res = await fetch(url)
      return Buffer.from(await res.arrayBuffer())
    }
  }

  if (/image\//i.test(mime)) {
    return sharp(media).rotate().png().toBuffer()
  }

  throw new Error('Formato no compatible')
}

async function scanBuffer(buffer) {
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const code = jsQR(new Uint8ClampedArray(data), info.width, info.height)
  return code?.data?.trim() || null
}

async function decodeQr(media, mime) {
  const raster = await toRasterBuffer(media, mime)
  const meta = await sharp(raster).metadata()
  const minSide = Math.min(meta.width || 0, meta.height || 0)

  const variants = [
    raster,
    minSide > 0 && minSide < 900
      ? await sharp(raster).resize({ width: 1200, withoutEnlargement: false }).png().toBuffer()
      : null,
    await sharp(raster).greyscale().normalize().sharpen().png().toBuffer()
  ].filter(Boolean)

  for (const variant of variants) {
    const result = await scanBuffer(variant)
    if (result) return result
  }

  return null
}

function formatResult(text) {
  const maxLen = 4000
  if (text.length <= maxLen) return text
  return `${text.slice(0, maxLen)}\n\n_[Contenido recortado]_`
}

let handler = async (m, { conn, usedPrefix, command }) => {
  try {
    const media = resolveMediaTarget(m)

    if (!media) {
      return conn.sendMessage(m.chat, {
        text: `*[❗] Enviá una *imagen* con el QR, o respondé a una con ${usedPrefix + command}.*\n\nEjemplos:\n> Foto del QR + comando: ${usedPrefix + command}\n> Responder imagen: ${usedPrefix + command}`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    const buffer = await media.target.download()
    if (!buffer?.length) throw new Error('No se pudo descargar la imagen')

    const data = await decodeQr(buffer, media.mime)
    if (!data) {
      return conn.sendMessage(m.chat, {
        text: '*[❗] No se detectó ningún código QR en la imagen. Pruebe con una foto más nítida y con el QR completo.*',
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    const isLink = /^https?:\/\//i.test(data)
    const header = isLink ? 'Enlace detectado:' : 'Contenido del QR:'

    await conn.sendMessage(m.chat, {
      text: `*${header}*\n\n${formatResult(data)}`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  } catch (e) {
    console.error('[leerqr] Error:', e)
    conn.sendMessage(m.chat, {
      text: `*[❌] Error al leer el QR: ${e.message || 'desconocido'}*`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }
}

handler.help = ['#leerqr + {imagen con caption o respondiendo} → lee un código QR']
handler.tags = ['herramientas']
handler.command = ['leerqr', 'qrread', 'readqr', 'scanqr', 'leercodigo']

export default handler
