import sharp from '../lib/sharp.js'
import fetch from 'node-fetch'
import { webp2png } from '../lib/webp2mp4.js'



const MAX_TEXTO = 220
const CDN_EMOJI_WA = 'https://cdn.jsdelivr.net/gh/realityripple/emoji/whatsapp'
const EMOJI_WA_RESERVA = 'https://emoji-cdn.mqrio.dev'

const cachePngEmoji = new Map()
const cacheAnchoTexto = new Map()
const segmentadorGrafemas =
  typeof Intl !== 'undefined' && Intl.Segmenter
    ? new Intl.Segmenter('und', { granularity: 'grapheme' })
    : null

function escaparXml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function normalizarEntrada(text) {
  return String(text || '')
    .replace(/\\n/gi, '\n')
    .replace(/\r\n/g, '\n')
    .trim()
}

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
  throw new Error('El archivo no es una imagen')
}

function partirGrafemas(text) {
  if (!text) return []
  if (segmentadorGrafemas) {
    return [...segmentadorGrafemas.segment(text)].map(s => s.segment)
  }
  return [...text]
}

function esPuntoCodigoEmoji(cp) {
  if (cp == null) return false
  if (cp === 0xfe0f || cp === 0x200d || cp === 0x20e3) return true
  return (
    (cp >= 0x1f300 && cp <= 0x1faff) ||
    (cp >= 0x1f600 && cp <= 0x1f64f) ||
    (cp >= 0x1f680 && cp <= 0x1f6ff) ||
    (cp >= 0x1f900 && cp <= 0x1f9ff) ||
    (cp >= 0x2600 && cp <= 0x27bf) ||
    (cp >= 0x2300 && cp <= 0x23ff) ||
    (cp >= 0x1f1e6 && cp <= 0x1f1ff)
  )
}

function esGrafemaEmoji(segmento) {
  if (!segmento) return false
  return [...segmento].some(caracter => esPuntoCodigoEmoji(caracter.codePointAt(0)))
}

