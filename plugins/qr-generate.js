import QRCode from 'qrcode'
import { mkdir, writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import fetch from 'node-fetch'
import FormData from 'form-data'

const MAX_QR_TEXT = 4000

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

async function uploadImage(buffer, mime) {
  const ext = /png/i.test(mime) ? 'png' : /webp/i.test(mime) ? 'webp' : 'jpg'
  const form = new FormData()
  form.append('reqtype', 'fileupload')
  form.append('fileToUpload', buffer, {
    filename: `qrimg_${Date.now()}.${ext}`,
    contentType: mime || 'image/jpeg'
  })

  const res = await fetch('https://catbox.moe/user/api.php', {
    method: 'POST',
    body: form,
    headers: form.getHeaders()
  })

  const url = (await res.text()).trim()
  if (!res.ok || !/^https?:\/\//i.test(url)) {
    throw new Error('No se pudo subir la imagen')
  }

  return url
}

async function downloadImageSource(m) {
  const media = resolveMediaTarget(m)
  if (!media) return null

  const imageBuffer = await media.target.download()
  if (!imageBuffer?.length) throw new Error('No se pudo descargar la imagen')

  return { imageBuffer, mime: media.mime }
}

async function resolveQrContent(m, args) {
  const fromArgs = (args.join(' ') || '').trim()
  const imageSource = await downloadImageSource(m)

  if (imageSource && !fromArgs) {
    const url = await uploadImage(imageSource.imageBuffer, imageSource.mime)
    return { text: url, source: 'image' }
  }

  if (fromArgs) {
    return { text: fromArgs, source: 'args' }
  }

  const fromQuote = (m.quoted?.text || '').trim()
  if (fromQuote) {
    return { text: fromQuote, source: 'caption' }
  }

  return { text: '', source: '' }
}

function previewText(text, max = 120) {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  return `${clean.slice(0, max)}...`
}

async function buildQrImage(text) {
  return QRCode.toBuffer(text, {
    type: 'png',
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 512,
    color: {
      dark: '#000000',
      light: '#FFFFFF'
    }
  })
}

let handler = async (m, { conn, args, usedPrefix, command }) => {
  let tmpPath = ''

  try {
    const { text, source } = await resolveQrContent(m, args)

    if (!text) {
      return conn.sendMessage(m.chat, {
        text: `*[❗] Escribí texto/enlace o respondé a una *imagen* con ${usedPrefix + command}*\n\n> Solo imagen: respondé la foto + ${usedPrefix + command}\n  →  El QR lleva a ese enlace.\n\n> Texto: ${usedPrefix + command} https://google.com`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    if (text.length > MAX_QR_TEXT) {
      return conn.sendMessage(m.chat, {
        text: `*[❗] El contenido es muy largo.* Máximo ${MAX_QR_TEXT} caracteres (tenés ${text.length}).`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    const qrBuffer = await buildQrImage(text)

    const tmpDir = join(process.cwd(), 'tmp')
    if (!existsSync(tmpDir)) await mkdir(tmpDir, { recursive: true })

    tmpPath = join(tmpDir, `qr_${Date.now()}.png`)
    await writeFile(tmpPath, qrBuffer)

    let caption = `*[✓] Código QR generado*\n> ${previewText(text)}`
    if (source === 'image') {
      caption += '\n> Al escanear abre la imagen.'
    }

    await conn.sendMessage(m.chat, {
      image: { url: tmpPath },
      caption,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  } catch (e) {
    console.error('[qr] Error:', e)
    conn.sendMessage(m.chat, {
      text: `*[❌] Error al generar el QR: ${e.message || 'desconocido'}*`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  } finally {
    if (tmpPath) {
      try { await unlink(tmpPath) } catch {}
    }
  }
}

handler.help = ['#ge + {texto/enlace o imagen con caption/respondiendo} → genera un código QR']
handler.tags = ['herramientas']
handler.command = ['ge', 'qr', 'genqr', 'qrcode', 'generarqr']

export default handler
