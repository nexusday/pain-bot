import { mkdir, writeFile, unlink } from 'fs/promises'
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import fetch from 'node-fetch'
import sharp from 'sharp'
import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, rgb } from 'pdf-lib'
import { webp2png } from '../lib/webp2mp4.js'

const FONTS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'fonts')

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN = 72
const FONT_SIZE = 12
const TITLE_SIZE = 16
const LINE_HEIGHT = FONT_SIZE * 1.45
const TITLE_GAP = 28
const IMAGE_FRAME_PAD = 14
const IMAGE_BLOCK_GAP = 26
const TEXT_SECTION_GAP = 22
const MAX_IMG_WIDTH_RATIO = 0.82
const MAX_IMG_HEIGHT = 340
const MAX_CHARS = 50000

const FONT_FILES = {
  regular: 'NotoSans-Regular.ttf',
  bold: 'NotoSans-Bold.ttf',
  math: 'NotoSansMath-Regular.ttf',
  symbols: 'NotoSansSymbols2-Regular.ttf'
}

const TWEMOJI_BASE = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72'

let fontBytesCache = null
const encodeCache = new WeakMap()
const emojiPngCache = new Map()
const graphemeSegmenter = typeof Intl !== 'undefined' && Intl.Segmenter
  ? new Intl.Segmenter('und', { granularity: 'grapheme' })
  : null

function loadFontBytes() {
  if (fontBytesCache) return fontBytesCache

  fontBytesCache = {}
  for (const [key, file] of Object.entries(FONT_FILES)) {
    const filePath = join(FONTS_DIR, file)
    if (existsSync(filePath)) {
      fontBytesCache[key] = readFileSync(filePath)
    }
  }

  if (!fontBytesCache.regular || !fontBytesCache.bold) {
    throw new Error('Fuentes base no encontradas en lib/fonts')
  }

  return fontBytesCache
}

async function embedUtf8Fonts(pdfDoc) {
  pdfDoc.registerFontkit(fontkit)
  const bytes = loadFontBytes()
  const fonts = {}

  for (const [key, data] of Object.entries(bytes)) {
    try {
      fonts[key] = await pdfDoc.embedFont(data, { subset: true })
    } catch (e) {
      console.warn(`[tepdf] Fuente ${key} omitida:`, e.message)
    }
  }

  return fonts
}

function emojiToTwemojiCode(emoji) {
  return [...emoji]
    .map(char => char.codePointAt(0).toString(16))
    .filter(code => code !== 'fe0f')
    .join('-')
}

async function getEmojiPng(emoji) {
  if (emojiPngCache.has(emoji)) return emojiPngCache.get(emoji)

  try {
    const code = emojiToTwemojiCode(emoji)
    const res = await fetch(`${TWEMOJI_BASE}/${code}.png`)
    if (!res.ok) {
      emojiPngCache.set(emoji, null)
      return null
    }
    const buffer = Buffer.from(await res.arrayBuffer())
    emojiPngCache.set(emoji, buffer)
    return buffer
  } catch {
    emojiPngCache.set(emoji, null)
    return null
  }
}

function splitGraphemes(text) {
  if (!text) return []
  if (graphemeSegmenter) {
    return [...graphemeSegmenter.segment(text)].map(s => s.segment)
  }
  return [...text]
}

