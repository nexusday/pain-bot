import sharp from '../lib/sharp.js'
import fetch from 'node-fetch'
import { addExif } from '../lib/sticker.js'
import { resolveStickerMeta } from './stickers-sticker.js'


const SIZE = 512
const PADDING = 40
const MAX_WIDTH = SIZE - PADDING * 2
const MAX_HEIGHT = SIZE - PADDING * 2
const MAX_TEXT = 320
const LINE_RATIO = 1.25
const BG = '#F0F0F0'
const FG = '#000000'

const WA_EMOJI_CDN = 'https://cdn.jsdelivr.net/gh/realityripple/emoji/whatsapp'
const WA_EMOJI_FALLBACK = 'https://emoji-cdn.mqrio.dev'


const emojiPngCache = new Map()
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

function measureTextWidth(text, fontSize) {
  let w = 0
  for (const ch of String(text)) {
    if (ch === ' ') w += fontSize * 0.32
    else if ('iljtfrI1'.includes(ch)) w += fontSize * 0.30
    else if ('mwMW'.includes(ch)) w += fontSize * 0.82
    else if (/[A-Z]/.test(ch)) w += fontSize * 0.64
    else w += fontSize * 0.55
  }
  return w
}

function tokenWidth(token, fontSize) {
  if (token.type === 'emoji') return fontSize * 1.05
  return measureTextWidth(token.text, fontSize)
}

function lineWidth(tokens, fontSize) {
  if (!tokens.length) return 0
  const gap = fontSize * 0.28
  let w = 0
  for (let i = 0; i < tokens.length; i++) {
    w += tokenWidth(tokens[i], fontSize)
    if (i < tokens.length - 1) w += gap
  }
  return w
}

function wrapTokens(tokens, fontSize) {
  const lines = []
  let current = []

  for (const token of tokens) {
    const test = [...current, token]
    if (lineWidth(test, fontSize) <= MAX_WIDTH || current.length === 0) {
      current.push(token)
      continue
    }
    lines.push(current)
    current = [token]
  }
  if (current.length) lines.push(current)
  return lines
}

function wrapText(text, fontSize) {
  const lines = []
  for (const para of text.split('\n')) {
    const trimmed = para.trim()
    if (!trimmed) {
      if (lines.length) lines.push([])
      continue
    }
    lines.push(...wrapTokens(tokenize(trimmed), fontSize))
  }
  return lines.length ? lines : [tokenize(text)]
}

function fitLayout(text) {
  let fontSize = 110
  let lines = []

  while (fontSize >= 14) {
    lines = wrapText(text, fontSize)
    const blockHeight = Math.max(1, lines.length) * fontSize * LINE_RATIO
    const widthOk = lines.every(line => lineWidth(line, fontSize) <= MAX_WIDTH * 1.03)
    if (blockHeight <= MAX_HEIGHT && widthOk) break
    fontSize -= 1
  }

  if (fontSize < 14) {
    fontSize = 14
    lines = wrapText(text, fontSize)
  }

  return { lines, fontSize, lineHeight: fontSize * LINE_RATIO }
}

function fontAttrs(fontSize) {
  return `font-family="Arial, Helvetica, DejaVu Sans, sans-serif" font-size="${fontSize}" font-weight="700" fill="${FG}"`
}

async function lineToSvg(tokens, fontSize, y) {
  if (!tokens.length) return ''

  const emojiSize = Math.round(fontSize * 1.05)
  const emojiY = y - fontSize * 0.88

  
  const natural = tokens.reduce((sum, t) => sum + tokenWidth(t, fontSize), 0)
  const gaps = Math.max(1, tokens.length - 1)
  const baseGap = fontSize * 0.28
  const extra =
    tokens.length > 1
      ? Math.max(0, (MAX_WIDTH - natural - baseGap * gaps) / gaps)
      : 0
  const gap = baseGap + extra

  let x = PADDING
  const parts = []

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
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
      x += emojiSize
    } else {
      parts.push(
        `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" ${fontAttrs(fontSize)}>` +
          `${escapeXml(token.text)}</text>`
      )
      x += measureTextWidth(token.text, fontSize)
    }
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
  const { lines, fontSize, lineHeight } = fitLayout(text)
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
          `> ${usedPrefix + command} t juro q soy buena onda 😭\n` +
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

handler.help = ['#sp + {texto} → sticker con emojis estilo WhatsApp']
handler.tags = ['stickers']
handler.command = ['sp', 'stickerplain', 'memetext']

export default handler
