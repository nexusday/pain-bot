import sharp from '../lib/sharp.js'
import fetch from 'node-fetch'
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import fontkit from '@pdf-lib/fontkit'
import { addExif } from '../lib/sticker.js'
import { resolveStickerMeta } from './stickers-sticker.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RUTA_FUENTE = join(__dirname, '../lib/fonts/NotoSans-Bold.ttf')

const SIZE = 512
const PADDING = 36
const MAX_WIDTH = SIZE - PADDING * 2
const MAX_HEIGHT = SIZE - PADDING * 2
const SAFE_INSET = 20
const CONTENT_WIDTH = MAX_WIDTH - SAFE_INSET
const MAX_TEXT = 320
const LINE_RATIO = 1.05
const BG = '#FFFFFF'
const FG = '#000000'
const BLUR_BRAT = 2.4
const TRACKING = -0.035

const WA_EMOJI_CDN = 'https://cdn.jsdelivr.net/gh/realityripple/emoji/whatsapp'
const WA_EMOJI_FALLBACK = 'https://emoji-cdn.mqrio.dev'

const cachePngEmoji = new Map()
const cacheAnchoTexto = new Map()
let fuenteBrat = null

const segmentadorGrafemas =
  typeof Intl !== 'undefined' && Intl.Segmenter
    ? new Intl.Segmenter('und', { granularity: 'grapheme' })
    : null

function obtenerFuente() {
  if (fuenteBrat) return fuenteBrat
  if (!existsSync(RUTA_FUENTE)) {
    throw new Error('Falta lib/fonts/NotoSans-Bold.ttf')
  }
  fuenteBrat = fontkit.create(readFileSync(RUTA_FUENTE))
  return fuenteBrat
}

