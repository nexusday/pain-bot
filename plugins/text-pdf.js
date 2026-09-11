import { mkdir, writeFile, unlink } from 'fs/promises'
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import fetch from 'node-fetch'
import sharp from '../lib/sharp.js'
import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, rgb } from 'pdf-lib'
import { webp2png } from '../lib/webp2mp4.js'

const DIR_FUENTES = join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'fonts')

const ANCHO_PAGINA = 595.28
const ALTO_PAGINA = 841.89
const MARGEN = 72
const TAMANO_FUENTE = 12
const TAMANO_TITULO = 16
const ALTO_LINEA = TAMANO_FUENTE * 1.45
const ESPACIO_TITULO = 28
const PAD_MARCO_IMAGEN = 14
const ESPACIO_BLOQUE_IMAGEN = 26
const ESPACIO_SECCION_TEXTO = 22
const RATIO_ANCHO_IMG_MAX = 0.82
const ALTO_IMG_MAX = 340
const MAX_CARACTERES = 50000

const ARCHIVOS_FUENTE = {
  regular: 'NotoSans-Regular.ttf',
  bold: 'NotoSans-Bold.ttf',
  math: 'NotoSansMath-Regular.ttf',
  symbols: 'NotoSansSymbols2-Regular.ttf'
}

const BASE_TWEMOJI = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72'

let cacheBytesFuente = null
const cacheCodificacion = new WeakMap()
const cachePngEmoji = new Map()
const segmentadorGrafemas = typeof Intl !== 'undefined' && Intl.Segmenter
  ? new Intl.Segmenter('und', { granularity: 'grapheme' })
  : null

function cargarBytesFuente() {
  if (cacheBytesFuente) return cacheBytesFuente

  cacheBytesFuente = {}
  for (const [clave, archivo] of Object.entries(ARCHIVOS_FUENTE)) {
    const filePath = join(DIR_FUENTES, archivo)
    if (existsSync(filePath)) {
      cacheBytesFuente[clave] = readFileSync(filePath)
    }
  }

  if (!cacheBytesFuente.regular || !cacheBytesFuente.bold) {
    throw new Error('Fuentes base no encontradas en lib/fonts')
  }

  return cacheBytesFuente
}

async function incrustarFuentesUtf8(docPdf) {
  docPdf.registerFontkit(fontkit)
  const bytes = cargarBytesFuente()
  const fuentes = {}

  for (const [clave, datos] of Object.entries(bytes)) {
    try {
      fuentes[clave] = await docPdf.embedFont(datos, { subset: true })
    } catch (e) {
      console.warn(`[tepdf] Fuente ${clave} omitida:`, e.message)
    }
  }

  return fuentes
}

function emojiACodigoTwemoji(emoji) {
  return [...emoji]
    .map(caracter => caracter.codePointAt(0).toString(16))
    .filter(code => code !== 'fe0f')
    .join('-')
}

async function obtenerPngEmoji(emoji) {
  if (cachePngEmoji.has(emoji)) return cachePngEmoji.get(emoji)

  try {
    const code = emojiACodigoTwemoji(emoji)
    const respuesta = await fetch(`${BASE_TWEMOJI}/${code}.png`)
    if (!respuesta.ok) {
      cachePngEmoji.set(emoji, null)
      return null
    }
    const bufer = Buffer.from(await respuesta.arrayBuffer())
    cachePngEmoji.set(emoji, bufer)
    return bufer
  } catch {
    cachePngEmoji.set(emoji, null)
    return null
  }
}

function partirGrafemas(text) {
  if (!text) return []
  if (segmentadorGrafemas) {
    return [...segmentadorGrafemas.segment(text)].map(s => s.segment)
  }
  return [...text]
}

