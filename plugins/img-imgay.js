import sharp from '../lib/sharp.js'
import fetch from 'node-fetch'
import { decodeImageToPng, sharpMetadata, sharpResizePng } from '../lib/image-buffer.js'



const MAX_TEXT = 180
const DEFAULT_TEXT = ''
const FLAG_OPACITY = 0.41


const PRIDE_COLORS = ['#E40303', '#FF8C00', '#FFED00', '#008026', '#24408E', '#732982']

const WA_EMOJI_CDN = 'https://cdn.jsdelivr.net/gh/realityripple/emoji/whatsapp'
const WA_EMOJI_FALLBACK = 'https://emoji-cdn.mqrio.dev'

const emojiPngCache = new Map()
const textWidthCache = new Map()
const graphemeSegmenter =
  typeof Intl !== 'undefined' && Intl.Segmenter
    ? new Intl.Segmenter('und', { granularity: 'grapheme' })
    : null

function escapeXml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function normalizeInput(text) {
  return String(text || '')
    .replace(/\\n/gi, '\n')
    .replace(/\r\n/g, '\n')
    .trim()
}

function isImageMedia(mime = '', mtype = '') {
  return /image|webp|sticker/i.test(mime) || /imageMessage|stickerMessage/i.test(mtype)
}

function resolveMediaTarget(m) {
  if (m.quoted) {
    const mime = (m.quoted.msg || m.quoted).mimetype || m.quoted.mediaType || ''
    const mtype = m.quoted.mtype || ''
    if (isImageMedia(mime, mtype) && m.quoted.download) return m.quoted
  }
  const mime = (m.msg || m).mimetype || m.mediaType || ''
  const mtype = m.mtype || ''
  if (isImageMedia(mime, mtype) && m.download) return m
  return null
}

async function loadImageBuffer(media, mime) {
  return decodeImageToPng(media, mime)
}

function splitGraphemes(text) {
  if (!text) return []
  if (graphemeSegmenter) {
    return [...graphemeSegmenter.segment(text)].map(s => s.segment)
  }
  return [...text]
}