function escaparXml(texto) {
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function normalizarEntrada(texto) {
  return String(texto || '')
    .replace(/\\n/gi, '\n')
    .replace(/\r\n/g, '\n')
    .trim()
}

function dividirGrafemas(texto) {
  if (!texto) return []
  if (segmentadorGrafemas) {
    return [...segmentadorGrafemas.segment(texto)].map(s => s.segment)
  }
  return [...texto]
}

function esPuntoCodigoEmoji(puntoCodigo) {
  if (puntoCodigo == null) return false
  if (puntoCodigo === 0xfe0f || puntoCodigo === 0x200d || puntoCodigo === 0x20e3) return true
  return (
    (puntoCodigo >= 0x1f300 && puntoCodigo <= 0x1faff) ||
    (puntoCodigo >= 0x1f600 && puntoCodigo <= 0x1f64f) ||
    (puntoCodigo >= 0x1f680 && puntoCodigo <= 0x1f6ff) ||
    (puntoCodigo >= 0x1f900 && puntoCodigo <= 0x1f9ff) ||
    (puntoCodigo >= 0x2600 && puntoCodigo <= 0x27bf) ||
    (puntoCodigo >= 0x2300 && puntoCodigo <= 0x23ff) ||
    (puntoCodigo >= 0x1f1e6 && puntoCodigo <= 0x1f1ff)
  )
}

function esGrafemaEmoji(segmento) {
  if (!segmento) return false
  return [...segmento].some(caracter => esPuntoCodigoEmoji(caracter.codePointAt(0)))
}

function emojiACodigos(emoji) {
  const puntosCodigo = [...emoji].map(caracter => caracter.codePointAt(0).toString(16))
  const conFe0f = puntosCodigo.join('-')
  const sinFe0f = puntosCodigo.filter(codigo => codigo !== 'fe0f').join('-')
  const codigos = [conFe0f, sinFe0f]
  if (!puntosCodigo.includes('fe0f') && sinFe0f) codigos.push(`${sinFe0f}-fe0f`)
  return [...new Set(codigos.filter(Boolean))]
}

async function obtenerPng(url) {
  const respuesta = await fetch(url)
  if (!respuesta.ok) return null
  const type = String(respuesta.headers.get('content-type') || '')
  if (!type.includes('png') && !type.includes('octet-stream') && !type.includes('image')) {
    return null
  }
  const bufer = Buffer.from(await respuesta.arrayBuffer())
  return bufer.length > 100 ? bufer : null
}

async function obtenerPngEmoji(emoji) {
  if (cachePngEmoji.has(emoji)) return cachePngEmoji.get(emoji)

  try {
    for (const codigo of emojiACodigos(emoji)) {
      const bufer = await obtenerPng(`${WA_EMOJI_CDN}/${codigo}.png`)
      if (bufer) {
        cachePngEmoji.set(emoji, bufer)
        return bufer
      }
    }

    const bufer = await obtenerPng(
      `${WA_EMOJI_FALLBACK}/${encodeURIComponent(emoji)}?style=whatsapp`
    )
    if (bufer) {
      cachePngEmoji.set(emoji, bufer)
      return bufer
    }

    cachePngEmoji.set(emoji, null)
    return null
  } catch {
    cachePngEmoji.set(emoji, null)
    return null
  }
}

async function precargarEmojis(texto) {
  const tareas = []
  for (const g of dividirGrafemas(texto)) {
    if (esGrafemaEmoji(g)) tareas.push(obtenerPngEmoji(g))
  }
  await Promise.all(tareas)
}

function tokenizar(texto) {
  const tokens = []
  let acumulador = ''

  const vaciarTexto = () => {
    if (!acumulador) return
    tokens.push({ type: 'text', text: acumulador })
    acumulador = ''
  }

  for (const g of dividirGrafemas(texto)) {
    if (esGrafemaEmoji(g)) {
      vaciarTexto()
      tokens.push({ type: 'emoji', text: g })
      continue
    }
    if (/\s/.test(g)) {
      vaciarTexto()
      continue
    }
    acumulador += g
  }
  vaciarTexto()
  return tokens
}

function escalaFuente(tamanoFuente) {
  return tamanoFuente / obtenerFuente().unitsPerEm
}

function trackingPx(tamanoFuente) {
  return Math.max(-4, tamanoFuente * TRACKING)
}

function medirAnchoTexto(texto, tamanoFuente) {
  const clave = `${tamanoFuente}::${texto}`
  if (cacheAnchoTexto.has(clave)) return cacheAnchoTexto.get(clave)

  const fuente = obtenerFuente()
  const escala = escalaFuente(tamanoFuente)
  const run = fuente.layout(texto)
  const tracking = trackingPx(tamanoFuente)
  const extras = Math.max(0, run.glyphs.length - 1) * tracking
  const medido = Math.max(1, Math.ceil(run.advanceWidth * escala + extras))
  cacheAnchoTexto.set(clave, medido)
  return medido
}

function textoAPathsSvg(texto, x, y, tamanoFuente) {
  const fuente = obtenerFuente()
  const escala = escalaFuente(tamanoFuente)
  const tracking = trackingPx(tamanoFuente)
  const run = fuente.layout(texto)
  const partes = []
  let pen = 0

  for (let i = 0; i < run.glyphs.length; i++) {
    const glyph = run.glyphs[i]
    const pos = run.positions[i]
    const d = glyph.path?.toSVG?.() || ''
    if (d) {
      const px = x + (pen + (pos.xOffset || 0)) * escala + i * tracking
      const py = y - (pos.yOffset || 0) * escala
      partes.push(
        `<path d="${d}" transform="translate(${px.toFixed(2)},${py.toFixed(2)}) scale(${escala},${-escala})" fill="${FG}"/>`
      )
    }
    pen += pos.xAdvance
  }

  return partes.join('')
}

function anchoEmoji(tamanoFuente) {
  return Math.round(tamanoFuente * 1.05)
}

function anchoToken(token, tamanoFuente) {
  if (token.type === 'emoji') return anchoEmoji(tamanoFuente)
  return medirAnchoTexto(token.text, tamanoFuente)
}

function anchoLinea(tokens, tamanoFuente, espacio) {
  if (!tokens.length) return 0
  let anchoCalc = 0
  for (let i = 0; i < tokens.length; i++) {
    anchoCalc += anchoToken(tokens[i], tamanoFuente)
    if (i < tokens.length - 1) anchoCalc += espacio
  }
  return anchoCalc
}

function envolverTokens(tokens, tamanoFuente) {
  const espacioBase = Math.max(8, tamanoFuente * 0.22)
  const lineas = []
  let actual = []

  for (const token of tokens) {
    const prueba = [...actual, token]
    const anchoCalc = anchoLinea(prueba, tamanoFuente, espacioBase)
    if (anchoCalc <= CONTENT_WIDTH || actual.length === 0) {
      actual.push(token)
      continue
    }
    lineas.push(actual)
    actual = [token]
  }
  if (actual.length) lineas.push(actual)
  return lineas
}

function envolverTexto(texto, tamanoFuente) {
  const lineas = []
  for (const parrafo of texto.split('\n')) {
    const recortado = parrafo.trim()
    if (!recortado) {
      if (lineas.length) lineas.push([])
      continue
    }
    lineas.push(...envolverTokens(tokenizar(recortado), tamanoFuente))
  }
  return lineas.length ? lineas : [tokenizar(texto)]
}

function ajustarDiseno(texto) {
  let tamanoFuente = 108
  let lineas = []

  while (tamanoFuente >= 14) {
    lineas = envolverTexto(texto, tamanoFuente)
    const alturaBloque = Math.max(1, lineas.length) * tamanoFuente * LINE_RATIO
    const espacioBase = Math.max(8, tamanoFuente * 0.22)
    let anchoOk = true
    for (const linea of lineas) {
      if (anchoLinea(linea, tamanoFuente, espacioBase) > CONTENT_WIDTH) {
        anchoOk = false
        break
      }
    }
    if (alturaBloque <= MAX_HEIGHT && anchoOk) break
    tamanoFuente -= 2
  }

  if (tamanoFuente < 14) {
    tamanoFuente = 14
    lineas = envolverTexto(texto, tamanoFuente)
  }

  return { lineas, tamanoFuente, alturaLinea: tamanoFuente * LINE_RATIO }
}

async function lineaASvg(tokens, tamanoFuente, y) {
  if (!tokens.length) return ''

  const tamanoEmoji = anchoEmoji(tamanoFuente)
  const emojiY = y - tamanoFuente * 0.88
  const anchos = tokens.map(token => anchoToken(token, tamanoFuente))

  const natural = anchos.reduce((a, b) => a + b, 0)
  const cantidadEspacios = Math.max(0, tokens.length - 1)
  const espacioMin = Math.max(8, tamanoFuente * 0.22)
  const espacioMax = tamanoFuente * 0.55

  let espacio = espacioMin
  if (cantidadEspacios > 0) {
    const ideal = (CONTENT_WIDTH - natural) / cantidadEspacios
    espacio = Math.min(espacioMax, Math.max(espacioMin, ideal))
  }

  let total = natural + espacio * cantidadEspacios
  if (total > CONTENT_WIDTH && cantidadEspacios > 0) {
    espacio = Math.max(4, (CONTENT_WIDTH - natural) / cantidadEspacios)
  }

  let x = PADDING
  const partes = []

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    const anchoT = anchos[i]
    const esUltimo = i === tokens.length - 1

    if (esUltimo) {
      const inicioMax = PADDING + CONTENT_WIDTH - anchoT
      if (x > inicioMax) x = Math.max(PADDING, inicioMax)
    }

    if (token.type === 'emoji') {
      const png = await obtenerPngEmoji(token.text)
      if (png) {
        const b64 = png.toString('base64')
        partes.push(
          `<image x="${x.toFixed(2)}" y="${emojiY.toFixed(2)}" ` +
            `width="${tamanoEmoji}" height="${tamanoEmoji}" ` +
            `href="data:image/png;base64,${b64}" ` +
            `xlink:href="data:image/png;base64,${b64}" />`
        )
      }
    } else {
      partes.push(textoAPathsSvg(token.text, x, y, tamanoFuente))
    }

    x += anchoT
    if (i < tokens.length - 1) x += espacio
  }

  return partes.join('')
}