function emojiACodigos(emoji) {
  const cps = [...emoji].map(caracter => caracter.codePointAt(0).toString(16))
  const conFe0f = cps.join('-')
  const sinFe0f = cps.filter(code => code !== 'fe0f').join('-')
  const codigos = [conFe0f, sinFe0f]
  if (!cps.includes('fe0f') && sinFe0f) codigos.push(`${sinFe0f}-fe0f`)
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
    for (const code of emojiACodigos(emoji)) {
      const bufer = await obtenerPng(`${CDN_EMOJI_WA}/${code}.png`)
      if (bufer) {
        cachePngEmoji.set(emoji, bufer)
        return bufer
      }
    }
    const bufer = await obtenerPng(
      `${EMOJI_WA_RESERVA}/${encodeURIComponent(emoji)}?style=whatsapp`
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

async function precargarEmojis(text) {
  await Promise.all(
    partirGrafemas(text)
      .filter(esGrafemaEmoji)
      .map(g => obtenerPngEmoji(g))
  )
}

function tokenizar(text) {
  const tokens = []
  let buf = ''
  const vaciar = () => {
    if (!buf) return
    tokens.push({ type: 'text', text: buf })
    buf = ''
  }
  for (const g of partirGrafemas(text)) {
    if (esGrafemaEmoji(g)) {
      vaciar()
      tokens.push({ type: 'emoji', text: g })
      continue
    }
    if (/\s/.test(g)) {
      vaciar()
      continue
    }
    buf += g
  }
  vaciar()
  return tokens
}

function trazoPorTamano(tamanoFuente) {
  return Math.max(5, Math.round(tamanoFuente * 0.16))
}


function attrsFuente(tamanoFuente, { relleno = '#fff', trazo = null, anchoDeTrazo = 0 } = {}) {
  let s =
    `font-family="Impact, Arial Black, Arial, Helvetica, sans-serif" ` +
    `font-size="${tamanoFuente}" font-weight="900" fill="${relleno}" ` +
    `text-anchor="start" dominant-baseline="alphabetic"`
  if (trazo && anchoDeTrazo > 0) {
    s +=
      ` stroke="${trazo}" stroke-width="${anchoDeTrazo}" ` +
      `paint-order="stroke fill" stroke-linejoin="round" stroke-linecap="round"`
  }
  return s
}


async function medirAnchoTexto(text, tamanoFuente, anchoTrazo) {
  const clave = `${tamanoFuente}:${anchoTrazo}::${text}`
  if (cacheAnchoTexto.has(clave)) return cacheAnchoTexto.get(clave)

  const padX = Math.max(20, anchoTrazo + 8)
  const alto = Math.ceil(tamanoFuente * 2.6 + anchoTrazo * 2)
  const estimacion = Math.ceil(tamanoFuente * Math.max(1, text.length) * 1.2 + padX * 2 + anchoTrazo * 2)
  const ancho = Math.min(2400, Math.max(120, estimacion))

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <text x="${padX}" y="${Math.round(tamanoFuente * 1.45 + anchoTrazo)}" ${attrsFuente(tamanoFuente, {
    fill: '#000000',
    stroke: '#000000',
    strokeWidth: anchoTrazo
  })}>${escaparXml(text)}</text>
</svg>`

  try {
    const { datos, informacion } = await sharp(Buffer.from(svg))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    let minX = informacion.width
    let maxX = -1
    for (let i = 0; i < datos.length; i += 4) {
      if (datos[i] < 248 || datos[i + 1] < 248 || datos[i + 2] < 248) {
        const x = (i / 4) % informacion.width
        if (x < minX) minX = x
        if (x > maxX) maxX = x
      }
    }

   
    const medido =
      maxX >= minX ? maxX - minX + 1 + 6 : Math.ceil(tamanoFuente * text.length * 0.7 + anchoTrazo * 2)
    cacheAnchoTexto.set(clave, medido)
    return medido
  } catch {
    const reserva = Math.ceil(tamanoFuente * text.length * 0.72 + anchoTrazo * 2)
    cacheAnchoTexto.set(clave, reserva)
    return reserva
  }
}

function tamanoEmoji(tamanoFuente) {
  return Math.round(tamanoFuente * 1.08)
}


function anchoRanuraEmoji(tamanoFuente, anchoTrazo) {
  return tamanoEmoji(tamanoFuente) + Math.round(anchoTrazo * 0.6)
}

function espacioPara(tamanoFuente, anchoTrazo) {
 
  return Math.max(14, Math.round(tamanoFuente * 0.28 + anchoTrazo * 0.5))
}

async function anchoToken(token, tamanoFuente, anchoTrazo) {
  if (token.type === 'emoji') return anchoRanuraEmoji(tamanoFuente, anchoTrazo)
  return medirAnchoTexto(token.text, tamanoFuente, anchoTrazo)
}

async function anchoLinea(tokens, tamanoFuente, anchoTrazo, espacio) {
  if (!tokens.length) return 0
  let w = 0
  for (let i = 0; i < tokens.length; i++) {
    w += await anchoToken(tokens[i], tamanoFuente, anchoTrazo)
    if (i < tokens.length - 1) w += espacio
  }
  return w
}

async function envolverTokens(tokens, tamanoFuente, anchoTrazo, anchoMax) {
  const espacio = espacioPara(tamanoFuente, anchoTrazo)
  const lineas = []
  let actual = []
  for (const token of tokens) {
    const test = [...actual, token]
    const w = await anchoLinea(test, tamanoFuente, anchoTrazo, espacio)
    if (w <= anchoMax || actual.length === 0) {
      actual.push(token)
      continue
    }
    lineas.push(actual)
    actual = [token]
  }
  if (actual.length) lineas.push(actual)
  return lineas
}

async function envolverTexto(text, tamanoFuente, anchoTrazo, anchoMax) {
  const lineas = []
  for (const parrafo of text.split('\n')) {
    const recortado = parrafo.trim()
    if (!recortado) {
      if (lineas.length) lineas.push([])
      continue
    }
    lineas.push(...(await envolverTokens(tokenizar(recortado), tamanoFuente, anchoTrazo, anchoMax)))
  }
  return lineas.length ? lineas : [tokenizar(text)]
}

async function ajustarFuente(text, imgW) {
  const anchoMax = Math.floor(imgW * 0.88)
  const altoBloqueMax = Math.floor(imgW * 0.4)
  let tamanoFuente = Math.max(28, Math.min(92, Math.round(imgW * 0.085)))

  let lineas = []
  let anchoTrazo = trazoPorTamano(tamanoFuente)

  while (tamanoFuente >= 18) {
    anchoTrazo = trazoPorTamano(tamanoFuente)
    lineas = await envolverTexto(text, tamanoFuente, anchoTrazo, anchoMax)
    const altoLineaCalc = tamanoFuente * 1.28
    const altoBloque = lineas.length * altoLineaCalc
    const espacio = espacioPara(tamanoFuente, anchoTrazo)
    let ok = altoBloque <= altoBloqueMax
    if (ok) {
      for (const linea of lineas) {
        if ((await anchoLinea(linea, tamanoFuente, anchoTrazo, espacio)) > anchoMax) {
          ok = false
          break
        }
      }
    }
    if (ok) break
    tamanoFuente -= 2
  }

  if (tamanoFuente < 18) {
    tamanoFuente = 18
    anchoTrazo = trazoPorTamano(tamanoFuente)
    lineas = await envolverTexto(text, tamanoFuente, anchoTrazo, anchoMax)
  }

  return {
    lineas,
    tamanoFuente,
    anchoTrazo,
    lineHeight: tamanoFuente * 1.28,
    anchoMax
  }
}

async function construirSvgSuperposicion(ancho, alto, lineas, tamanoFuente, anchoTrazo, altoLinea) {
  const cx = ancho / 2
  const padSuperior = Math.max(28, Math.round(alto * 0.04))
  const espacio = espacioPara(tamanoFuente, anchoTrazo)
  const tamEmoji = tamanoEmoji(tamanoFuente)
  const ranuraEmoji = anchoRanuraEmoji(tamanoFuente, anchoTrazo)

  let y = padSuperior + tamanoFuente * 0.95
  const partes = []

  for (const tokens of lineas) {
    if (!tokens.length) {
      y += altoLinea
      continue
    }

    const anchos = []
    for (const t of tokens) anchos.push(await anchoToken(t, tamanoFuente, anchoTrazo))
    const total = anchos.reduce((a, b) => a + b, 0) + espacio * Math.max(0, tokens.length - 1)
    let x = cx - total / 2

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]
      const tw = anchos[i]

      if (token.type === 'emoji') {
        const png = await obtenerPngEmoji(token.text)
        
        const dibujarX = x + (ranuraEmoji - tamEmoji) / 2
        const ey = y - tamanoFuente * 0.9
        if (png) {
          const b64 = png.toString('base64')
          partes.push(
            `<image x="${dibujarX.toFixed(1)}" y="${ey.toFixed(1)}" width="${tamEmoji}" height="${tamEmoji}" ` +
              `href="data:image/png;base64,${b64}" xlink:href="data:image/png;base64,${b64}"/>`
          )
        }
      } else {
        
        partes.push(
          `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" ` +
            `${attrsFuente(tamanoFuente, {
              fill: '#ffffff',
              stroke: '#000000',
              strokeWidth: anchoTrazo
            })}>` +
            `${escaparXml(token.text)}</text>`
        )
      }

      x += tw
      if (i < tokens.length - 1) x += espacio
    }
    y += altoLinea
  }

  return Buffer.from(
    `<svg width="${ancho}" height="${alto}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  ${partes.join('\n  ')}
</svg>`
  )
}