function isEmojiCodePoint(cp) {
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

function isEmojiGrapheme(segment) {
  if (!segment) return false
  return [...segment].some(char => isEmojiCodePoint(char.codePointAt(0)))
}

function emojiToCodes(emoji) {
  const cps = [...emoji].map(char => char.codePointAt(0).toString(16))
  const withFe0f = cps.join('-')
  const withoutFe0f = cps.filter(code => code !== 'fe0f').join('-')
  const codes = [withFe0f, withoutFe0f]
  if (!cps.includes('fe0f') && withoutFe0f) codes.push(`${withoutFe0f}-fe0f`)
  return [...new Set(codes.filter(Boolean))]
}

async function fetchPng(url) {
  const res = await fetch(url)
  if (!res.ok) return null
  const type = String(res.headers.get('content-type') || '')
  if (!type.includes('png') && !type.includes('octet-stream') && !type.includes('image')) {
    return null
  }
  const buffer = Buffer.from(await res.arrayBuffer())
  return buffer.length > 100 ? buffer : null
}

async function getEmojiPng(emoji) {
  if (emojiPngCache.has(emoji)) return emojiPngCache.get(emoji)
  try {
    for (const code of emojiToCodes(emoji)) {
      const buffer = await fetchPng(`${WA_EMOJI_CDN}/${code}.png`)
      if (buffer) {
        emojiPngCache.set(emoji, buffer)
        return buffer
      }
    }
    const buffer = await fetchPng(
      `${WA_EMOJI_FALLBACK}/${encodeURIComponent(emoji)}?style=whatsapp`
    )
    if (buffer) {
      emojiPngCache.set(emoji, buffer)
      return buffer
    }
    emojiPngCache.set(emoji, null)
    return null
  } catch {
    emojiPngCache.set(emoji, null)
    return null
  }
}

async function prefetchEmojis(text) {
  await Promise.all(
    splitGraphemes(text)
      .filter(isEmojiGrapheme)
      .map(g => getEmojiPng(g))
  )
}

function tokenize(text) {
  const tokens = []
  let buf = ''
  const flush = () => {
    if (!buf) return
    tokens.push({ type: 'text', text: buf })
    buf = ''
  }
  for (const g of splitGraphemes(text)) {
    if (isEmojiGrapheme(g)) {
      flush()
      tokens.push({ type: 'emoji', text: g })
      continue
    }
    if (/\s/.test(g)) {
      flush()
      continue
    }
    buf += g
  }
  flush()
  return tokens
}

function strokeForSize(fontSize) {
  return Math.max(5, Math.round(fontSize * 0.16))
}

function fontAttrs(fontSize, { fill = '#fff', stroke = null, strokeWidth = 0 } = {}) {
  let s =
    `font-family="Impact, Arial Black, Arial, Helvetica, sans-serif" ` +
    `font-size="${fontSize}" font-weight="900" fill="${fill}" ` +
    `text-anchor="start" dominant-baseline="alphabetic"`
  if (stroke && strokeWidth > 0) {
    s +=
      ` stroke="${stroke}" stroke-width="${strokeWidth}" ` +
      `paint-order="stroke fill" stroke-linejoin="round" stroke-linecap="round"`
  }
  return s
}

async function measureTextWidth(text, fontSize, strokeW) {
  const key = `${fontSize}:${strokeW}::${text}`
  if (textWidthCache.has(key)) return textWidthCache.get(key)

  const padX = Math.max(20, strokeW + 8)
  const height = Math.ceil(fontSize * 2.6 + strokeW * 2)
  const guess = Math.ceil(fontSize * Math.max(1, text.length) * 1.2 + padX * 2 + strokeW * 2)
  const width = Math.min(2400, Math.max(120, guess))

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <text x="${padX}" y="${Math.round(fontSize * 1.45 + strokeW)}" ${fontAttrs(fontSize, {
    fill: '#000000',
    stroke: '#000000',
    strokeWidth: strokeW
  })}>${escapeXml(text)}</text>
</svg>`

  try {
    const { data, info } = await sharp(Buffer.from(svg))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    let minX = info.width
    let maxX = -1
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] < 248 || data[i + 1] < 248 || data[i + 2] < 248) {
        const x = (i / 4) % info.width
        if (x < minX) minX = x
        if (x > maxX) maxX = x
      }
    }
    const measured =
      maxX >= minX ? maxX - minX + 1 + 6 : Math.ceil(fontSize * text.length * 0.7 + strokeW * 2)
    textWidthCache.set(key, measured)
    return measured
  } catch {
    const fallback = Math.ceil(fontSize * text.length * 0.72 + strokeW * 2)
    textWidthCache.set(key, fallback)
    return fallback
  }
}

function emojiSize(fontSize) {
  return Math.round(fontSize * 1.08)
}

function emojiSlotWidth(fontSize, strokeW) {
  return emojiSize(fontSize) + Math.round(strokeW * 0.6)
}

function gapFor(fontSize, strokeW) {
  return Math.max(14, Math.round(fontSize * 0.28 + strokeW * 0.5))
}

async function tokenWidth(token, fontSize, strokeW) {
  if (token.type === 'emoji') return emojiSlotWidth(fontSize, strokeW)
  return measureTextWidth(token.text, fontSize, strokeW)
}

async function lineWidth(tokens, fontSize, strokeW, gap) {
  if (!tokens.length) return 0
  let w = 0
  for (let i = 0; i < tokens.length; i++) {
    w += await tokenWidth(tokens[i], fontSize, strokeW)
    if (i < tokens.length - 1) w += gap
  }
  return w
}

async function wrapTokens(tokens, fontSize, strokeW, maxWidth) {
  const gap = gapFor(fontSize, strokeW)
  const lines = []
  let current = []
  for (const token of tokens) {
    const test = [...current, token]
    const w = await lineWidth(test, fontSize, strokeW, gap)
    if (w <= maxWidth || current.length === 0) {
      current.push(token)
      continue
    }
    lines.push(current)
    current = [token]
  }
  if (current.length) lines.push(current)
  return lines
}

async function wrapText(text, fontSize, strokeW, maxWidth) {
  const lines = []
  for (const para of text.split('\n')) {
    const trimmed = para.trim()
    if (!trimmed) {
      if (lines.length) lines.push([])
      continue
    }
    lines.push(...(await wrapTokens(tokenize(trimmed), fontSize, strokeW, maxWidth)))
  }
  return lines.length ? lines : [tokenize(text)]
}

async function fitFont(text, imgW) {
  const maxWidth = Math.floor(imgW * 0.88)
  const maxBlockH = Math.floor(imgW * 0.28)
  let fontSize = Math.max(26, Math.min(84, Math.round(imgW * 0.08)))
  let lines = []
  let strokeW = strokeForSize(fontSize)

  while (fontSize >= 18) {
    strokeW = strokeForSize(fontSize)
    lines = await wrapText(text, fontSize, strokeW, maxWidth)
    const lineH = fontSize * 1.28
    const blockH = lines.length * lineH
    const gap = gapFor(fontSize, strokeW)
    let ok = blockH <= maxBlockH
    if (ok) {
      for (const line of lines) {
        if ((await lineWidth(line, fontSize, strokeW, gap)) > maxWidth) {
          ok = false
          break
        }
      }
    }
    if (ok) break
    fontSize -= 2
  }

  if (fontSize < 18) {
    fontSize = 18
    strokeW = strokeForSize(fontSize)
    lines = await wrapText(text, fontSize, strokeW, maxWidth)
  }

  return { lines, fontSize, strokeW, lineHeight: fontSize * 1.28 }
}

function buildPrideOverlay(width, height) {
  const n = PRIDE_COLORS.length
  const band = height / n
  const rects = PRIDE_COLORS.map((color, i) => {
    const y = Math.floor(i * band)
    const h = i === n - 1 ? height - y : Math.ceil(band)
    return `<rect x="0" y="${y}" width="${width}" height="${h}" fill="${color}" fill-opacity="${FLAG_OPACITY}"/>`
  }).join('\n  ')

  return Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  ${rects}
</svg>`
  )
}

