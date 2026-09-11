import fetch from 'node-fetch'
import sharp from '../lib/sharp.js'
import jsQR from 'jsqr'
import { webp2png } from '../lib/webp2mp4.js'

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

async function aBuferRaster(medio, mime) {
  if (/webp/i.test(mime)) {
    try {
      return sharp(medio).rotate().png().toBuffer()
    } catch {
      const url = await webp2png(medio)
      if (!url) throw new Error('No se pudo convertir el sticker')
      const respuesta = await fetch(url)
      return Buffer.from(await respuesta.arrayBuffer())
    }
  }

  if (/image\//i.test(mime)) {
    return sharp(medio).rotate().png().toBuffer()
  }

  throw new Error('Formato no compatible')
}

async function escanearBufer(bufer) {
  const { datos, informacion } = await sharp(bufer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const code = jsQR(new Uint8ClampedArray(datos), informacion.width, informacion.height)
  return code?.data?.trim() || null
}

async function decodificarQr(medio, mime) {
  const raster = await aBuferRaster(medio, mime)
  const metadatos = await sharp(raster).metadata()
  const ladoMin = Math.min(metadatos.width || 0, metadatos.height || 0)

  const variantes = [
    raster,
    ladoMin > 0 && ladoMin < 900
      ? await sharp(raster).resize({ width: 1200, withoutEnlargement: false }).png().toBuffer()
      : null,
    await sharp(raster).greyscale().normalize().sharpen().png().toBuffer()
  ].filter(Boolean)

  for (const variante of variantes) {
    const resultado = await escanearBufer(variante)
    if (resultado) return resultado
  }

  return null
}

function formatearResultado(text) {
  const longitudMax = 4000
  if (text.length <= longitudMax) return text
  return `${text.slice(0, longitudMax)}\n\n_[Contenido recortado]_`
}

let handler = async (m, { conn, usedPrefix, command }) => {
  try {
    const medio = resolverObjetivoMedio(m)

    if (!medio) {
      return conn.sendMessage(m.chat, {
        text: `*[❗] Enviá una *imagen* con el QR, o respondé a una con ${usedPrefix + command}.*\n\nEjemplos:\n> Foto del QR + comando: ${usedPrefix + command}\n> Responder imagen: ${usedPrefix + command}`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    const bufer = await medio.target.download()
    if (!bufer?.length) throw new Error('No se pudo descargar la imagen')

    const datos = await decodificarQr(bufer, medio.mime)
    if (!datos) {
      return conn.sendMessage(m.chat, {
        text: '*[❗] No se detectó ningún código QR en la imagen. Pruebe con una foto más nítida y con el QR completo.*',
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    const esEnlace = /^https?:\/\//i.test(datos)
    const encabezado = esEnlace ? 'Enlace detectado:' : 'Contenido del QR:'

    await conn.sendMessage(m.chat, {
      text: `*${encabezado}*\n\n${formatearResultado(datos)}`,
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