function esPuntoCodigoEmoji(cp) {
  if (cp === 0xFE0F || cp === 0x200D) return true
  return (
    (cp >= 0x1F300 && cp <= 0x1FAFF) ||
    (cp >= 0x1F600 && cp <= 0x1F64F) ||
    (cp >= 0x1F680 && cp <= 0x1F6FF) ||
    (cp >= 0x1F900 && cp <= 0x1F9FF) ||
    (cp >= 0x2600 && cp <= 0x27BF) ||
    (cp >= 0x2300 && cp <= 0x23FF)
  )
}

function esAlfaMatematico(cp) {
  return cp >= 0x1D400 && cp <= 0x1D7FF
}

function puedeCodificar(font, text) {
  if (!font || !text) return false

  let cacheBusqueda = cacheCodificacion.get(font)
  if (!cacheBusqueda) {
    cacheBusqueda = new Map()
    cacheCodificacion.set(font, cacheBusqueda)
  }

  if (cacheBusqueda.has(text)) return cacheBusqueda.get(text)

  try {
    font.widthOfTextAtSize(text, 12)
    cacheBusqueda.set(text, true)
    return true
  } catch {
    cacheBusqueda.set(text, false)
    return false
  }
}

function elegirFuenteParaSegmento(segmento, fuentes, preferirNegrita = false) {
  const cp = segmento.codePointAt(0)
  const candidatos = []

  if (esAlfaMatematico(cp) && fuentes.math) candidatos.push(fuentes.math)
  if (preferirNegrita && fuentes.bold) candidatos.push(fuentes.bold)
  if (fuentes.regular) candidatos.push(fuentes.regular)
  if (fuentes.symbols) candidatos.push(fuentes.symbols)
  if (!preferirNegrita && fuentes.bold) candidatos.push(fuentes.bold)
  if (fuentes.math) candidatos.push(fuentes.math)

  const vistos = new Set()
  for (const font of candidatos) {
    if (!font || vistos.has(font)) continue
    vistos.add(font)
    if (puedeCodificar(font, segmento)) return font
  }

  return fuentes.regular
}

async function construirCorridasRicas(text, fuentes, preferirNegrita = false) {
  const corridas = []
  let actual = null

  for (const segmento of partirGrafemas(text)) {
    const cp = segmento.codePointAt(0)

    if (esPuntoCodigoEmoji(cp) && !esAlfaMatematico(cp)) {
      const png = await obtenerPngEmoji(segmento)
      if (png) {
        if (actual) {
          corridas.push(actual)
          actual = null
        }
        corridas.push({ type: 'emoji', text: segmento, png })
        continue
      }
    }

    const font = elegirFuenteParaSegmento(segmento, fuentes, preferirNegrita)
    if (actual && actual.type === 'text' && actual.font === font) {
      actual.text += segmento
    } else {
      if (actual) corridas.push(actual)
      actual = { type: 'text', font, text: segmento }
    }
  }

  if (actual) corridas.push(actual)
  return corridas
}

function fusionarCorridasRicas(objetivo, fuente) {
  for (const corrida of fuente) {
    const ultimo = objetivo[objetivo.length - 1]
    if (corrida.type === 'text' && ultimo?.type === 'text' && ultimo.font === corrida.font) {
      ultimo.text += corrida.text
    } else {
      objetivo.push({ ...corrida })
    }
  }
  return objetivo
}

function medirAnchoCorridasRicas(corridas, tamano) {
  return corridas.reduce((total, corrida) => {
    if (corrida.type === 'emoji') return total + tamano * 1.12
    try {
      return total + corrida.font.widthOfTextAtSize(corrida.text, tamano)
    } catch {
      return total + corrida.text.length * tamano * 0.45
    }
  }, 0)
}