async function buildTextOverlay(width, height, lines, fontSize, strokeW, lineHeight) {
  const cx = width / 2
  const gap = gapFor(fontSize, strokeW)
  const emojiSz = emojiSize(fontSize)
  const emojiSlot = emojiSlotWidth(fontSize, strokeW)
  const blockH = Math.max(1, lines.length) * lineHeight
  const bottomPad = Math.max(22, Math.round(height * 0.04))
  
  let y = height - bottomPad - blockH + fontSize * 0.92

  const parts = []
 
  const strokeColor = '#1B1464'

  for (const tokens of lines) {
    if (!tokens.length) {
      y += lineHeight
      continue
    }

    const widths = []
    for (const t of tokens) widths.push(await tokenWidth(t, fontSize, strokeW))
    const total = widths.reduce((a, b) => a + b, 0) + gap * Math.max(0, tokens.length - 1)
    let x = cx - total / 2

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]
      const tw = widths[i]

      if (token.type === 'emoji') {
        const png = await getEmojiPng(token.text)
        const drawX = x + (emojiSlot - emojiSz) / 2
        const ey = y - fontSize * 0.9
        if (png) {
          const b64 = png.toString('base64')
          parts.push(
            `<image x="${drawX.toFixed(1)}" y="${ey.toFixed(1)}" width="${emojiSz}" height="${emojiSz}" ` +
              `href="data:image/png;base64,${b64}" xlink:href="data:image/png;base64,${b64}"/>`
          )
        }
      } else {
        parts.push(
          `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" ` +
            `${fontAttrs(fontSize, {
              fill: '#ffffff',
              stroke: strokeColor,
              strokeWidth: strokeW
            })}>` +
            `${escapeXml(token.text)}</text>`
        )
      }

      x += tw
      if (i < tokens.length - 1) x += gap
    }
    y += lineHeight
  }

  return Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  ${parts.join('\n  ')}