function isEmojiCodePoint(cp) {
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

function isMathAlpha(cp) {
  return cp >= 0x1D400 && cp <= 0x1D7FF
}

function canEncode(font, text) {
  if (!font || !text) return false

  let cache = encodeCache.get(font)
  if (!cache) {
    cache = new Map()
    encodeCache.set(font, cache)
  }

  if (cache.has(text)) return cache.get(text)

  try {
    font.widthOfTextAtSize(text, 12)
    cache.set(text, true)
    return true
  } catch {
    cache.set(text, false)
    return false
  }
}

function pickFontForSegment(segment, fonts, preferBold = false) {
  const cp = segment.codePointAt(0)
  const candidates = []

  if (isMathAlpha(cp) && fonts.math) candidates.push(fonts.math)
  if (preferBold && fonts.bold) candidates.push(fonts.bold)
  if (fonts.regular) candidates.push(fonts.regular)
  if (fonts.symbols) candidates.push(fonts.symbols)
  if (!preferBold && fonts.bold) candidates.push(fonts.bold)
  if (fonts.math) candidates.push(fonts.math)

  const seen = new Set()
  for (const font of candidates) {
    if (!font || seen.has(font)) continue
    seen.add(font)
    if (canEncode(font, segment)) return font
  }

  return fonts.regular
}

async function buildRichRuns(text, fonts, preferBold = false) {
  const runs = []
  let current = null

  for (const segment of splitGraphemes(text)) {
    const cp = segment.codePointAt(0)

    if (isEmojiCodePoint(cp) && !isMathAlpha(cp)) {
      const png = await getEmojiPng(segment)
      if (png) {
        if (current) {
          runs.push(current)
          current = null
        }
        runs.push({ type: 'emoji', text: segment, png })
        continue
      }
    }

    const font = pickFontForSegment(segment, fonts, preferBold)
    if (current && current.type === 'text' && current.font === font) {
      current.text += segment
    } else {
      if (current) runs.push(current)
      current = { type: 'text', font, text: segment }
    }
  }

  if (current) runs.push(current)
  return runs
}

function mergeRichRuns(target, source) {
  for (const run of source) {
    const last = target[target.length - 1]
    if (run.type === 'text' && last?.type === 'text' && last.font === run.font) {
      last.text += run.text
    } else {
      target.push({ ...run })
    }
  }
  return target
}

function measureRichRunsWidth(runs, size) {
  return runs.reduce((total, run) => {
    if (run.type === 'emoji') return total + size * 1.12
    try {
      return total + run.font.widthOfTextAtSize(run.text, size)
    } catch {
      return total + run.text.length * size * 0.45
    }
  }, 0)
}

async function wrapParagraphRuns(paragraph, fonts, fontSize, maxWidth, preferBold = false) {
  if (!paragraph) return [[]]

  const tokens = paragraph.match(/\S+|\s+/g) || []
  if (!tokens.length) return [[]]

  const lines = []
  let currentRuns = []
  let currentWidth = 0

  for (const token of tokens) {
    const tokenRuns = await buildRichRuns(token, fonts, preferBold)
    const tokenWidth = measureRichRunsWidth(tokenRuns, fontSize)
    const isSpace = /^\s+$/.test(token)

    if (!isSpace && currentRuns.length && currentWidth + tokenWidth > maxWidth) {
      lines.push(currentRuns)
      currentRuns = [...tokenRuns]
      currentWidth = tokenWidth
      continue
    }

    if (isSpace && !currentRuns.length) continue

    mergeRichRuns(currentRuns, tokenRuns)
    currentWidth = measureRichRunsWidth(currentRuns, fontSize)
  }

  if (currentRuns.length) lines.push(currentRuns)
  return lines.length ? lines : [[]]
}

async function buildLineRuns(text, fonts, fontSize, maxWidth, preferBold = false) {
  if (!text.trim()) return []

  const paragraphs = text.split('\n')
  const lines = []

  for (const paragraph of paragraphs) {
    lines.push(...await wrapParagraphRuns(paragraph, fonts, fontSize, maxWidth, preferBold))
    lines.push([])
  }

  if (lines.length && lines.length === 1 && lines[0].length === 0) return []
  if (lines.length && !lines[lines.length - 1].length) lines.pop()
  return lines
}

async function embedRunImages(pdfDoc, runs) {
  for (const run of runs) {
    if (run.type === 'emoji' && run.png && !run.embedded) {
      run.embedded = await pdfDoc.embedPng(run.png)
    }
  }
}

function drawRichRuns(page, runs, x, y, size, color) {
  let cursor = x

  for (const run of runs) {
    if (run.type === 'emoji' && run.embedded) {
      const dim = size * 1.12
      page.drawImage(run.embedded, {
        x: cursor,
        y: y - dim * 0.2,
        width: dim,
        height: dim
      })
      cursor += dim
      continue
    }

    if (!run.text) continue

    try {
      page.drawText(run.text, {
        x: cursor,
        y,
        size,
        font: run.font,
        color
      })
      cursor += run.font.widthOfTextAtSize(run.text, size)
    } catch {
      for (const segment of splitGraphemes(run.text)) {
        const font = pickFontForSegment(segment, { regular: run.font }, false)
        try {
          page.drawText(segment, { x: cursor, y, size, font, color })
          cursor += font.widthOfTextAtSize(segment, size)
        } catch {}
      }
    }
  }
}

function sanitizePdfName(args) {
  const raw = (args.join(' ') || 'documento')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .trim()
    .slice(0, 80)

  const name = raw || 'documento'
  return name.toLowerCase().endsWith('.pdf') ? name : `${name}.pdf`
}

function toPdfSafeText(text) {
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .normalize('NFC')
}

function isImageMedia(mime = '', mtype = '') {
  return /image|webp|sticker/i.test(mime) || /imageMessage|stickerMessage/i.test(mtype)
}

function resolveQuotedContent(quoted) {
  if (!quoted) return null

  const mime = (quoted.msg || quoted).mimetype || quoted.mediaType || ''
  const mtype = quoted.mtype || ''
  const text = (quoted.text || '').trim()
  const hasImage = isImageMedia(mime, mtype) && quoted.download

  if (hasImage) {
    return { text, mime, hasImage: true }
  }

  if (text) {
    return { text, mime: '', hasImage: false }
  }

  return null
}

async function prepareImageBuffer(media, mime) {
  if (/webp/i.test(mime)) {
    try {
      return await sharp(media).rotate().jpeg({ quality: 90 }).toBuffer()
    } catch {
      const url = await webp2png(media)
      if (!url) throw new Error('No se pudo convertir la imagen')
      const res = await fetch(url)
      return Buffer.from(await res.arrayBuffer())
    }
  }

  if (/image\/jpe?g/i.test(mime)) {
    return sharp(media).rotate().jpeg({ quality: 90 }).toBuffer()
  }

  if (/image\//i.test(mime)) {
    return sharp(media).rotate().png().toBuffer()
  }

  throw new Error('Formato de imagen no compatible')
}

function ensureSpace(pageRef, yRef, neededHeight, pdfDoc) {
  if (yRef.value >= MARGIN + neededHeight) return pageRef.value

  pageRef.value = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  yRef.value = PAGE_HEIGHT - MARGIN
  return pageRef.value
}

function calcImageSize(srcW, srcH, maxWidth) {
  const maxW = maxWidth * MAX_IMG_WIDTH_RATIO
  const scale = Math.min(maxW / srcW, MAX_IMG_HEIGHT / srcH)
  return {
    width: srcW * scale,
    height: srcH * scale
  }
}

async function drawImageBlock(pageRef, yRef, pdfDoc, imageBuffer, mime, maxWidth, hasTextAfter = false) {
  const raster = await prepareImageBuffer(imageBuffer, mime)
  const meta = await sharp(raster).metadata()
  const srcW = meta.width || 1
  const srcH = meta.height || 1
  const { width: drawW, height: drawH } = calcImageSize(srcW, srcH, maxWidth)

  const frameW = drawW + IMAGE_FRAME_PAD * 2
  const frameH = drawH + IMAGE_FRAME_PAD * 2
  const blockHeight = frameH + IMAGE_BLOCK_GAP + (hasTextAfter ? TEXT_SECTION_GAP : 0)

  const page = ensureSpace(pageRef, yRef, blockHeight, pdfDoc)

  const imgX = MARGIN + (maxWidth - drawW) / 2
  const frameX = MARGIN + (maxWidth - frameW) / 2
  const frameBottom = yRef.value - frameH

  page.drawRectangle({
    x: frameX,
    y: frameBottom,
    width: frameW,
    height: frameH,
    color: rgb(0.975, 0.975, 0.975),
    borderColor: rgb(0.78, 0.78, 0.78),
    borderWidth: 0.8
  })

  const embedded = meta.format === 'jpeg'
    ? await pdfDoc.embedJpg(raster)
    : await pdfDoc.embedPng(raster)

  page.drawImage(embedded, {
    x: imgX,
    y: frameBottom + IMAGE_FRAME_PAD,
    width: drawW,
    height: drawH
  })

  yRef.value -= frameH + IMAGE_BLOCK_GAP

  if (hasTextAfter) {
    page.drawLine({
      start: { x: MARGIN, y: yRef.value + 10 },
      end: { x: PAGE_WIDTH - MARGIN, y: yRef.value + 10 },
      thickness: 0.4,
      color: rgb(0.85, 0.85, 0.85)
    })
    yRef.value -= TEXT_SECTION_GAP
  }
}

async function contentToPdf({ text, title, imageBuffer, imageMime }) {
  const pdfDoc = await PDFDocument.create()
  const fonts = await embedUtf8Fonts(pdfDoc)
  const maxWidth = PAGE_WIDTH - MARGIN * 2
  const bodyLines = await buildLineRuns(text, fonts, FONT_SIZE, maxWidth)

  const pageRef = { value: pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]) }
  const yRef = { value: PAGE_HEIGHT - MARGIN }

  const titleRuns = await buildRichRuns(toPdfSafeText(title.replace(/\.pdf$/i, '')), fonts, true)
  await embedRunImages(pdfDoc, titleRuns)
  drawRichRuns(pageRef.value, titleRuns, MARGIN, yRef.value, TITLE_SIZE, rgb(0.1, 0.1, 0.1))
  yRef.value -= TITLE_GAP

  pageRef.value.drawLine({
    start: { x: MARGIN, y: yRef.value + 8 },
    end: { x: PAGE_WIDTH - MARGIN, y: yRef.value + 8 },
    thickness: 0.5,
    color: rgb(0.75, 0.75, 0.75)
  })
  yRef.value -= 16

  if (imageBuffer?.length) {
    await drawImageBlock(pageRef, yRef, pdfDoc, imageBuffer, imageMime, maxWidth, bodyLines.length > 0)
  }

  for (const lineRuns of bodyLines) {
    pageRef.value = ensureSpace(pageRef, yRef, LINE_HEIGHT, pdfDoc)

    if (lineRuns.length) {
      await embedRunImages(pdfDoc, lineRuns)
      drawRichRuns(pageRef.value, lineRuns, MARGIN, yRef.value, FONT_SIZE, rgb(0.15, 0.15, 0.15))
    }

    yRef.value -= LINE_HEIGHT
  }

  const pageCount = pdfDoc.getPageCount()
  return { pdfBytes: Buffer.from(await pdfDoc.save()), pageCount }
}