async function envolverCorridasParrafo(parrafo, fuentes, tamanoFuente, anchoMax, preferirNegrita = false) {
  if (!parrafo) return [[]]

  const tokens = parrafo.match(/\S+|\s+/g) || []
  if (!tokens.length) return [[]]

  const lineas = []
  let corridasActuales = []
  let anchoActual = 0

  for (const token of tokens) {
    const corridasToken = await construirCorridasRicas(token, fuentes, preferirNegrita)
    const anchoToken = medirAnchoCorridasRicas(corridasToken, tamanoFuente)
    const esEspacio = /^\s+$/.test(token)

    if (!esEspacio && corridasActuales.length && anchoActual + anchoToken > anchoMax) {
      lineas.push(corridasActuales)
      corridasActuales = [...corridasToken]
      anchoActual = anchoToken
      continue
    }

    if (esEspacio && !corridasActuales.length) continue

    fusionarCorridasRicas(corridasActuales, corridasToken)
    anchoActual = medirAnchoCorridasRicas(corridasActuales, tamanoFuente)
  }

  if (corridasActuales.length) lineas.push(corridasActuales)
  return lineas.length ? lineas : [[]]
}

async function construirCorridasLinea(text, fuentes, tamanoFuente, anchoMax, preferirNegrita = false) {
  if (!text.trim()) return []

  const parrafos = text.split('\n')
  const lineas = []

  for (const parrafo of parrafos) {
    lineas.push(...await envolverCorridasParrafo(parrafo, fuentes, tamanoFuente, anchoMax, preferirNegrita))
    lineas.push([])
  }

  if (lineas.length && lineas.length === 1 && lineas[0].length === 0) return []
  if (lineas.length && !lineas[lineas.length - 1].length) lineas.pop()
  return lineas
}

async function incrustarImagenesCorrida(docPdf, corridas) {
  for (const corrida of corridas) {
    if (corrida.type === 'emoji' && corrida.png && !corrida.embedded) {
      corrida.embedded = await docPdf.embedPng(corrida.png)
    }
  }
}

function dibujarCorridasRicas(pagina, corridas, x, y, tamano, color) {
  let cursor = x

  for (const corrida of corridas) {
    if (corrida.type === 'emoji' && corrida.embedded) {
      const dim = tamano * 1.12
      pagina.drawImage(corrida.embedded, {
        x: cursor,
        y: y - dim * 0.2,
        width: dim,
        height: dim
      })
      cursor += dim
      continue
    }

    if (!corrida.text) continue

    try {
      pagina.drawText(corrida.text, {
        x: cursor,
        y,
        tamano,
        font: corrida.font,
        color
      })
      cursor += corrida.font.widthOfTextAtSize(corrida.text, tamano)
    } catch {
      for (const segmento of partirGrafemas(corrida.text)) {
        const font = elegirFuenteParaSegmento(segmento, { regular: corrida.font }, false)
        try {
          pagina.drawText(segmento, { x: cursor, y, tamano, font, color })
          cursor += font.widthOfTextAtSize(segmento, tamano)
        } catch {}
      }
    }
  }
}

function sanitizarNombrePdf(args) {
  const crudo = (args.join(' ') || 'documento')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .trim()
    .slice(0, 80)

  const nombre = crudo || 'documento'
  return nombre.toLowerCase().endsWith('.pdf') ? nombre : `${nombre}.pdf`
}

function aTextoSeguroPdf(text) {
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .normalize('NFC')
}

function esMedioImagen(mime = '', mtype = '') {
  return /image|webp|sticker/i.test(mime) || /imageMessage|stickerMessage/i.test(mtype)
}

function resolverContenidoCitado(quoted) {
  if (!quoted) return null

  const mime = (quoted.msg || quoted).mimetype || quoted.mediaType || ''
  const mtype = quoted.mtype || ''
  const text = (quoted.text || '').trim()
  const tieneImagen = esMedioImagen(mime, mtype) && quoted.download

  if (tieneImagen) {
    return { text, mime, hasImage: true }
  }

  if (text) {
    return { text, mime: '', hasImage: false }
  }

  return null
}

