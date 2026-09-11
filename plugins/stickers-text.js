import fs from 'fs'
import path from 'path'
import fluent from 'fluent-ffmpeg'
import sharp from '../lib/sharp.js'
import { addExif } from '../lib/sticker.js'
import { resolveStickerMeta } from './stickers-sticker.js'

const SIZE = 512
const FRAME_COUNT = 12
const FRAME_DELAY_MS = 100
const MAX_TEXT = 80
const MAX_LINES = 5
const PADDING_X = 48
const FONT_SCALE = 1.15

function escaparXml(texto) {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function hslAHex(h, s, l) {
  const saturacion = s / 100
  const luminosidad = l / 100
  const k = n => (n + h / 30) % 12
  const a = saturacion * Math.min(luminosidad, 1 - luminosidad)
  const f = n => luminosidad - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  const aHex = x => Math.round(255 * x).toString(16).padStart(2, '0')
  return `#${aHex(f(0))}${aHex(f(8))}${aHex(f(4))}`
}

function estimarMaxCaracteres(tamanoFuente) {
  const anchoPromedioChar = tamanoFuente * 0.58
  const anchoMaximo = SIZE - PADDING_X * 2
  return Math.max(4, Math.floor(anchoMaximo / anchoPromedioChar))
}

function envolverParrafo(parrafo, maxCaracteres) {
  const palabras = parrafo.split(/\s+/).filter(Boolean)
  if (!palabras.length) return []

  const lineas = []
  let actual = ''

  for (const palabra of palabras) {
    const prueba = actual ? `${actual} ${palabra}` : palabra

    if (prueba.length <= maxCaracteres) {
      actual = prueba
      continue
    }

    if (actual) lineas.push(actual)

    if (palabra.length > maxCaracteres) {
      for (let i = 0; i < palabra.length; i += maxCaracteres) {
        lineas.push(palabra.slice(i, i + maxCaracteres))
      }
      actual = ''
    } else {
      actual = palabra
    }
  }

  if (actual) lineas.push(actual)
  return lineas
}

function envolverTexto(texto, maxCaracteres) {
  const partes = texto.split('\n').map(parte => parte.trim())
  const lineas = []

  for (const parte of partes) {
    if (!parte) {
      if (lineas.length && lineas[lineas.length - 1] !== '') lineas.push('')
      continue
    }
    lineas.push(...envolverParrafo(parte, maxCaracteres))
  }

  return lineas.length ? lineas : [texto]
}

function calcularDiseno(texto) {
  const crudo = texto.trim()
  const longitud = crudo.replace(/\n/g, ' ').length

  let tamanoFuente = 72
  if (longitud <= 6) tamanoFuente = 88
  else if (longitud <= 12) tamanoFuente = 72
  else if (longitud <= 24) tamanoFuente = 58
  else if (longitud <= 40) tamanoFuente = 48
  else tamanoFuente = 40

  let maxCaracteres = estimarMaxCaracteres(tamanoFuente)
  let lineas = envolverTexto(crudo, maxCaracteres)

  while (lineas.length > MAX_LINES && tamanoFuente > 28) {
    tamanoFuente -= 6
    maxCaracteres = estimarMaxCaracteres(tamanoFuente)
    lineas = envolverTexto(crudo, maxCaracteres)
  }

  if (lineas.length > MAX_LINES) {
    lineas = lineas.slice(0, MAX_LINES)
    const ultimo = lineas[MAX_LINES - 1]
    lineas[MAX_LINES - 1] = ultimo.length > 3 ? `${ultimo.slice(0, -1)}…` : `${ultimo}…`
  }

  tamanoFuente = Math.round(tamanoFuente * FONT_SCALE)

  return { lines, fontSize }
}

function construirSvgTexto(lineas, color, tamanoFuente) {
  const alturaLinea = tamanoFuente * 1.18
  const alturaBloque = lineas.length * alturaLinea
  const inicioY = (SIZE - alturaBloque) / 2 + tamanoFuente * 0.82

  const tspans = lineas.map((linea, indice) => {
    const y = inicioY + indice * alturaLinea
    const contenido = linea === '' ? ' ' : escaparXml(linea)
    return `<tspan x="256" y="${y}">${contenido}</tspan>`
  }).join('')

  return `<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="transparent"/>
  <text font-family="Arial Black, Impact, Arial, sans-serif"
    font-size="${tamanoFuente}" font-weight="900" fill="${color}"
    text-anchor="middle">${tspans}</text>
</svg>`
}

function resolverTexto(m, args) {
  const desdeArgs = (args.join(' ') || '').trim()
  const desdeCita = (m.quoted?.text || '').trim()
  return desdeArgs || desdeCita
}

async function renderizarFotogramas(texto) {
  const diseno = calcularDiseno(texto)
  const dirTemp = path.join(process.cwd(), 'tmp', `st_${Date.now()}`)
  fs.mkdirSync(dirTemp, { recursive: true })

  const rutasFotogramas = []

  for (let i = 0; i < FRAME_COUNT; i++) {
    const matiz = (i / FRAME_COUNT) * 360
    const color = hslAHex(matiz, 100, 58)
    const svg = construirSvgTexto(diseno.lines, color, diseno.fontSize)
    const rutaFotograma = path.join(dirTemp, `frame_${String(i).padStart(3, '0')}.png`)

    await sharp(Buffer.from(svg))
      .resize(SIZE, SIZE)
      .png()
      .toFile(rutaFotograma)

    rutasFotogramas.push(rutaFotograma)
  }

  return { tmpDir, framePaths }
}

async function fotogramasAWebpAnimado(dirTemp) {
  const salida = path.join(dirTemp, 'anim.webp')
  const entrada = path.join(dirTemp, 'frame_%03d.png')

  return new Promise((resolve, reject) => {
    fluent()
      .input(entrada)
      .inputFPS(1000 / FRAME_DELAY_MS)
      .addOutputOptions([
        '-vcodec', 'libwebp',
        '-vf', 'scale=512:512:flags=lanczos:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000',
        '-loop', '0',
        '-preset', 'default',
        '-an',
        '-vsync', '0',
        '-q:v', '85'
      ])
      .toFormat('webp')
      .save(salida)
      .on('end', () => {
        try {
          resolve(fs.readFileSync(salida))
        } catch (error) {
          reject(error)
        }
      })
      .on('error', reject)
  })
}

function limpiarDirectorio(directorio) {
  if (!directorio || !fs.existsSync(directorio)) return
  try {
    for (const archivo of fs.readdirSync(directorio)) {
      fs.unlinkSync(path.join(directorio, archivo))
    }
    fs.rmdirSync(directorio)
  } catch {}
}

let handler = async (m, { conn, args, usedPrefix, command }) => {
  let dirTemp = ''

  try {
    const texto = resolverTexto(m, args)

    if (!texto) {
      return conn.sendMessage(m.chat, {
        text: `*[❗] Escribe el texto del sticker animado o respondé a un mensaje.*\n\nEjemplos:\n> ${usedPrefix + command} Hola\n> ${usedPrefix + command} Pain Bot oficial\n> ${usedPrefix + command} línea uno\\nlínea dos\n> (respondé un mensaje con ${usedPrefix + command})`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    if (texto.length > MAX_TEXT) {
      return conn.sendMessage(m.chat, {
        text: `*[❗] Texto muy largo.* Máximo ${MAX_TEXT} caracteres (tienes ${texto.length}).`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    const { packname, author } = resolveStickerMeta(m, conn)

    const renderizado = await renderizarFotogramas(texto)
    dirTemp = renderizado.tmpDir

    const webpAnimado = await fotogramasAWebpAnimado(dirTemp)
    const stickerFinal = await addExif(webpAnimado, packname, author)

    await conn.sendFile(m.chat, stickerFinal, 'sticker.webp', '', m, null, {
      contextInfo: { ...rcanal.contextInfo }
    })
  } catch (error) {
    console.error('[st] Error:', error)
    conn.sendMessage(m.chat, {
      text: `*[❌] Error al crear sticker animado: ${error.message || 'desconocido'}*\n\nVerificá que FFmpeg esté instalado.`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  } finally {
    limpiarDirectorio(dirTemp)
  }
}

handler.help = ['#st + {texto o responder mensaje} → sticker animado con texto de colores']
handler.tags = ['stickers']
handler.command = ['st', 'stext', 'stickertext', 'textsticker', 'stickeranim']

export default handler
