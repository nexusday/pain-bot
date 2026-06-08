import { createRequire } from 'module'
import { exec } from 'child_process'
import { promisify } from 'util'
import { mkdir, readFile, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const require = createRequire(import.meta.url)
const gTTS = require('node-gtts')
const execPromise = promisify(exec)

const MAX_CHARS = 800

const LANGS = new Set([
  'es', 'es-es', 'es-us', 'en', 'en-us', 'en-uk', 'en-au',
  'pt', 'pt-br', 'fr', 'de', 'it', 'ja', 'ko', 'ru', 'hi', 'id', 'ar', 'zh', 'zh-cn'
])

function synthesize(filepath, text, lang) {
  return new Promise((resolve, reject) => {
    const tts = gTTS(lang)
    tts.save(filepath, text, (err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

function resolveTtsInput(m, args) {
  const joined = (args.join(' ') || '').trim()
  const quoted = (m.quoted?.text || '').trim()

  let lang = 'es'
  let text = ''

  if (joined) {
    const parts = joined.split(/\s+/)
    if (parts.length > 1 && LANGS.has(parts[0].toLowerCase())) {
      lang = parts[0].toLowerCase()
      text = parts.slice(1).join(' ')
    } else {
      text = joined
    }
  } else if (quoted) {
    text = quoted
  }

  return { lang, text: text.trim() }
}

async function convertToOgg(inputPath, outputPath) {
  const cmd = `ffmpeg -y -i "${inputPath}" -c:a libopus -b:a 128k -ac 1 "${outputPath}"`
  await execPromise(cmd)
  if (!existsSync(outputPath)) throw new Error('No se pudo convertir el audio')
}

let handler = async (m, { conn, args, usedPrefix, command }) => {
  let mp3Path = ''
  let oggPath = ''

  try {
    const { lang, text } = resolveTtsInput(m, args)

    if (!text) {
      return conn.sendMessage(m.chat, {
        text: `*[❗] Escribe el texto o respondé a un mensaje con ${usedPrefix + command}*\n\nEjemplos:\n> ${usedPrefix + command} Hola, soy el bot\n> ${usedPrefix + command} en Hello world\n> ${usedPrefix + command} pt Olá pessoal\n> (respondé un mensaje con ${usedPrefix + command})`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    if (text.length > MAX_CHARS) {
      return conn.sendMessage(m.chat, {
        text: `*[❗] Texto muy largo.* Máximo ${MAX_CHARS} caracteres (tienes ${text.length}).`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const tmpDir = join(tmpdir(), 'pain-tts')
    if (!existsSync(tmpDir)) await mkdir(tmpDir, { recursive: true })

    mp3Path = join(tmpDir, `tts_${id}.mp3`)
    oggPath = join(tmpDir, `tts_${id}.ogg`)

    await synthesize(mp3Path, text, lang)
    await convertToOgg(mp3Path, oggPath)

    const audio = await readFile(oggPath)
    if (!audio.length) throw new Error('El audio generado está vacío')

    const preview = text.length > 80 ? `${text.slice(0, 80)}...` : text

    await conn.sendMessage(m.chat, {
      audio,
      mimetype: 'audio/ogg; codecs=opus',
      ptt: true,
      caption: `*[✓] Texto a voz*\n> Idioma: ${lang}\n> ${preview}`
    }, { quoted: m })
  } catch (e) {
    console.error('[tts] Error:', e)
    conn.sendMessage(m.chat, {
      text: `*[❌] Error al generar voz: ${e.message || 'desconocido'}*\n\nVerificá que FFmpeg esté instalado.`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  } finally {
    for (const file of [mp3Path, oggPath]) {
      if (file) {
        try { await unlink(file) } catch {}
      }
    }
  }
}

handler.help = ['#tts + {texto o responder mensaje} → convierte texto a voz']
handler.tags = ['herramientas', 'audio']
handler.command = ['tts', 'voz', 'say', 'hablar', 'textovoz', 'speak']

export default handler