async function prepararBuferImagen(medio, mime) {
  if (/webp/i.test(mime)) {
    try {
      return await sharp(medio).rotate().jpeg({ quality: 90 }).toBuffer()
    } catch {
      const url = await webp2png(medio)
      if (!url) throw new Error('No se pudo convertir la imagen')
      const respuesta = await fetch(url)
      return Buffer.from(await respuesta.arrayBuffer())
    }
  }

  if (/image\/jpe?g/i.test(mime)) {
    return sharp(medio).rotate().jpeg({ quality: 90 }).toBuffer()
  }

  if (/image\//i.test(mime)) {
    return sharp(medio).rotate().png().toBuffer()
  }

  throw new Error('Formato de imagen no compatible')
}

function asegurarEspacio(refPagina, refY, alturaNecesaria, docPdf) {
  if (refY.value >= MARGEN + alturaNecesaria) return refPagina.value

  refPagina.value = docPdf.addPage([ANCHO_PAGINA, ALTO_PAGINA])
  refY.value = ALTO_PAGINA - MARGEN
  return refPagina.value
}

function calcularTamanoImagen(srcW, srcH, anchoMax) {
  const maxW = anchoMax * RATIO_ANCHO_IMG_MAX
  const escala = Math.min(maxW / srcW, ALTO_IMG_MAX / srcH)
  return {
    width: srcW * escala,
    height: srcH * escala
  }
}

async function dibujarBloqueImagen(refPagina, refY, docPdf, buferImagen, mime, anchoMax, hasTextAfter = false) {
  const raster = await prepararBuferImagen(buferImagen, mime)
  const metadatos = await sharp(raster).metadata()
  const srcW = metadatos.width || 1
  const srcH = metadatos.height || 1
  const { width: dibujarW, height: dibujarH } = calcularTamanoImagen(srcW, srcH, anchoMax)

  const marcoW = dibujarW + PAD_MARCO_IMAGEN * 2
  const marcoH = dibujarH + PAD_MARCO_IMAGEN * 2
  const altoBloque = marcoH + ESPACIO_BLOQUE_IMAGEN + (hasTextAfter ? ESPACIO_SECCION_TEXTO : 0)

  const pagina = asegurarEspacio(refPagina, refY, altoBloque, docPdf)

  const imgX = MARGEN + (anchoMax - dibujarW) / 2
  const marcoX = MARGEN + (anchoMax - marcoW) / 2
  const marcoInferior = refY.value - marcoH

  pagina.drawRectangle({
    x: marcoX,
    y: marcoInferior,
    width: marcoW,
    height: marcoH,
    color: rgb(0.975, 0.975, 0.975),
    borderColor: rgb(0.78, 0.78, 0.78),
    borderWidth: 0.8
  })

  const incrustado = metadatos.format === 'jpeg'
    ? await docPdf.embedJpg(raster)
    : await docPdf.embedPng(raster)

  pagina.drawImage(incrustado, {
    x: imgX,
    y: marcoInferior + PAD_MARCO_IMAGEN,
    width: dibujarW,
    height: dibujarH
  })

  refY.value -= marcoH + ESPACIO_BLOQUE_IMAGEN

  if (hasTextAfter) {
    pagina.drawLine({
      start: { x: MARGEN, y: refY.value + 10 },
      end: { x: ANCHO_PAGINA - MARGEN, y: refY.value + 10 },
      thickness: 0.4,
      color: rgb(0.85, 0.85, 0.85)
    })
    refY.value -= ESPACIO_SECCION_TEXTO
  }
}

