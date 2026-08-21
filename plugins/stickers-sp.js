import sharp from '../lib/sharp.js'
import fetch from 'node-fetch'
import { addExif } from '../lib/sticker.js'
import { resolveStickerMeta } from './stickers-sticker.js'


const SIZE = 512
const PADDING = 40
const MAX_WIDTH = SIZE - PADDING * 2
const MAX_HEIGHT = SIZE - PADDING * 2

const SAFE_INSET = 26
const CONTENT_WIDTH = MAX_WIDTH - SAFE_INSET
const MAX_TEXT = 320
const LINE_RATIO = 1.25
const BG = '#F0F0F0'
const FG = '#000000'

const WA_EMOJI_CDN = 'https://cdn.jsdelivr.net/gh/realityripple/emoji/whatsapp'
const WA_EMOJI_FALLBACK = 'https://emoji-cdn.mqrio.dev'

const emojiPngCache = new Map()
const textWidthCache = new Map()
const graphemeSegmenter =
  typeof Intl !== 'undefined' && Intl.Segmenter
    ? new Intl.Segmenter('und', { granularity: 'grapheme' })
    : null

function escapeXml(text) {
  return String(text)
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
  const tasks = []
  for (const g of splitGraphemes(text)) {
    if (isEmojiGrapheme(g)) tasks.push(getEmojiPng(g))
  }
  await Promise.all(tasks)
}

function tokenize(text) {
  const tokens = []
  let buf = ''

  const flushText = () => {
    if (!buf) return
    tokens.push({ type: 'text', text: buf })
    buf = ''
  }

  for (const g of splitGraphemes(text)) {
    if (isEmojiGrapheme(g)) {
      flushText()
      tokens.push({ type: 'emoji', text: g })
      continue
    }
    if (/\s/.test(g)) {
      flushText()
      continue
    }
    buf += g
  }
  flushText()
  return tokens
}

function fontAttrs(fontSize) {
  return `font-family="Arial, Helvetica, DejaVu Sans, sans-serif" font-size="${fontSize}" font-weight="700" fill="${FG}"`
}


async function measureTextWidth(text, fontSize) {
  const key = `${fontSize}::${text}`
  if (textWidthCache.has(key)) return textWidthCache.get(key)

  const padX = 8
  const height = Math.ceil(fontSize * 2.2)
  const guess = Math.ceil(fontSize * Math.max(1, text.length) * 1.1 + padX * 2)
  const width = Math.min(1200, Math.max(64, guess))

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <text x="${padX}" y="${Math.round(fontSize * 1.35)}" ${fontAttrs(fontSize)}>${escapeXml(text)}</text>
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

    
    const measured = maxX >= minX ? maxX - minX + 1 + 4 : Math.ceil(fontSize * text.length * 0.55)
    textWidthCache.set(key, measured)
    return measured
  } catch {
    const fallback = Math.ceil(fontSize * text.length * 0.62)
    textWidthCache.set(key, fallback)
    return fallback
  }
}

function emojiWidth(fontSize) {
  return Math.round(fontSize * 1.05)
}

async function tokenWidth(token, fontSize) {
  if (token.type === 'emoji') return emojiWidth(fontSize)
  return measureTextWidth(token.text, fontSize)
}

async function lineWidth(tokens, fontSize, gap) {
  if (!tokens.length) return 0
  let w = 0
  for (let i = 0; i < tokens.length; i++) {
    w += await tokenWidth(tokens[i], fontSize)
    if (i < tokens.length - 1) w += gap
  }
  return w
}

async function wrapTokens(tokens, fontSize) {
  const baseGap = Math.max(8, fontSize * 0.22)
  const lines = []
  let current = []

  for (const token of tokens) {
    const test = [...current, token]
    const w = await lineWidth(test, fontSize, baseGap)
    if (w <= CONTENT_WIDTH || current.length === 0) {
      current.push(token)
      continue
    }
    lines.push(current)
    current = [token]
  }
  if (current.length) lines.push(current)
  return lines
}

async function wrapText(text, fontSize) {
  const lines = []
  for (const para of text.split('\n')) {
    const trimmed = para.trim()
    if (!trimmed) {
      if (lines.length) lines.push([])
      continue
    }
    lines.push(...(await wrapTokens(tokenize(trimmed), fontSize)))
  }
  return lines.length ? lines : [tokenize(text)]
}

async function fitLayout(text) {

  let fontSize = 108
  let lines = []

  while (fontSize >= 14) {
    lines = await wrapText(text, fontSize)
    const blockHeight = Math.max(1, lines.length) * fontSize * LINE_RATIO
    const baseGap = Math.max(8, fontSize * 0.22)
    let widthOk = true
    for (const line of lines) {
      if ((await lineWidth(line, fontSize, baseGap)) > CONTENT_WIDTH) {
        widthOk = false
        break
      }
    }
    if (blockHeight <= MAX_HEIGHT && widthOk) break
    fontSize -= 2
  }

  if (fontSize < 14) {
    fontSize = 14
    lines = await wrapText(text, fontSize)
  }

  return { lines, fontSize, lineHeight: fontSize * LINE_RATIO }
}

