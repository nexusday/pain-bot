import { mkdir, writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import fetch from 'node-fetch'
import sharp from '../lib/sharp.js'
import { webp2png } from '../lib/webp2mp4.js'

const LADO_MAX = 4096
const LADO_MIN = 16

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

function limitarDims(ancho, alto) {
  let w = Math.max(LADO_MIN, Math.min(LADO_MAX, ancho))
  let h = Math.max(LADO_MIN, Math.min(LADO_MAX, alto))

  if (ancho > LADO_MAX || alto > LADO_MAX) {
    const ratio = Math.min(LADO_MAX / ancho, LADO_MAX / alto)
    w = Math.max(LADO_MIN, Math.round(ancho * ratio))
    h = Math.max(LADO_MIN, Math.round(alto * ratio))
  }

  return { width: w, height: h }
}

function parsearArgsRedimension(args, anchoOrig, altoOrig) {
  const entrada = (args.join(' ') || '').trim().toLowerCase()
  if (!entrada || !anchoOrig || !altoOrig) return null

  const coincidenciaPct = entrada.match(/^(\d{1,3})%$/)
  if (coincidenciaPct) {
    const pct = Math.min(500, Math.max(1, Number(coincidenciaPct[1])))
    return limitarDims(
      Math.round(anchoOrig * pct / 100),
      Math.round(altoOrig * pct / 100)
    )
  }

  const coincidenciaDim = entrada.match(/^(\d*)x(\d*)$/i)
  if (coincidenciaDim) {
    let ancho = coincidenciaDim[1] ? Number(coincidenciaDim[1]) : 0
    let alto = coincidenciaDim[2] ? Number(coincidenciaDim[2]) : 0
    if (!ancho && !alto) return null

    if (ancho && !alto) {
      alto = Math.round(altoOrig * (ancho / anchoOrig))
    } else if (alto && !ancho) {
      ancho = Math.round(anchoOrig * (alto / altoOrig))
    }

    return limitarDims(ancho, alto)
  }

  if (/^\d+$/.test(entrada)) {
    const ancho = Number(entrada)
    const alto = Math.round(altoOrig * (ancho / anchoOrig))
    return limitarDims(ancho, alto)
  }

  return null
}

async function cargarBuferImagen(medio, mime) {
  if (/webp/i.test(mime)) {
    try {
      return await sharp(medio).rotate().toBuffer()
    } catch {
      const url = await webp2png(medio)
      if (!url) throw new Error('No se pudo convertir el sticker')
      const respuesta = await fetch(url)
      return Buffer.from(await respuesta.arrayBuffer())
    }
  }

  if (/image\//i.test(mime)) {
    return sharp(medio).rotate().toBuffer()
  }

  throw new Error('Formato no compatible')
}

async function redimensionarImagen(bufer, dims) {
  const resultado = await sharp(bufer)
    .resize({
      width: dims.width,
      height: dims.height,
      fit: 'inside',
      withoutEnlargement: false
    })
    .jpeg({ quality: 90 })
    .toBuffer()

  const metadatos = await sharp(resultado).metadata()
  return { buffer: resultado, width: metadatos.width, height: metadatos.height }
}

function formatearTamano(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

let handler = async (m, { conn, args, usedPrefix, command }) => {
  let rutaTmp = ''

  try {
    const objetivo = resolverObjetivoMedio(m)

    if (!objetivo) {
      return conn.sendMessage(m.chat, {
        text: `*[❗] Enviá una *imagen* o *sticker* con el comando, o respondé a uno con ${usedPrefix + command} tamaño*\n\nEjemplos:\n> ${usedPrefix + command} 800\n> ${usedPrefix + command} 800x600\n> ${usedPrefix + command} x600\n> ${usedPrefix + command} 50%`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    const mime = (objetivo.msg || objetivo).mimetype || objetivo.mediaType || ''
    const medio = await objetivo.download()
    if (!medio?.length) throw new Error('No se pudo descargar la imagen')

    const fuente = await cargarBuferImagen(medio, mime)
    const metaFuente = await sharp(fuente).metadata()
    const dims = parsearArgsRedimension(args, metaFuente.width, metaFuente.height)

    if (!dims) {
      return conn.sendMessage(m.chat, {
        text: `*[❗] Indicá el tamaño deseado.*\n\nFormatos:\n> ${usedPrefix + command} 800 → ancho 800px\n> ${usedPrefix + command} x600 → alto 600px\n> ${usedPrefix + command} 800x600 → máximo 800×600\n> ${usedPrefix + command} 50% → escala al 50%`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    const { bufer, ancho, alto } = await redimensionarImagen(fuente, dims)

    const dirTmp = join(process.cwd(), 'tmp')
    if (!existsSync(dirTmp)) await mkdir(dirTmp, { recursive: true })

    rutaTmp = join(dirTmp, `resize_${Date.now()}.jpg`)
    await writeFile(rutaTmp, bufer)

    const leyenda = `*[✓] Imagen redimensionada*\n> Original: ${metaFuente.width}×${metaFuente.height} (${formatearTamano(medio.length)})\n> Nuevo: ${ancho}×${alto} (${formatearTamano(bufer.length)})`

    await conn.sendMessage(m.chat, {
      image: { url: rutaTmp },
      caption: leyenda,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  } catch (e) {
    console.error('[resize] Error:', e)
    conn.sendMessage(m.chat, {
      text: `*[❌] Error al redimensionar: ${e.message || 'desconocido'}*`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  } finally {
    if (rutaTmp) {
      try { await unlink(rutaTmp) } catch {}
    }
  }
}

handler.help = ['#resize + {imagen/sticker con caption o respondiendo} tamaño → cambia el tamaño de la imagen']
handler.tags = ['herramientas']
handler.command = ['resize', 'redimensionar', 'rs', 'tamaño', 'tamano']

export default handler
