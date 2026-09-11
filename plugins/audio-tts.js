import { createRequire } from 'module'
import { exec } from 'child_process'
import { promisify } from 'util'
import { mkdir, readFile, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const require = createRequire(import.meta.url)
const gTTS = require('node-gtts')
const ejecutarPromesa = promisify(exec)

const MAX_CARACTERES = 800

const IDIOMAS = new Set([
  'es', 'es-es', 'es-us', 'en', 'en-us', 'en-uk', 'en-au',
  'pt', 'pt-br', 'fr', 'de', 'it', 'ja', 'ko', 'ru', 'hi', 'id', 'ar', 'zh', 'zh-cn'
])

function sintetizar(rutaArchivo, text, idioma) {
  return new Promise((resolve, reject) => {
    const tts = gTTS(idioma)
    tts.save(rutaArchivo, text, (err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

function resolverEntradaTts(m, args) {
  const unido = (args.join(' ') || '').trim()
  const quoted = (m.quoted?.text || '').trim()

  let idioma = 'es'
  let text = ''

  if (unido) {
    const partes = unido.split(/\s+/)
    if (partes.length > 1 && IDIOMAS.has(partes[0].toLowerCase())) {
      idioma = partes[0].toLowerCase()
      text = partes.slice(1).join(' ')
    } else {
      text = unido
    }
  } else if (quoted) {
    text = quoted
  }

  return { idioma, text: text.trim() }
}

async function convertirAOgg(rutaEntrada, rutaSalida) {
  const cmd = `ffmpeg -y -i "${rutaEntrada}" -c:a libopus -b:a 128k -ac 1 "${rutaSalida}"`
  await ejecutarPromesa(cmd)
  if (!existsSync(rutaSalida)) throw new Error('No se pudo convertir el audio')
}

let handler = async (m, { conn, args, usedPrefix, command }) => {
  let rutaMp3 = ''
  let rutaOgg = ''

  try {
    const { idioma, text } = resolverEntradaTts(m, args)

    if (!text) {
      return conn.sendMessage(m.chat, {
        text: `*[❗] Escribe el texto o respondé a un mensaje con ${usedPrefix + command}*\n\nEjemplos:\n> ${usedPrefix + command} Hola, soy el bot\n> ${usedPrefix + command} en Hello world\n> ${usedPrefix + command} pt Olá pessoal\n> (respondé un mensaje con ${usedPrefix + command})`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    if (text.length > MAX_CARACTERES) {
      return conn.sendMessage(m.chat, {
        text: `*[❗] Texto muy largo.* Máximo ${MAX_CARACTERES} caracteres (tienes ${text.length}).`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const dirTmp = join(tmpdir(), 'pain-tts')
    if (!existsSync(dirTmp)) await mkdir(dirTmp, { recursive: true })

    rutaMp3 = join(dirTmp, `tts_${id}.mp3`)
    rutaOgg = join(dirTmp, `tts_${id}.ogg`)

    await sintetizar(rutaMp3, text, idioma)
    await convertirAOgg(rutaMp3, rutaOgg)

    const audio = await readFile(rutaOgg)
    if (!audio.length) throw new Error('El audio generado está vacío')

    const vistaPrevia = text.length > 80 ? `${text.slice(0, 80)}...` : text

    await conn.sendMessage(m.chat, {
      audio,
      mimetype: 'audio/ogg; codecs=opus',
      ptt: true,
      caption: `*[✓] Texto a voz*\n> Idioma: ${idioma}\n> ${vistaPrevia}`
    }, { quoted: m })
  } catch (e) {
    console.error('[tts] Error:', e)
    conn.sendMessage(m.chat, {
      text: `*[❌] Error al generar voz: ${e.message || 'desconocido'}*\n\nVerificá que FFmpeg esté instalado.`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  } finally {
    for (const archivo of [rutaMp3, rutaOgg]) {
      if (archivo) {
        try { await unlink(archivo) } catch {}
      }
    }
  }
}

handler.help = ['#tts + {texto o responder mensaje} → convierte texto a voz']
handler.tags = ['herramientas', 'audio']
handler.command = ['tts', 'voz', 'say', 'hablar', 'textovoz', 'speak']

export default handler
