/**
 * Generador de stickers estilo Brat.
 *
 * `/brat` conserva exactamente el texto escrito (incluidas mayúsculas) y
 * `/brat2` reutiliza el mismo diseño para revelar el texto poco a poco dentro
 * de un WebP animado.
 */
import sharp from './sharp.js'
import fetch from 'node-fetch'
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import fontkit from '@pdf-lib/fontkit'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RUTA_FUENTE = join(__dirname, 'fonts/NotoSans-Bold.ttf')

const SIZE = 512
const PADDING = 36
const MAX_WIDTH = SIZE - PADDING * 2
const MAX_HEIGHT = SIZE - PADDING * 2
const SAFE_INSET = 20
const CONTENT_WIDTH = MAX_WIDTH - SAFE_INSET
const LINE_RATIO = 1.05
const BG = '#FFFFFF'
const FG = '#000000'
const BLUR_BRAT = 2.4
const TRACKING = -0.035

const WA_EMOJI_CDN = 'https://cdn.jsdelivr.net/gh/realityripple/emoji/whatsapp'
const WA_EMOJI_FALLBACK = 'https://emoji-cdn.mqrio.dev'

const BRAT2_FPS = 12
const BRAT2_MAX_FRAMES = 96
const BRAT2_REVEAL_RATIO = 0.82
const BRAT2_MAX_BYTES = 1000 * 1024

export const MAX_TEXT = 320
export const BRAT2_MIN_SEGUNDOS = 2
export const BRAT2_MAX_SEGUNDOS = 10
export const BRAT2_MAX_TEXT = 200

const cachePngEmoji = new Map()
const cacheAnchoTexto = new Map()
let fuenteBrat = null

const segmentadorGrafemas =
  typeof Intl !== 'undefined' && Intl.Segmenter
    ? new Intl.Segmenter('und', { granularity: 'grapheme' })
    : null

export class ErrorBrat2 extends Error {
  constructor(mensaje) {
    super(mensaje)
    this.name = 'ErrorBrat2'
  }
}

function obtenerFuente() {
  if (fuenteBrat) return fuenteBrat
  if (!existsSync(RUTA_FUENTE)) {
    throw new Error('Falta lib/fonts/NotoSans-Bold.ttf')
  }
  fuenteBrat = fontkit.create(readFileSync(RUTA_FUENTE))
  return fuenteBrat
}

function normalizarEntrada(texto) {
  return String(texto || '')
    .replace(/\\n/gi, '\n')
    .replace(/\r\n/g, '\n')
    .trim()
}

export function normalizarTextoBrat(texto) {
  return normalizarEntrada(texto)
}

export function dividirGrafemas(texto) {
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

/**
 * Calcula la posición definitiva de cada token. Se hace una sola vez para que
 * el texto no baile mientras `/brat2` lo va revelando.
 */
function planearLinea(tokens, tamanoFuente, y) {
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

  const total = natural + espacio * cantidadEspacios
  if (total > CONTENT_WIDTH && cantidadEspacios > 0) {
    espacio = Math.max(4, (CONTENT_WIDTH - natural) / cantidadEspacios)
  }

  let x = PADDING
  const items = []

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    const anchoT = anchos[i]
    const esUltimo = i === tokens.length - 1

    if (esUltimo) {
      const inicioMax = PADDING + CONTENT_WIDTH - anchoT
      if (x > inicioMax) x = Math.max(PADDING, inicioMax)
    }

    items.push({
      token,
      x,
      ancho: anchoT,
      grafemas: token.type === 'emoji' ? [token.text] : dividirGrafemas(token.text)
    })

    x += anchoT
    if (i < tokens.length - 1) x += espacio
  }

  return {
    y,
    tamanoFuente,
    tamanoEmoji,
    emojiY,
    items,
    totalGrafemas: items.reduce((total, item) => total + item.grafemas.length, 0)
  }
}

