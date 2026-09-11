import { mkdir, writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import fetch from 'node-fetch'
import sharp from '../lib/sharp.js'
import { webp2png } from '../lib/webp2mp4.js'

const LADO_MAX = 4096
const ESCALA_MAX = 4

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

function limitarEscala(valor) {
  return Math.min(ESCALA_MAX, Math.max(1, valor))
}

function escalaAuto(anchoOrig, altoOrig) {
  const ladoMax = Math.max(anchoOrig || 1, altoOrig || 1)

  if (ladoMax >= 2200) return 1.25
  if (ladoMax >= 1600) return 1.5
  if (ladoMax >= 1000) return 1.75
  if (ladoMax < 500) return 2.5
  return 2
}

function parsearEscala(args, anchoOrig, altoOrig) {
  const entrada = (args.join(' ') || '').trim().toLowerCase()
  if (!entrada) return escalaAuto(anchoOrig, altoOrig)

  const coincidenciaX = entrada.match(/^(\d(?:\.\d)?)x$/)
  if (coincidenciaX) return limitarEscala(Number(coincidenciaX[1]))

  if (/^\d+(?:\.\d)?$/.test(entrada)) return limitarEscala(Number(entrada))

  return escalaAuto(anchoOrig, altoOrig)
}

function calcularDimsSalida(anchoOrig, altoOrig, escala) {
  let ancho = Math.round((anchoOrig || 1) * escala)
  let alto = Math.round((altoOrig || 1) * escala)

  if (ancho > LADO_MAX || alto > LADO_MAX) {
    const ratio = Math.min(LADO_MAX / ancho, LADO_MAX / alto)
    ancho = Math.round(ancho * ratio)
    alto = Math.round(alto * ratio)
  }

  return { ancho, alto, escala }
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

async function mejorarAHd(bufer, dims) {
  const resultado = await sharp(bufer)
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
        text: `*[❗] Enviá una *imagen* o *sticker* con el comando, o respondé a uno con ${usedPrefix + command}*\n\nEjemplos:\n> ${usedPrefix + command}\n> ${usedPrefix + command} 2x\n> ${usedPrefix + command} 3`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    const mime = (objetivo.msg || objetivo).mimetype || objetivo.mediaType || ''
    const medio = await objetivo.download()
    if (!medio?.length) throw new Error('No se pudo descargar la imagen')

    const fuente = await cargarBuferImagen(medio, mime)
    const metaFuente = await sharp(fuente).metadata()
    const escala = parsearEscala(args, metaFuente.width, metaFuente.height)
    const dims = calcularDimsSalida(metaFuente.width, metaFuente.height, escala)
    const { bufer, ancho, alto } = await mejorarAHd(fuente, dims)

    const dirTmp = join(process.cwd(), 'tmp')
    if (!existsSync(dirTmp)) await mkdir(dirTmp, { recursive: true })

    rutaTmp = join(dirTmp, `hd_${Date.now()}.jpg`)
    await writeFile(rutaTmp, bufer)

    const leyenda = `*[✓] Imagen mejorada (HD)*\n> Original: ${metaFuente.width}×${metaFuente.height} (${formatearTamano(medio.length)})\n> Mejorada: ${ancho}×${alto} (${formatearTamano(bufer.length)})\n> Escala: ×${escala.toFixed(2).replace(/\.00$/, '')}`

    await conn.sendMessage(m.chat, {
      image: { url: rutaTmp },
      caption: leyenda,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  } catch (e) {
    console.error('[hd] Error:', e)
    conn.sendMessage(m.chat, {
      text: `*[❌] Error al mejorar la imagen: ${e.message || 'desconocido'}*`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  } finally {
    if (rutaTmp) {
      try { await unlink(rutaTmp) } catch {}
    }
  }
}

handler.help = ['#hd + {imagen/sticker con caption o respondiendo} → mejora nitidez y calidad']
handler.tags = ['herramientas']
handler.command = ['hd', 'mejorar', 'nitidez', 'enhd', 'calidad', 'upscale']

export default handler