</svg>`
  )
}

export async function applyGayFilterRaster(photoBuffer, rawText) {
  const { Jimp } = await import('jimp')
  const { Resvg } = await import('@resvg/resvg-js')

  const text = normalizeInput(rawText) || DEFAULT_TEXT
  await prefetchEmojis(text)

  const decoded = await decodeImageToPng(photoBuffer)
  let img = await Jimp.read(decoded)

  const maxSide = 1600
  const w0 = img.bitmap.width
  const h0 = img.bitmap.height
  if (w0 > maxSide || h0 > maxSide) {
    const scale = Math.min(maxSide / w0, maxSide / h0)
    img.resize({
      w: Math.max(1, Math.round(w0 * scale)),
      h: Math.max(1, Math.round(h0 * scale))
    })
  }

  const width = img.bitmap.width
  const height = img.bitmap.height

  const renderSvg = (svgBuf) => {
    const resvg = new Resvg(svgBuf.toString('utf8'), {
      fitTo: { mode: 'width', value: width },
      font: { loadSystemFonts: true }
    })
    return Buffer.from(resvg.render().asPng())
  }

  const prideLayer = await Jimp.read(renderSvg(buildPrideOverlay(width, height)))
  img.composite(prideLayer, 0, 0)

  const { lines, fontSize, strokeW, lineHeight } = await fitFont(text, width)
  const textSvg = await buildTextOverlay(width, height, lines, fontSize, strokeW, lineHeight)
  const textLayer = await Jimp.read(renderSvg(textSvg))
  img.composite(textLayer, 0, 0)

  return img.getBuffer('image/jpeg', { quality: 92 })
}

async function applyGayFilterSharp(photoBuffer, rawText) {
  const text = normalizeInput(rawText) || DEFAULT_TEXT
  await prefetchEmojis(text)

  const meta = await sharpMetadata(photoBuffer)
  let width = meta.width || 1080
  let height = meta.height || 1080

  const maxSide = 1600
  if (width > maxSide || height > maxSide) {
    const scale = Math.min(maxSide / width, maxSide / height)
    width = Math.round(width * scale)
    height = Math.round(height * scale)
  }

  const resized = await sharpResizePng(photoBuffer, width, height)

  const info = await sharp(resized).metadata()
  width = info.width
  height = info.height

  const pride = buildPrideOverlay(width, height)
  const { lines, fontSize, strokeW, lineHeight } = await fitFont(text, width)
  const textSvg = await buildTextOverlay(width, height, lines, fontSize, strokeW, lineHeight)

  return sharp(resized)
    .composite([
      { input: pride, top: 0, left: 0 },
      { input: textSvg, top: 0, left: 0 }
    ])
    .jpeg({ quality: 92 })
    .toBuffer()
}

export async function applyGayFilter(photoBuffer, rawText) {
  try {
    return await applyGayFilterRaster(photoBuffer, rawText)
  } catch (e) {
    console.warn('[imgay] jimp+resvg falló, probando sharp:', e?.message || e)
    return applyGayFilterSharp(photoBuffer, rawText)
  }
}

function resolveText(m, text, usedPrefix, command) {
  const captionText = text || m.msg?.caption || ''
  return normalizeInput(
    String(captionText).replace(new RegExp(`^\\s*${usedPrefix}?${command}\\s*`, 'i'), '')
  )
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
  try {
    const target = resolveMediaTarget(m)
    const msgText = resolveText(m, text, usedPrefix, command)

    if (!target) {
      return conn.reply(
        m.chat,
        `*[❗] Responde a una foto (o envíala con el comando) y escribe el texto.*\n\n` +
          `Ejemplos:\n` +
          `> ${usedPrefix + command} Lo suponia\n` +
          `> ${usedPrefix + command} ya sabía 🏳️‍🌈\n` +
          `> Sin texto usa: *${DEFAULT_TEXT}*\n\n` +
          `> Sticker: *${usedPrefix}sgay*`,
        m,
        global.rcanal
      )
    }

    const finalText = msgText || DEFAULT_TEXT
    if (finalText.length > MAX_TEXT) {
      return conn.reply(
        m.chat,
        `*[❗] Texto muy largo.* Máximo ${MAX_TEXT} caracteres.`,
        m,
        global.rcanal
      )
    }

    const mime = (target.msg || target).mimetype || target.mediaType || ''
    const media = await target.download()
    const photo = await loadImageBuffer(media, mime)

    await conn.sendMessage(m.chat, { react: { text: '', key: m.key } }).catch(() => {})

    const out = await applyGayFilter(photo, finalText)
    await conn.sendFile(m.chat, out, 'imgay.jpg', '', m, null, global.rcanal)
  } catch (e) {
    console.error('[imgay]', e)
    return conn.reply(
      m.chat,
      `*[❌] Error al aplicar el filtro.*\n> ${e?.message || e}`,
      m,
      global.rcanal
    )
  }
}

handler.help = ['#imgay + {foto + texto} → filtro + texto (imagen)']
handler.tags = ['tools', 'img', 'fun']
handler.command = ['imgay', 'gayfilter', 'pridefilter']

export {
  resolveMediaTarget,
  loadImageBuffer,
  resolveText,
  normalizeInput,
  DEFAULT_TEXT,
  MAX_TEXT
}

export default handler