async function renderLinea(plan, visibles = Infinity) {
  const partes = []
  let restantes = visibles

  for (const item of plan.items) {
    if (restantes <= 0) break
    const cantidad = Math.min(restantes, item.grafemas.length)

    if (item.token.type === 'emoji') {
      if (cantidad >= item.grafemas.length) {
        const png = await obtenerPngEmoji(item.token.text)
        if (png) {
          const b64 = png.toString('base64')
          partes.push(
            `<image x="${item.x.toFixed(2)}" y="${plan.emojiY.toFixed(2)}" ` +
              `width="${plan.tamanoEmoji}" height="${plan.tamanoEmoji}" ` +
              `href="data:image/png;base64,${b64}" ` +
              `xlink:href="data:image/png;base64,${b64}" />`
          )
        }
      }
    } else if (cantidad > 0) {
      const textoVisible = item.grafemas.slice(0, cantidad).join('')
      partes.push(textoAPathsSvg(textoVisible, item.x, plan.y, plan.tamanoFuente))
    }

    restantes -= cantidad
  }

  return partes.filter(Boolean).join('')
}

async function lineaASvg(tokens, tamanoFuente, y) {
  return renderLinea(planearLinea(tokens, tamanoFuente, y))
}

function envolverSvg(partes) {
  return `<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <rect width="100%" height="100%" fill="${BG}"/>
  ${partes.join('\n  ')}
</svg>`
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

  return envolverSvg(partes)
}

function planearDiseno(texto) {
  const { lineas, tamanoFuente, alturaLinea } = ajustarDiseno(texto)
  const alturaBloque = lineas.length * alturaLinea
  let y = PADDING + Math.max(0, (MAX_HEIGHT - alturaBloque) / 2) + tamanoFuente * 0.8

  const planes = []
  for (const tokens of lineas) {
    if (!tokens.length) {
      y += alturaLinea
      continue
    }
    planes.push(planearLinea(tokens, tamanoFuente, y))
    y += alturaLinea
  }

  return {
    planes,
    totalGrafemas: planes.reduce((total, plan) => total + plan.totalGrafemas, 0)
  }
}

async function construirSvgParcial(planes, visibles) {
  const partes = []
  let restantes = Math.max(0, visibles)

  for (const plan of planes) {
    if (restantes <= 0) break
    const cantidad = Math.min(restantes, plan.totalGrafemas)
    if (cantidad > 0) {
      const linea = await renderLinea(plan, cantidad)
      if (linea) partes.push(linea)
    }
    restantes -= cantidad
  }

  return envolverSvg(partes)
}

export async function textoAStickerBrat(textoCrudo) {
  obtenerFuente()

  // Se conserva tal cual se escribió: sin toLowerCase() ni cambios de caso.
  const texto = normalizarEntrada(textoCrudo)
  if (!texto) throw new Error('El texto Brat está vacío.')

  await precargarEmojis(texto)
  const { lineas, tamanoFuente, alturaLinea } = ajustarDiseno(texto)
  const svg = await construirSvg(lineas, tamanoFuente, alturaLinea)

  return sharp(Buffer.from(svg))
    .resize(SIZE, SIZE)
    .blur(BLUR_BRAT)
    .webp({ quality: 95 })
    .toBuffer()
}

function repartirDuracion(totalMs, cantidad) {
  const base = Math.floor(totalMs / cantidad)
  let resto = totalMs - base * cantidad
  return Array.from({ length: cantidad }, () => {
    const extra = resto > 0 ? 1 : 0
    if (resto > 0) resto -= 1
    return base + extra
  })
}

export function planificarReveladoBrat2(segundos, totalGrafemas) {
  const duracionMs = Math.round(segundos * 1000)
  const frames = Math.min(
    BRAT2_MAX_FRAMES,
    Math.max(2, Math.round(segundos * BRAT2_FPS))
  )
  const delays = repartirDuracion(duracionMs, frames)
  const reveladoMs = Math.max(1, Math.round(duracionMs * BRAT2_REVEAL_RATIO))
  let transcurrido = 0

  const pasos = delays.map(delay => {
    const progreso = Math.min(1, transcurrido / reveladoMs)
    const visibles = Math.min(totalGrafemas, Math.ceil(progreso * totalGrafemas))
    transcurrido += delay
    return visibles
  })

  if (pasos.length) pasos[pasos.length - 1] = totalGrafemas

  return { frames, delays, pasos, duracionMs, reveladoMs }
}