async function construirSvg(lineas, tamanoFuente, alturaLinea) {
  const alturaBloque = lineas.length * alturaLinea
  let y = PADDING + Math.max(0, (MAX_HEIGHT - alturaBloque) / 2) + tamanoFuente * 0.8

  const partes = []
  for (const tokens of lineas) {
    if (!tokens.length) {
      y += alturaLinea
      continue
    }
    partes.push(await lineaASvg(tokens, tamanoFuente, y))
    y += alturaLinea
  }

  return `<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <rect width="100%" height="100%" fill="${BG}"/>
  ${partes.join('\n  ')}
</svg>`
}

function resolverTexto(m, args) {
  const desdeArgs = normalizarEntrada(args.join(' ') || '')
  const desdeCita = normalizarEntrada(m.quoted?.text || '')
  return desdeArgs || desdeCita
}

async function textoAStickerBrat(textoCrudo) {
  obtenerFuente()

  const texto = dividirGrafemas(normalizarEntrada(textoCrudo))
    .map(g => (esGrafemaEmoji(g) ? g : g.toLowerCase()))
    .join('')

  await precargarEmojis(texto)
  const { lineas, tamanoFuente, alturaLinea } = ajustarDiseno(texto)
  const svg = await construirSvg(lineas, tamanoFuente, alturaLinea)

  return sharp(Buffer.from(svg))
    .resize(SIZE, SIZE)
    .blur(BLUR_BRAT)
    .webp({ quality: 95 })
    .toBuffer()
}

let handler = async (m, { conn, args, usedPrefix, command }) => {
  try {
    const texto = resolverTexto(m, args)

    if (!texto) {
      return conn.reply(
        m.chat,
        `*[❗] Escribe el texto Brat.*\n\n` +
          `Ejemplos:\n` +
          `> ${usedPrefix + command} 365 party girl\n` +
          `> ${usedPrefix + command} so brat\n` +
          `> (responde un mensaje con ${usedPrefix + command})`,
        m,
        global.rcanal
      )
    }

    if (texto.length > MAX_TEXT) {
      return conn.reply(
        m.chat,
        `*[❗] Texto muy largo.* Máximo ${MAX_TEXT} caracteres (tienes ${texto.length}).`,
        m,
        global.rcanal
      )
    }

    const { packname, author } = resolveStickerMeta(m, conn)
    const webp = await textoAStickerBrat(texto)
    const stickerFinal = await addExif(webp, packname, author)

    await conn.sendFile(m.chat, stickerFinal, 'sticker.webp', '', m, null, global.rcanal)
  } catch (error) {
    console.error('[brat]', error)
    return conn.reply(
      m.chat,
      `*[❌] Error al crear el sticker Brat.*\n> ${error?.message || error}`,
      m,
      global.rcanal
    )
  }
}

handler.help = ['#brat + {texto} → sticker estilo Brat (fondo blanco, texto negro borroso)']
handler.tags = ['stickers']
handler.command = ['brat', 'sp', 'stickerplain', 'memetext', 'bratgen']

export default handler
