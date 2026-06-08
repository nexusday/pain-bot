import { mkdir, writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import sharp from 'sharp'
import { createWorker } from 'tesseract.js'
import { webp2png } from '../lib/webp2mp4.js'

const LANG_MAP = {
  es: 'spa',
  spa: 'spa',
  en: 'eng',
  eng: 'eng',
  pt: 'por',
  por: 'por',
  fr: 'fra',
  fra: 'fra'
}

let workerInstance = null
let workerLang = ''

async function getWorker(lang = 'spa+eng') {
  if (workerInstance && workerLang === lang) return workerInstance

  if (workerInstance) {
    try { await workerInstance.terminate() } catch {}
    workerInstance = null
  }

  workerInstance = await createWorker(lang, 1, {
    logger: () => {}
  })
  await workerInstance.setParameters({
    tessedit_pageseg_mode: '3',
    preserve_interword_spaces: '1'
  })
  workerLang = lang
  return workerInstance
}

function cleanLine(line) {
  return line
    .replace(/\s+/g, ' ')
    .replace(/^[^a-zA-ZáéíóúñÁÉÍÓÚÑ0-9¿¡]{1,4}\s*/u, '')
    .replace(/([a-zA-ZáéíóúñÁÉÍÓÚÑ])\s*[=|/\\]{1,2}\s*/gu, '$1 ')
    .replace(/\s*[=|]{2,}\s*/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim()
}

function isReadableToken(token) {
  if (!token) return false
  const letters = (token.match(/[\p{L}\p{N}]/gu) || []).length
  if (letters === 0) return false
  if (token.length <= 2 && letters / token.length < 0.6) return false
  return letters / token.length >= 0.45
}

function rebuildByLines(words) {
  if (!words.length) return ''

  const sorted = [...words].sort((a, b) => {
    const dy = (a.bbox?.y0 || 0) - (b.bbox?.y0 || 0)
    if (Math.abs(dy) > 14) return dy
    return (a.bbox?.x0 || 0) - (b.bbox?.x0 || 0)
  })

  const lines = []
  let current = []
  let lastY = sorted[0].bbox?.y0 || 0

  for (const word of sorted) {
    const y = word.bbox?.y0 || 0
    if (Math.abs(y - lastY) > 16 && current.length) {
      lines.push(cleanLine(current.join(' ')))
      current = []
    }
    current.push(word.text.trim())
    lastY = y
  }

  if (current.length) lines.push(cleanLine(current.join(' ')))

  return lines.filter((line) => {
    if (!line) return false
    const letters = (line.match(/[\p{L}\p{N}]/gu) || []).length
    return letters >= 3 && letters / line.length >= 0.5
  }).join('\n')
}

function extractCleanText(data) {
  const minConf = 58
  const words = (data.words || []).filter((w) => {
    const conf = w.confidence ?? 0
    const token = (w.text || '').trim()
    return conf >= minConf && isReadableToken(token)
  })

  if (words.length >= 2) {
    const rebuilt = rebuildByLines(words)
    if (rebuilt.trim()) return rebuilt.trim()
  }

  return (data.text || '')
    .split('\n')
    .map(cleanLine)
    .filter((line) => {
      if (!line) return false
      const letters = (line.match(/[\p{L}\p{N}]/gu) || []).length
      return letters >= 3 && letters / line.length >= 0.45
    })
    .join('\n')
    .trim()
}

async function toImageBuffer(media, mime) {
  let buffer

  if (/webp/i.test(mime)) {
    try {
      buffer = await sharp(media).png().toBuffer()
    } catch {
      const url = await webp2png(media)
      if (!url) throw new Error('No se pudo convertir webp')
      const res = await fetch(url)
      buffer = Buffer.from(await res.arrayBuffer())
    }
  } else if (/image\//i.test(mime)) {
    buffer = await sharp(media).png().toBuffer()
  } else {
    throw new Error('Formato no compatible')
  }

  return preprocessForOcr(buffer)
}

async function preprocessForOcr(buffer) {
  const meta = await sharp(buffer).metadata()
  const minSide = Math.min(meta.width || 0, meta.height || 0)
  const scale = minSide > 0 && minSide < 1200 ? Math.min(4, 1200 / minSide) : 1

  let pipeline = sharp(buffer)
    .rotate()
    .resize({
      width: scale > 1 ? Math.round((meta.width || 1) * scale) : undefined,
      height: scale > 1 ? Math.round((meta.height || 1) * scale) : undefined,
      fit: 'inside',
      withoutEnlargement: false
    })
    .greyscale()
    .normalize()
    .median(3)
    .sharpen({ sigma: 1.2 })
    .png({ density: 300 })

  return pipeline.toBuffer()
}

function resolveLang(args) {
  const raw = (args[0] || '').toLowerCase().trim()
  if (!raw) return 'spa+eng'
  const code = LANG_MAP[raw] || raw
  return code.includes('+') ? code : `${code}+eng`
}

function isOcrMedia(mime = '', mtype = '') {
  return /image|webp|sticker/i.test(mime) || /imageMessage|stickerMessage/i.test(mtype)
}

function resolveMediaTarget(m) {
  if (m.quoted) {
    const mime = (m.quoted.msg || m.quoted).mimetype || m.quoted.mediaType || ''
    const mtype = m.quoted.mtype || ''
    if (isOcrMedia(mime, mtype) && m.quoted.download) return m.quoted
  }

  const mime = (m.msg || m).mimetype || m.mediaType || ''
  const mtype = m.mtype || ''
  if (isOcrMedia(mime, mtype) && m.download) return m

  return null
}

let handler = async (m, { conn, args, usedPrefix, command }) => {
  let tmpPath = ''

  try {
    const target = resolveMediaTarget(m)

    if (!target) {
      return conn.sendMessage(m.chat, {
        text: `*[❗] Enviá una *imagen* o *sticker* con el comando, o respondé a uno con ${usedPrefix + command}.*\n\nEjemplos:\n• Foto + comando: ${usedPrefix + command}\n• Responder imagen: ${usedPrefix + command}\n\nIdioma opcional: ${usedPrefix + command} es | en | pt`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    const mime = (target.msg || target).mimetype || target.mediaType || ''
    const media = await target.download()
    if (!media?.length) throw new Error('No se pudo descargar la imagen')

    const tmpDir = join(process.cwd(), 'tmp')
    if (!existsSync(tmpDir)) await mkdir(tmpDir, { recursive: true })

    const imageBuffer = await toImageBuffer(media, mime)
    tmpPath = join(tmpDir, `ocr_${Date.now()}.png`)
    await writeFile(tmpPath, imageBuffer)

    const lang = resolveLang(args)
    const worker = await getWorker(lang)
    const { data } = await worker.recognize(tmpPath)
    const text = extractCleanText(data)

    if (!text) {
      return conn.sendMessage(m.chat, {
        text: '*[❗] No se detectó texto en la imagen. Probá con una foto más nítida o con mejor contraste.*',
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    const maxLen = 45000
    const output = text.length > maxLen ? `${text.slice(0, maxLen)}\n\n_[Texto recortado]_` : text

    await conn.sendMessage(m.chat, {
      text: `Texto detectado:\n\n${output}`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  } catch (e) {
    console.error('[ocr] Error:', e)
    conn.sendMessage(m.chat, {
      text: `*[❌] Error al leer la imagen: ${e.message || 'desconocido'}*`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  } finally {
    if (tmpPath) {
      try { await unlink(tmpPath) } catch {}
    }
  }
}

handler.help = ['#text • #ocr + {imagen/sticker con caption o respondiendo} → extrae texto (OCR local)']
handler.tags = ['inteligencia', 'herramientas']
handler.command = ['text', 'ocr', 'leertexto', 'leerimg']

export default handler
