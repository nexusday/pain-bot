import { mkdir, writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import sharp from '../lib/sharp.js'
import { createWorker } from 'tesseract.js'
import { webp2png } from '../lib/webp2mp4.js'

const MAPA_IDIOMAS = {
  es: 'spa',
  spa: 'spa',
  en: 'eng',
  eng: 'eng',
  pt: 'por',
  por: 'por',
  fr: 'fra',
  fra: 'fra'
}

let instanciaTrabajador = null
let idiomaTrabajador = ''

async function obtenerTrabajador(idioma = 'spa+eng') {
  if (instanciaTrabajador && idiomaTrabajador === idioma) return instanciaTrabajador

  if (instanciaTrabajador) {
    try { await instanciaTrabajador.terminate() } catch {}
    instanciaTrabajador = null
  }

  instanciaTrabajador = await createWorker(idioma, 1, {
    logger: () => {}
  })
  await instanciaTrabajador.setParameters({
    tessedit_pageseg_mode: '3',
    preserve_interword_spaces: '1'
  })
  idiomaTrabajador = idioma
  return instanciaTrabajador
}

function limpiarLinea(linea) {
  return linea
    .replace(/\s+/g, ' ')
    .replace(/^[^a-zA-ZáéíóúñÁÉÍÓÚÑ0-9¿¡]{1,4}\s*/u, '')
    .replace(/([a-zA-ZáéíóúñÁÉÍÓÚÑ])\s*[=|/\\]{1,2}\s*/gu, '$1 ')
    .replace(/\s*[=|]{2,}\s*/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim()
}

function esTokenLegible(token) {
  if (!token) return false
  const letras = (token.match(/[\p{L}\p{N}]/gu) || []).length
  if (letras === 0) return false
  if (token.length <= 2 && letras / token.length < 0.6) return false
  return letras / token.length >= 0.45
}

function reconstruirPorLineas(palabras) {
  if (!palabras.length) return ''

  const ordenados = [...palabras].sort((a, b) => {
    const dy = (a.bbox?.y0 || 0) - (b.bbox?.y0 || 0)
    if (Math.abs(dy) > 14) return dy
    return (a.bbox?.x0 || 0) - (b.bbox?.x0 || 0)
  })

  const lineas = []
  let actual = []
  let ultimaY = ordenados[0].bbox?.y0 || 0

  for (const palabra of ordenados) {
    const y = palabra.bbox?.y0 || 0
    if (Math.abs(y - ultimaY) > 16 && actual.length) {
      lineas.push(limpiarLinea(actual.join(' ')))
      actual = []
    }
    actual.push(palabra.text.trim())
    ultimaY = y
  }

  if (actual.length) lineas.push(limpiarLinea(actual.join(' ')))

  return lineas.filter((linea) => {
    if (!linea) return false
    const letras = (linea.match(/[\p{L}\p{N}]/gu) || []).length
    return letras >= 3 && letras / linea.length >= 0.5
  }).join('\n')
}

function extraerTextoLimpio(datos) {
  const confianzaMin = 58
  const palabras = (datos.words || []).filter((w) => {
    const confianza = w.confidence ?? 0
    const token = (w.text || '').trim()
    return confianza >= confianzaMin && esTokenLegible(token)
  })

  if (palabras.length >= 2) {
    const reconstruido = reconstruirPorLineas(palabras)
    if (reconstruido.trim()) return reconstruido.trim()
  }

  return (datos.text || '')
    .split('\n')
    .map(limpiarLinea)
    .filter((linea) => {
      if (!linea) return false
      const letras = (linea.match(/[\p{L}\p{N}]/gu) || []).length
      return letras >= 3 && letras / linea.length >= 0.45
    })
    .join('\n')
    .trim()
}

async function aBuferImagen(medio, mime) {
  let bufer

  if (/webp/i.test(mime)) {
    try {
      bufer = await sharp(medio).png().toBuffer()
    } catch {
      const url = await webp2png(medio)
      if (!url) throw new Error('No se pudo convertir webp')
      const respuesta = await fetch(url)
      bufer = Buffer.from(await respuesta.arrayBuffer())
    }
  } else if (/image\//i.test(mime)) {
    bufer = await sharp(medio).png().toBuffer()
  } else {
    throw new Error('Formato no compatible')
  }

  return preprocesarParaOcr(bufer)
}

async function preprocesarParaOcr(bufer) {
  const metadatos = await sharp(bufer).metadata()
  const ladoMin = Math.min(metadatos.width || 0, metadatos.height || 0)
  const escala = ladoMin > 0 && ladoMin < 1200 ? Math.min(4, 1200 / ladoMin) : 1

  let tuberia = sharp(bufer)
    .rotate()
    .resize({
      width: escala > 1 ? Math.round((metadatos.width || 1) * escala) : undefined,
      height: escala > 1 ? Math.round((metadatos.height || 1) * escala) : undefined,
      fit: 'inside',
      withoutEnlargement: false
    })
    .greyscale()
    .normalize()
    .median(3)
    .sharpen({ sigma: 1.2 })
    .png({ density: 300 })

  return tuberia.toBuffer()
}

function resolverIdioma(args) {
  const crudo = (args[0] || '').toLowerCase().trim()
  if (!crudo) return 'spa+eng'
  const code = MAPA_IDIOMAS[crudo] || crudo
  return code.includes('+') ? code : `${code}+eng`
}

function esMedioOcr(mime = '', mtype = '') {
  return /image|webp|sticker/i.test(mime) || /imageMessage|stickerMessage/i.test(mtype)
}

function resolverObjetivoMedio(m) {
  if (m.quoted) {
    const mime = (m.quoted.msg || m.quoted).mimetype || m.quoted.mediaType || ''
    const mtype = m.quoted.mtype || ''
    if (esMedioOcr(mime, mtype) && m.quoted.download) return m.quoted
  }

  const mime = (m.msg || m).mimetype || m.mediaType || ''
  const mtype = m.mtype || ''
  if (esMedioOcr(mime, mtype) && m.download) return m

  return null
}

let handler = async (m, { conn, args, usedPrefix, command }) => {
  let rutaTmp = ''

  try {
    const objetivo = resolverObjetivoMedio(m)

    if (!objetivo) {
      return conn.sendMessage(m.chat, {
        text: `*[❗] Enviá una *imagen* o *sticker* con el comando, o respondé a uno con ${usedPrefix + command}.*\n\nEjemplos:\n• Foto + comando: ${usedPrefix + command}\n• Responder imagen: ${usedPrefix + command}\n\nIdioma opcional: ${usedPrefix + command} es | en | pt`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    const mime = (objetivo.msg || objetivo).mimetype || objetivo.mediaType || ''
    const medio = await objetivo.download()
    if (!medio?.length) throw new Error('No se pudo descargar la imagen')

    const dirTmp = join(process.cwd(), 'tmp')
    if (!existsSync(dirTmp)) await mkdir(dirTmp, { recursive: true })

    const buferImagen = await aBuferImagen(medio, mime)
    rutaTmp = join(dirTmp, `ocr_${Date.now()}.png`)
    await writeFile(rutaTmp, buferImagen)

    const idioma = resolverIdioma(args)
    const trabajador = await obtenerTrabajador(idioma)
    const { datos } = await trabajador.recognize(rutaTmp)
    const text = extraerTextoLimpio(datos)

    if (!text) {
      return conn.sendMessage(m.chat, {
        text: '*[❗] No se detectó texto en la imagen. Probá con una foto más nítida o con mejor contraste.*',
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    const longitudMax = 45000
    const textoSalida = text.length > longitudMax ? `${text.slice(0, longitudMax)}\n\n_[Texto recortado]_` : text

    await conn.sendMessage(m.chat, {
      text: `Texto detectado:\n\n${textoSalida}`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  } catch (e) {
    console.error('[ocr] Error:', e)
    conn.sendMessage(m.chat, {
      text: `*[❌] Error al leer la imagen: ${e.message || 'desconocido'}*`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  } finally {
    if (rutaTmp) {
      try { await unlink(rutaTmp) } catch {}
    }
  }
}

handler.help = ['#text • #ocr + {imagen/sticker con caption o respondiendo} → extrae texto (OCR local)']
handler.tags = ['inteligencia', 'herramientas']
handler.command = ['text', 'ocr', 'leertexto', 'leerimg']

export default handler