export function parsearBrat2(entrada) {
  const crudo = String(entrada ?? '')
  const separador = crudo.indexOf('|')

  if (separador === -1) {
    throw new ErrorBrat2('Formato incorrecto. Usa "segundos|texto", por ejemplo: 4|Hola mundo.')
  }

  const segundosTexto = crudo.slice(0, separador).trim()
  const texto = normalizarEntrada(crudo.slice(separador + 1))

  if (!segundosTexto) {
    throw new ErrorBrat2('Falta la duración antes del "|". Ejemplo: 4|Hola mundo.')
  }
  if (!texto) {
    throw new ErrorBrat2('Falta el texto después del "|". Ejemplo: 4|Hola mundo.')
  }
  if (!/^\d+$/.test(segundosTexto)) {
    throw new ErrorBrat2(
      `La duración debe ser un número entero de segundos (${BRAT2_MIN_SEGUNDOS} a ${BRAT2_MAX_SEGUNDOS}).`
    )
  }

  const segundos = Number(segundosTexto)
  if (segundos < BRAT2_MIN_SEGUNDOS || segundos > BRAT2_MAX_SEGUNDOS) {
    throw new ErrorBrat2(
      `La duración debe estar entre ${BRAT2_MIN_SEGUNDOS} y ${BRAT2_MAX_SEGUNDOS} segundos (tienes ${segundos}).`
    )
  }

  const totalGrafemas = dividirGrafemas(texto).length
  if (totalGrafemas > BRAT2_MAX_TEXT) {
    throw new ErrorBrat2(
      `Texto demasiado largo. Máximo ${BRAT2_MAX_TEXT} caracteres (tienes ${totalGrafemas}).`
    )
  }

  return { segundos, texto }
}

async function codificarWebpAnimado(frames, delays) {
  let mejor = null

  for (const quality of [88, 78, 68, 58]) {
    const buffer = await sharp(frames, { join: { animated: true } })
      .webp({
        quality,
        alphaQuality: 100,
        effort: 4,
        loop: 0,
        delay: delays
      })
      .toBuffer()

    if (!mejor || buffer.length < mejor.length) mejor = buffer
    if (buffer.length <= BRAT2_MAX_BYTES) return buffer
  }

  return mejor
}

export async function textoAStickerBrat2(textoCrudo, segundos) {
  obtenerFuente()

  const duracion = Number(segundos)
  if (!Number.isInteger(duracion) || duracion < BRAT2_MIN_SEGUNDOS || duracion > BRAT2_MAX_SEGUNDOS) {
    throw new ErrorBrat2(
      `La duración debe ser un número entero entre ${BRAT2_MIN_SEGUNDOS} y ${BRAT2_MAX_SEGUNDOS} segundos.`
    )
  }

  const texto = normalizarEntrada(textoCrudo)
  if (!texto) throw new ErrorBrat2('El texto Brat animado está vacío.')

  const totalTexto = dividirGrafemas(texto).length
  if (totalTexto > BRAT2_MAX_TEXT) {
    throw new ErrorBrat2(
      `Texto demasiado largo. Máximo ${BRAT2_MAX_TEXT} caracteres (tienes ${totalTexto}).`
    )
  }

  await precargarEmojis(texto)
  const { planes, totalGrafemas } = planearDiseno(texto)
  if (!totalGrafemas) throw new ErrorBrat2('No hay texto visible para animar.')

  const plan = planificarReveladoBrat2(duracion, totalGrafemas)
  const cacheFrames = new Map()
  const frames = []

  for (const visibles of plan.pasos) {
    if (!cacheFrames.has(visibles)) {
      const svg = await construirSvgParcial(planes, visibles)
      const png = await sharp(Buffer.from(svg))
        .resize(SIZE, SIZE)
        .blur(BLUR_BRAT)
        .png()
        .toBuffer()
      cacheFrames.set(visibles, png)
    }
    frames.push(cacheFrames.get(visibles))
  }

  return codificarWebpAnimado(frames, plan.delays)
}