let handler = async (m, { conn, args, usedPrefix, command }) => {
  let pdfPath = ''
  emojiPngCache.clear()

  try {
    const content = resolveQuotedContent(m.quoted)

    if (!content) {
      return conn.sendMessage(m.chat, {
        text: `*[❗] Respondé a un mensaje con *texto* o *imagen + texto* y usá ${usedPrefix + command} nombre*\n\nEjemplos:\n> ${usedPrefix + command} Apuntes\n> (foto con texto  ${usedPrefix + command} Informe)`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    if (!content.hasImage && !content.text) {
      throw new Error('El mensaje no contiene texto válido')
    }

    let imageBuffer = null
    if (content.hasImage) {
      imageBuffer = await m.quoted.download()
      if (!imageBuffer?.length) throw new Error('No se pudo descargar la imagen')
    }

    const rawText = content.text || ''
    const text = toPdfSafeText(rawText).slice(0, MAX_CHARS)

    if (!text.trim() && !imageBuffer) {
      throw new Error('El mensaje no tiene texto ni imagen usable')
    }

    const fileName = sanitizePdfName(args)
    const { pdfBytes, pageCount } = await contentToPdf({
      text,
      title: fileName,
      imageBuffer,
      imageMime: content.mime
    })

    const tmpDir = join(process.cwd(), 'tmp')
    if (!existsSync(tmpDir)) await mkdir(tmpDir, { recursive: true })

    pdfPath = join(tmpDir, `tepdf_${Date.now()}_${fileName}`)
    await writeFile(pdfPath, pdfBytes)

    const extras = []
    if (imageBuffer) extras.push('imagen')
    if (text.trim()) extras.push('texto')

    await conn.sendMessage(m.chat, {
      document: { url: pdfPath },
      fileName,
      mimetype: 'application/pdf',
      caption: `*[✓] PDF generado:* ${fileName}\n> Contenido: ${extras.join(' + ') || 'documento'}\n> Páginas: ${pageCount}`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  } catch (e) {
    console.error('[tepdf] Error:', e)
    conn.sendMessage(m.chat, {
      text: `*[❌] Error al crear el PDF: ${e.message || 'desconocido'}*`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  } finally {
    if (pdfPath) {
      try { await unlink(pdfPath) } catch {}
    }
  }
}

handler.help = ['#tepdf + {responder texto o imagen+caption} nombre → convierte a PDF']
handler.tags = ['herramientas']
handler.command = ['tepdf', 'textpdf', 'txtpdf', 'textopdf']

export default handler
