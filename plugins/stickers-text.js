import fs from 'fs'
import path from 'path'
import fluent from 'fluent-ffmpeg'
import sharp from 'sharp'
import { addExif } from '../lib/sticker.js'

const SIZE = 512
const FRAME_COUNT = 12
const FRAME_DELAY_MS = 100
const MAX_TEXT = 80
const MAX_LINES = 5
const PADDING_X = 48
const FONT_SCALE = 1.15

function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function hslToHex(h, s, l) {
  const sat = s / 100
  const lig = l / 100
  const k = n => (n + h / 30) % 12
  const a = sat * Math.min(lig, 1 - lig)
  const f = n => lig - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  const toHex = x => Math.round(255 * x).toString(16).padStart(2, '0')
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`
}

function estimateMaxChars(fontSize) {
  const avgCharWidth = fontSize * 0.58
  const maxWidth = SIZE - PADDING_X * 2
  return Math.max(4, Math.floor(maxWidth / avgCharWidth))
}

function wrapParagraph(paragraph, maxChars) {
  const words = paragraph.split(/\s+/).filter(Boolean)
  if (!words.length) return []

  const lines = []
  let current = ''

  for (const word of words) {
    const test = current ? `${current} ${word}` : word

    if (test.length <= maxChars) {
      current = test
      continue
    }

    if (current) lines.push(current)

    if (word.length > maxChars) {
      for (let i = 0; i < word.length; i += maxChars) {
        lines.push(word.slice(i, i + maxChars))
      }
      current = ''
    } else {
      current = word
    }
  }

  if (current) lines.push(current)
  return lines
}

function wrapText(text, maxChars) {
  const parts = text.split('\n').map(part => part.trim())
  const lines = []

  for (const part of parts) {
    if (!part) {
      if (lines.length && lines[lines.length - 1] !== '') lines.push('')
      continue
    }
    lines.push(...wrapParagraph(part, maxChars))
  }

  return lines.length ? lines : [text]
}

function calcLayout(text) {
  const raw = text.trim()
  const len = raw.replace(/\n/g, ' ').length

  let fontSize = 72
  if (len <= 6) fontSize = 88
  else if (len <= 12) fontSize = 72
  else if (len <= 24) fontSize = 58
  else if (len <= 40) fontSize = 48
  else fontSize = 40

  let maxChars = estimateMaxChars(fontSize)
  let lines = wrapText(raw, maxChars)

  while (lines.length > MAX_LINES && fontSize > 28) {
    fontSize -= 6
    maxChars = estimateMaxChars(fontSize)
    lines = wrapText(raw, maxChars)
  }

  if (lines.length > MAX_LINES) {
    lines = lines.slice(0, MAX_LINES)
    const last = lines[MAX_LINES - 1]
    lines[MAX_LINES - 1] = last.length > 3 ? `${last.slice(0, -1)}…` : `${last}…`
  }

  fontSize = Math.round(fontSize * FONT_SCALE)

  return { lines, fontSize }
}

function buildTextSvg(lines, color, fontSize) {
  const lineHeight = fontSize * 1.18
  const blockHeight = lines.length * lineHeight
  const startY = (SIZE - blockHeight) / 2 + fontSize * 0.82

  const tspans = lines.map((line, index) => {
    const y = startY + index * lineHeight
    const content = line === '' ? ' ' : escapeXml(line)
    return `<tspan x="256" y="${y}">${content}</tspan>`
  }).join('')

  return `<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="transparent"/>
  <text font-family="Arial Black, Impact, Arial, sans-serif"
    font-size="${fontSize}" font-weight="900" fill="${color}"
    text-anchor="middle">${tspans}</text>
</svg>`
}

function resolveText(m, args) {
  const fromArgs = (args.join(' ') || '').trim()
  const fromQuote = (m.quoted?.text || '').trim()
  return fromArgs || fromQuote
}

async function renderFrames(text) {
  const layout = calcLayout(text)
  const tmpDir = path.join(process.cwd(), 'tmp', `st_${Date.now()}`)
  fs.mkdirSync(tmpDir, { recursive: true })

  const framePaths = []

  for (let i = 0; i < FRAME_COUNT; i++) {
    const hue = (i / FRAME_COUNT) * 360
    const color = hslToHex(hue, 100, 58)
    const svg = buildTextSvg(layout.lines, color, layout.fontSize)
    const framePath = path.join(tmpDir, `frame_${String(i).padStart(3, '0')}.png`)

    await sharp(Buffer.from(svg))
      .resize(SIZE, SIZE)
      .png()
      .toFile(framePath)

    framePaths.push(framePath)
  }

  return { tmpDir, framePaths }
}

async function framesToAnimatedWebp(tmpDir) {
  const output = path.join(tmpDir, 'anim.webp')
  const input = path.join(tmpDir, 'frame_%03d.png')

  return new Promise((resolve, reject) => {
    fluent()
      .input(input)
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
      .save(output)
      .on('end', () => {
        try {
          resolve(fs.readFileSync(output))
        } catch (e) {
          reject(e)
        }
      })
      .on('error', reject)
  })
}

function cleanupDir(dir) {
  if (!dir || !fs.existsSync(dir)) return
  try {
    for (const file of fs.readdirSync(dir)) {
      fs.unlinkSync(path.join(dir, file))
    }
    fs.rmdirSync(dir)
  } catch {}
}

let handler = async (m, { conn, args, usedPrefix, command }) => {
  let tmpDir = ''

  try {
    const text = resolveText(m, args)

    if (!text) {
      return conn.sendMessage(m.chat, {
        text: `*[❗] Escribe el texto del sticker animado o respondé a un mensaje.*\n\nEjemplos:\n> ${usedPrefix + command} Hola\n> ${usedPrefix + command} Pain Bot oficial\n> ${usedPrefix + command} línea uno\\nlínea dos\n> (respondé un mensaje con ${usedPrefix + command})`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    if (text.length > MAX_TEXT) {
      return conn.sendMessage(m.chat, {
        text: `*[❗] Texto muy largo.* Máximo ${MAX_TEXT} caracteres (tienes ${text.length}).`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    const username = '@' + (conn.getName(m.sender) || 'Usuario')
    const nombreBot = global.namebot || 'PAIN BOT'
    const packname = `👑 𝗢𝘄𝗻𝗲𝗿𝘀: \n✰ Sunkovv`
    const author = `\n\n🪐 𝗕𝗼𝘁:\n↳${nombreBot}\n\n🍁 𝑼𝒔𝒖𝒂𝒓𝒊𝒐:\n↳${username}`

    const rendered = await renderFrames(text)
    tmpDir = rendered.tmpDir

    const webpAnim = await framesToAnimatedWebp(tmpDir)
    const finalSticker = await addExif(webpAnim, packname, author)

    await conn.sendFile(m.chat, finalSticker, 'sticker.webp', '', m, null, {
      contextInfo: { ...rcanal.contextInfo }
    })
  } catch (e) {
    console.error('[st] Error:', e)
    conn.sendMessage(m.chat, {
      text: `*[❌] Error al crear sticker animado: ${e.message || 'desconocido'}*\n\nVerificá que FFmpeg esté instalado.`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  } finally {
    cleanupDir(tmpDir)
  }
}

handler.help = ['#st + {texto o responder mensaje} → sticker animado con texto de colores']
handler.tags = ['stickers']
handler.command = ['st', 'stext', 'stickertext', 'textsticker', 'stickeranim']

export default handler