async function contenidoAPdf({ text, titulo, buferImagen, imageMime }) {
  const docPdf = await PDFDocument.create()
  const fuentes = await incrustarFuentesUtf8(docPdf)
  const anchoMax = ANCHO_PAGINA - MARGEN * 2
  const lineasCuerpo = await construirCorridasLinea(text, fuentes, TAMANO_FUENTE, anchoMax)

  const refPagina = { value: docPdf.addPage([ANCHO_PAGINA, ALTO_PAGINA]) }
  const refY = { value: ALTO_PAGINA - MARGEN }

  const corridasTitulo = await construirCorridasRicas(aTextoSeguroPdf(titulo.replace(/\.pdf$/i, '')), fuentes, true)
  await incrustarImagenesCorrida(docPdf, corridasTitulo)
  dibujarCorridasRicas(refPagina.value, corridasTitulo, MARGEN, refY.value, TAMANO_TITULO, rgb(0.1, 0.1, 0.1))
  refY.value -= ESPACIO_TITULO

  refPagina.value.drawLine({
    start: { x: MARGEN, y: refY.value + 8 },
    end: { x: ANCHO_PAGINA - MARGEN, y: refY.value + 8 },
    thickness: 0.5,
    color: rgb(0.75, 0.75, 0.75)
  })
  refY.value -= 16

  if (buferImagen?.length) {
    await dibujarBloqueImagen(refPagina, refY, docPdf, buferImagen, imageMime, anchoMax, lineasCuerpo.length > 0)
  }

  for (const lineRuns of lineasCuerpo) {
    refPagina.value = asegurarEspacio(refPagina, refY, ALTO_LINEA, docPdf)

    if (lineRuns.length) {
      await incrustarImagenesCorrida(docPdf, lineRuns)
      dibujarCorridasRicas(refPagina.value, lineRuns, MARGEN, refY.value, TAMANO_FUENTE, rgb(0.15, 0.15, 0.15))
    }

    refY.value -= ALTO_LINEA
  }

  const conteoPaginas = docPdf.getPageCount()
  return { pdfBytes: Buffer.from(await docPdf.save()), conteoPaginas }
}

let handler = async (m, { conn, args, usedPrefix, command }) => {
  let rutaPdf = ''
  cachePngEmoji.clear()

  try {
    const contenido = resolverContenidoCitado(m.quoted)

    if (!contenido) {
      return conn.sendMessage(m.chat, {
        text: `*[❗] Respondé a un mensaje con *texto* o *imagen + texto* y usá ${usedPrefix + command} nombre*\n\nEjemplos:\n> ${usedPrefix + command} Apuntes\n> (foto con texto  ${usedPrefix + command} Informe)`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    if (!contenido.hasImage && !contenido.text) {
      throw new Error('El mensaje no contiene texto válido')
    }

    let buferImagen = null
    if (contenido.hasImage) {
      buferImagen = await m.quoted.download()
      if (!buferImagen?.length) throw new Error('No se pudo descargar la imagen')
    }

    const textoCrudo = contenido.text || ''
    const text = aTextoSeguroPdf(textoCrudo).slice(0, MAX_CARACTERES)

    if (!text.trim() && !buferImagen) {
      throw new Error('El mensaje no tiene texto ni imagen usable')
    }

    const fileName = sanitizarNombrePdf(args)
    const { bytesPdf, conteoPaginas } = await contenidoAPdf({
      text,
      titulo: fileName,
      buferImagen,
      imageMime: contenido.mime
    })

    const dirTmp = join(process.cwd(), 'tmp')
    if (!existsSync(dirTmp)) await mkdir(dirTmp, { recursive: true })

    rutaPdf = join(dirTmp, `tepdf_${Date.now()}_${fileName}`)
    await writeFile(rutaPdf, bytesPdf)

    const extras = []
    if (buferImagen) extras.push('imagen')
    if (text.trim()) extras.push('texto')

    await conn.sendMessage(m.chat, {
      document: { url: rutaPdf },
      fileName,
      mimetype: 'application/pdf',
      caption: `*[✓] PDF generado:* ${fileName}\n> Contenido: ${extras.join(' + ') || 'documento'}\n> Páginas: ${conteoPaginas}`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  } catch (e) {
    console.error('[tepdf] Error:', e)
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

handler.help = ['#tepdf + {responder texto o imagen+caption} nombre → convierte a PDF']
handler.tags = ['herramientas']
handler.command = ['tepdf', 'textpdf', 'txtpdf', 'textopdf']

export default handler
