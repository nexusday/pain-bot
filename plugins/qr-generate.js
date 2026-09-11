import QRCode from 'qrcode'
import { mkdir, writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import fetch from 'node-fetch'
import FormData from 'form-data'

const MAX_TEXTO_QR = 4000

function esMedioImagen(mime = '', mtype = '') {
  return /image|webp|sticker/i.test(mime) || /imageMessage|stickerMessage/i.test(mtype)
}

function resolverObjetivoMedio(m) {
  if (m.quoted) {
    const mime = (m.quoted.msg || m.quoted).mimetype || m.quoted.mediaType || ''
    const mtype = m.quoted.mtype || ''
    if (esMedioImagen(mime, mtype) && m.quoted.download) {
      return { target: m.quoted, mime, mtype }
    }
  }

  const mime = (m.msg || m).mimetype || m.mediaType || ''
  const mtype = m.mtype || ''
  if (esMedioImagen(mime, mtype) && m.download) {
    return { target: m, mime, mtype }
  }

  return null
}

async function subirImagen(bufer, mime) {
  const ext = /png/i.test(mime) ? 'png' : /webp/i.test(mime) ? 'webp' : 'jpg'
  const formulario = new FormData()
  formulario.append('reqtype', 'fileupload')
  formulario.append('fileToUpload', bufer, {
    filename: `qrimg_${Date.now()}.${ext}`,
    contentType: mime || 'image/jpeg'
  })

  const respuesta = await fetch('https://catbox.moe/user/api.php', {
    method: 'POST',
    body: formulario,
    headers: formulario.getHeaders()
  })

  const url = (await respuesta.text()).trim()
  if (!respuesta.ok || !/^https?:\/\//i.test(url)) {
    throw new Error('No se pudo subir la imagen')
  }

  return url
}

async function descargarFuenteImagen(m) {
  const medio = resolverObjetivoMedio(m)
  if (!medio) return null

  const buferImagen = await medio.target.download()
  if (!buferImagen?.length) throw new Error('No se pudo descargar la imagen')

  return { buferImagen, mime: medio.mime }
}

async function resolverContenidoQr(m, args) {
  const desdeArgs = (args.join(' ') || '').trim()
  const fuenteImagen = await descargarFuenteImagen(m)

  if (fuenteImagen && !desdeArgs) {
    const url = await subirImagen(fuenteImagen.imageBuffer, fuenteImagen.mime)
    return { text: url, source: 'image' }
  }

  if (desdeArgs) {
    return { text: desdeArgs, source: 'args' }
  }

  const desdeCita = (m.quoted?.text || '').trim()
  if (desdeCita) {
    return { text: desdeCita, source: 'caption' }
  }

  return { text: '', source: '' }
}

function textoVistaPrevia(text, max = 120) {
  const limpio = text.replace(/\s+/g, ' ').trim()
  if (limpio.length <= max) return limpio
  return `${limpio.slice(0, max)}...`
}

async function construirImagenQr(text) {
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
  let rutaTmp = ''

  try {
    const { text, fuente } = await resolverContenidoQr(m, args)

    if (!text) {
      return conn.sendMessage(m.chat, {
        text: `*[❗] Escribí texto/enlace o respondé a una *imagen* con ${usedPrefix + command}*\n\n> Solo imagen: respondé la foto + ${usedPrefix + command}\n  →  El QR lleva a ese enlace.\n\n> Texto: ${usedPrefix + command} https://google.com`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    if (text.length > MAX_TEXTO_QR) {
      return conn.sendMessage(m.chat, {
        text: `*[❗] El contenido es muy largo.* Máximo ${MAX_TEXTO_QR} caracteres (tenés ${text.length}).`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    const buferQr = await construirImagenQr(text)

    const dirTmp = join(process.cwd(), 'tmp')
    if (!existsSync(dirTmp)) await mkdir(dirTmp, { recursive: true })

    rutaTmp = join(dirTmp, `qr_${Date.now()}.png`)
    await writeFile(rutaTmp, buferQr)

    let leyenda = `*[✓] Código QR generado*\n> ${textoVistaPrevia(text)}`
    if (fuente === 'image') {
      leyenda += '\n> Al escanear abre la imagen.'
    }

    await conn.sendMessage(m.chat, {
      image: { url: rutaTmp },
      caption: leyenda,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  } catch (e) {
    console.error('[qr] Error:', e)
    conn.sendMessage(m.chat, {
      text: `*[❌] Error al generar el QR: ${e.message || 'desconocido'}*`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  } finally {
    if (rutaTmp) {
      try { await unlink(rutaTmp) } catch {}
    }
  }
}

handler.help = ['#ge + {texto/enlace o imagen con caption/respondiendo} → genera un código QR']
handler.tags = ['herramientas']
handler.command = ['ge', 'qr', 'genqr', 'qrcode', 'generarqr']

export default handler