async function lineToSvg(tokens, fontSize, y) {
  if (!tokens.length) return ''

  const emojiSize = emojiWidth(fontSize)
  const emojiY = y - fontSize * 0.88
  const widths = []
  for (const token of tokens) widths.push(await tokenWidth(token, fontSize))

  const natural = widths.reduce((a, b) => a + b, 0)
  const gapsCount = Math.max(0, tokens.length - 1)
  const minGap = Math.max(8, fontSize * 0.22)
  
  const maxGap = fontSize * 0.55

  let gap = minGap
  if (gapsCount > 0) {
    const ideal = (CONTENT_WIDTH - natural) / gapsCount
    gap = Math.min(maxGap, Math.max(minGap, ideal))
  }

 
  let total = natural + gap * gapsCount
  if (total > CONTENT_WIDTH && gapsCount > 0) {
    gap = Math.max(4, (CONTENT_WIDTH - natural) / gapsCount)
    total = natural + gap * gapsCount
  }

  let x = PADDING
  const parts = []

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    const tw = widths[i]
    const isLast = i === tokens.length - 1

   
    if (isLast) {
      const maxStart = PADDING + CONTENT_WIDTH - tw
      if (x > maxStart) x = Math.max(PADDING, maxStart)
    }

    if (token.type === 'emoji') {
      const png = await getEmojiPng(token.text)
      if (png) {
        const b64 = png.toString('base64')
        parts.push(
          `<image x="${x.toFixed(2)}" y="${emojiY.toFixed(2)}" ` +
            `width="${emojiSize}" height="${emojiSize}" ` +
            `href="data:image/png;base64,${b64}" ` +
            `xlink:href="data:image/png;base64,${b64}" />`
        )
      }
    } else {
      parts.push(
        `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" ${fontAttrs(fontSize)}>` +
          `${escapeXml(token.text)}</text>`
      )
    }

    x += tw
    if (i < tokens.length - 1) x += gap
  }

  return parts.join('')
}

async function buildSvg(lines, fontSize, lineHeight) {
  const blockHeight = lines.length * lineHeight
  let y = PADDING + Math.max(0, (MAX_HEIGHT - blockHeight) / 2) + fontSize * 0.8

  const parts = []
  for (const tokens of lines) {
    if (!tokens.length) {
      y += lineHeight
      continue
    }
    parts.push(await lineToSvg(tokens, fontSize, y))
    y += lineHeight
  }

  return `<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <rect width="100%" height="100%" fill="${BG}"/>
  ${parts.join('\n  ')}
</svg>`
}

function resolveText(m, args) {
  const fromArgs = normalizeInput(args.join(' ') || '')
  const fromQuote = normalizeInput(m.quoted?.text || '')
  return fromArgs || fromQuote
}

async function textToLyricSticker(rawText) {
  const text = splitGraphemes(normalizeInput(rawText))
    .map(g => (isEmojiGrapheme(g) ? g : g.toLowerCase()))
    .join('')

  await prefetchEmojis(text)
  const { lines, fontSize, lineHeight } = await fitLayout(text)
  const svg = await buildSvg(lines, fontSize, lineHeight)

  return sharp(Buffer.from(svg))
    .resize(SIZE, SIZE)
    .webp({ quality: 95 })
    .toBuffer()
}

let handler = async (m, { conn, args, usedPrefix, command }) => {
  try {
    const text = resolveText(m, args)

    if (!text) {
      return conn.reply(
        m.chat,
        `*[❗] Escribe el texto del sticker.*\n\n` +
          `Ejemplos:\n` +
          `> ${usedPrefix + command} hola es una chica\n` +
          `> ${usedPrefix + command} te quiero ❤️\n` +
          `> (responde un mensaje con ${usedPrefix + command})`,
        m,
        global.rcanal
      )
    }

    if (text.length > MAX_TEXT) {
      return conn.reply(
        m.chat,
        `*[❗] Texto muy largo.* Máximo ${MAX_TEXT} caracteres (tienes ${text.length}).`,
        m,
        global.rcanal
      )
    }

    const { packname, author } = resolveStickerMeta(m, conn)
    const webp = await textToLyricSticker(text)
    const finalSticker = await addExif(webp, packname, author)

    await conn.sendFile(m.chat, finalSticker, 'sticker.webp', '', m, null, global.rcanal)
  } catch (e) {
    console.error('[sp]', e)
    return conn.reply(
      m.chat,
      `*[❌] Error al crear el sticker.*\n> ${e?.message || e}`,
      m,
      global.rcanal
    )
  }
}

handler.help = ['#sp + {texto} → sticker lyrics con emojis estilo WhatsApp']
handler.tags = ['stickers']
handler.command = ['sp', 'stickerplain', 'memetext']

export default handler