async function agregarTextoEnImagen(buferFoto, textoCrudo) {
  const text = normalizarEntrada(textoCrudo)
  await precargarEmojis(text)

  const metadatos = await sharp(buferFoto).rotate().metadata()
  let ancho = metadatos.width || 1080
  let alto = metadatos.height || 1080

  const ladoMax = 1600
  if (ancho > ladoMax || alto > ladoMax) {
    const escala = Math.min(ladoMax / ancho, ladoMax / alto)
    ancho = Math.round(ancho * escala)
    alto = Math.round(alto * escala)
  }

  const redimensionado = await sharp(buferFoto)
    .rotate()
    .resize(ancho, alto, { fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer()

  const informacion = await sharp(redimensionado).metadata()
  ancho = informacion.width
  alto = informacion.height

  const { lineas, tamanoFuente, anchoTrazo, altoLinea } = await ajustarFuente(text, ancho)
  const superposicion = await construirSvgSuperposicion(ancho, alto, lineas, tamanoFuente, anchoTrazo, altoLinea)

  return sharp(redimensionado)
    .composite([{ input: superposicion, top: 0, left: 0 }])
    .jpeg({ quality: 92 })
    .toBuffer()
}

function resolverTexto(m, text, usedPrefix, command) {
  const textoLeyenda = text || m.msg?.caption || ''
  return normalizarEntrada(
    String(textoLeyenda).replace(new RegExp(`^\\s*${usedPrefix}?${command}\\s*`, 'i'), '')
  )
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
  try {
    const objetivo = resolverObjetivoMedio(m)
    const textoMsg = resolverTexto(m, text, usedPrefix, command)

    if (!objetivo) {
      return conn.reply(
        m.chat,
        `*[❗] Responde a una foto (o envíala con el comando) y escribe el texto.*\n\n` +
          `Ejemplos:\n` +
          `> ${usedPrefix + command} mira esto aquí ❤️\n` +
          `> ${usedPrefix + command} línea uno\\nlínea dos`,
        m,
        global.rcanal
      )
    }

    if (!textoMsg) {
      return conn.reply(
        m.chat,
        `*[❗] Escribe el texto que irá arriba de la imagen.*\n` +
          `> ${usedPrefix + command} tu texto aquí 🔥`,
        m,
        global.rcanal
      )
    }

    if (textoMsg.length > MAX_TEXTO) {
      return conn.reply(
        m.chat,
        `*[❗] Texto muy largo.* Máximo ${MAX_TEXTO} caracteres.`,
        m,
        global.rcanal
      )
    }

    const mime = (objetivo.msg || objetivo).mimetype || objetivo.mediaType || ''
    const medio = await objetivo.download()
    const foto = await cargarBuferImagen(medio, mime)

    await conn.sendMessage(m.chat, { react: { text: '', key: m.key } }).catch(() => {})

    const resultado = await agregarTextoEnImagen(foto, textoMsg)
    await conn.sendFile(m.chat, resultado, 'sfimg.jpg', '', m, null, global.rcanal)
  } catch (e) {
    console.error('[sfimg]', e)
    return conn.reply(
      m.chat,
      `*[❌] Error al poner el texto en la imagen.*\n> ${e?.message || e}`,
      m,
      global.rcanal
    )
  }
}

handler.help = ['#sfimg + {foto + texto} → texto blanco con borde negro.']
handler.tags = ['tools', 'img']
handler.command = ['sfimg', 'fototexto', 'memefoto']

export default handler
