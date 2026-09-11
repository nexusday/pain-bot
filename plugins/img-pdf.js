import { mkdir, writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import fetch from 'node-fetch'
import sharp from '../lib/sharp.js'
import { PDFDocument } from 'pdf-lib'
import { webp2png } from '../lib/webp2mp4.js'

function esMedioImagen(mime = '', mtype = '') {
  return /image|webp|sticker/i.test(mime) || /imageMessage|stickerMessage/i.test(mtype)
}

function resolverObjetivoMedio(m) {
  if (m.quoted) {
    const mime = (m.quoted.msg || m.quoted).mimetype || m.quoted.mediaType || ''
    const mtype = m.quoted.mtype || ''
    if (esMedioImagen(mime, mtype) && m.quoted.download) return m.quoted
  }

  const mime = (m.msg || m).mimetype || m.mediaType || ''
  const mtype = m.mtype || ''
  if (esMedioImagen(mime, mtype) && m.download) return m

  return null
}

function sanitizarNombrePdf(args) {
  const crudo = (args.join(' ') || 'documento')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .trim()
    .slice(0, 80)

  const nombre = crudo || 'documento'
  return nombre.toLowerCase().endsWith('.pdf') ? nombre : `${nombre}.pdf`
}

async function aBuferRaster(medio, mime) {
  if (/webp/i.test(mime)) {
    try {
      return await sharp(medio).rotate().jpeg({ quality: 92 }).toBuffer()
    } catch {
      const url = await webp2png(medio)
      if (!url) throw new Error('No se pudo convertir el sticker')
      const respuesta = await fetch(url)
      return Buffer.from(await respuesta.arrayBuffer())
    }
  }

  if (/image\/jpe?g/i.test(mime)) {
    return sharp(medio).rotate().jpeg({ quality: 92 }).toBuffer()
  }

  if (/image\//i.test(mime)) {
    return sharp(medio).rotate().png().toBuffer()
  }

  throw new Error('Formato no compatible')
}

async function buferImagenAPdf(bufer, mime) {
  const raster = await aBuferRaster(bufer, mime)
  const metadatos = await sharp(raster).metadata()
  const ancho = metadatos.width || 595
  const alto = metadatos.height || 842

  const docPdf = await PDFDocument.create()
  const imagen = metadatos.format === 'jpeg'
    ? await docPdf.embedJpg(raster)
    : await docPdf.embedPng(raster)

  const pagina = docPdf.addPage([ancho, alto])
  pagina.drawImage(imagen, { x: 0, y: 0, ancho, alto })

  return docPdf.save()
}

let handler = async (m, { conn, args, usedPrefix, command }) => {
  let rutaPdf = ''

  try {
    const objetivo = resolverObjetivoMedio(m)

    if (!objetivo) {
      return conn.sendMessage(m.chat, {
        text: `*[❗] Enviá una *imagen* o *sticker* con el comando, o respondé a uno con ${usedPrefix + command} nombre*\n\nEjemplos:\n> Foto + mensaje: ${usedPrefix + command} Mi documento\n> Responder imagen: ${usedPrefix + command} Apuntes`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    const mime = (objetivo.msg || objetivo).mimetype || objetivo.mediaType || ''
    const medio = await objetivo.download()
    if (!medio?.length) throw new Error('No se pudo descargar la imagen')

    const fileName = sanitizarNombrePdf(args)
    const bytesPdf = Buffer.from(await buferImagenAPdf(medio, mime))
    if (!bytesPdf.length) throw new Error('El PDF generado está vacío')

    const dirTmp = join(process.cwd(), 'tmp')
    if (!existsSync(dirTmp)) await mkdir(dirTmp, { recursive: true })

    rutaPdf = join(dirTmp, `pdf_${Date.now()}_${fileName}`)
    await writeFile(rutaPdf, bytesPdf)

    await conn.sendMessage(m.chat, {
      document: { url: rutaPdf },
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
    if (rutaPdf) {
      try { await unlink(rutaPdf) } catch {}
    }
  }
}

handler.help = ['#pdf + {imagen/sticker con caption o respondiendo} nombre → convierte a PDF']
handler.tags = ['herramientas']
handler.command = ['pdf', 'imgpdf', 'topdf', 'imagenpdf']

export default handler
