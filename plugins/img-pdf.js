import { mkdir, writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import fetch from 'node-fetch'
import sharp from 'sharp'
import { PDFDocument } from 'pdf-lib'
import { webp2png } from '../lib/webp2mp4.js'

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

function sanitizePdfName(args) {
  const raw = (args.join(' ') || 'documento')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .trim()
    .slice(0, 80)

  const name = raw || 'documento'
  return name.toLowerCase().endsWith('.pdf') ? name : `${name}.pdf`
}

async function toRasterBuffer(media, mime) {
  if (/webp/i.test(mime)) {
    try {
      return await sharp(media).rotate().jpeg({ quality: 92 }).toBuffer()
    } catch {
      const url = await webp2png(media)
      if (!url) throw new Error('No se pudo convertir el sticker')
      const res = await fetch(url)
      return Buffer.from(await res.arrayBuffer())
    }
  }

  if (/image\/jpe?g/i.test(mime)) {
    return sharp(media).rotate().jpeg({ quality: 92 }).toBuffer()
  }

  if (/image\//i.test(mime)) {
    return sharp(media).rotate().png().toBuffer()
  }

  throw new Error('Formato no compatible')
}

async function imageBufferToPdf(buffer, mime) {
  const raster = await toRasterBuffer(buffer, mime)
  const meta = await sharp(raster).metadata()
  const width = meta.width || 595
  const height = meta.height || 842

  const pdfDoc = await PDFDocument.create()
  const image = meta.format === 'jpeg'
    ? await pdfDoc.embedJpg(raster)
    : await pdfDoc.embedPng(raster)

  const page = pdfDoc.addPage([width, height])
  page.drawImage(image, { x: 0, y: 0, width, height })

  return pdfDoc.save()
}

let handler = async (m, { conn, args, usedPrefix, command }) => {
  let pdfPath = ''

  try {
    const target = resolveMediaTarget(m)

    if (!target) {
      return conn.sendMessage(m.chat, {
        text: `*[❗] Enviá una *imagen* o *sticker* con el comando, o respondé a uno con ${usedPrefix + command} nombre*\n\nEjemplos:\n> Foto + mensaje: ${usedPrefix + command} Mi documento\n> Responder imagen: ${usedPrefix + command} Apuntes`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    const mime = (target.msg || target).mimetype || target.mediaType || ''
    const media = await target.download()
    if (!media?.length) throw new Error('No se pudo descargar la imagen')

    const fileName = sanitizePdfName(args)
    const pdfBytes = Buffer.from(await imageBufferToPdf(media, mime))
    if (!pdfBytes.length) throw new Error('El PDF generado está vacío')

    const tmpDir = join(process.cwd(), 'tmp')
    if (!existsSync(tmpDir)) await mkdir(tmpDir, { recursive: true })

    pdfPath = join(tmpDir, `pdf_${Date.now()}_${fileName}`)
    await writeFile(pdfPath, pdfBytes)

    await conn.sendMessage(m.chat, {
      document: { url: pdfPath },
      fileName,
      mimetype: 'application/pdf',
      caption: `*[✓] PDF generado:* ${fileName}`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  } catch (e) {
    console.error('[pdf] Error:', e)
    conn.sendMessage(m.chat, {
      text: `*[❌] Error al crear el PDF: ${e.message || 'desconocido'}*`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  } finally {
    if (pdfPath) {
      try { await unlink(pdfPath) } catch {}
    }
  }
}

handler.help = ['#pdf + {imagen/sticker con caption o respondiendo} nombre → convierte a PDF']
handler.tags = ['herramientas']
handler.command = ['pdf', 'imgpdf', 'topdf', 'imagenpdf']

export default handler
