import { exec } from 'child_process'
import { promisify } from 'util'
import { tmpdir } from 'os'
import { join } from 'path'
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs'
import {
  convertAudioToWav,
  getAudioDurationSeconds,
  getMaxAudioDuration,
  transcribeWavFile
} from '../lib/localStt.js'

const execPromise = promisify(exec)

const LANGS = new Set(['es', 'en', 'pt', 'fr', 'de', 'it'])

function isAudioMedia(mime = '', mtype = '') {
  return /audio|ogg|opus|mpeg|mp4|m4a|wav|webm/i.test(mime) ||
    /audioMessage|ptt|voice/i.test(mtype)
}

async function downloadQuotedAudio(m, conn) {
  if (!m.quoted) return null

  const q = m.getQuotedObj?.() || m.quoted
  const audioMeta = q.msg?.audioMessage || q.msg?.voiceMessage || {}
  const mime = q.msg?.mimetype || q.mimetype || audioMeta.mimetype || ''
  const mtype = q.mtype || ''

  if (!isAudioMedia(mime, mtype)) return null

  let media = null
  try { media = await q.download?.() } catch {}

  if ((!media || !media.length) && conn.downloadM && q.msg) {
    try {
      media = await conn.downloadM(
        q.msg.audioMessage || q.msg.voiceMessage || q.msg,
        'audioMessage'
      )
    } catch {}
  }

  if ((!media || !media.length) && conn.getFile && q.msg) {
    try {
      const file = await conn.getFile(q.msg.audioMessage || q.msg.voiceMessage || q.msg)
      media = file?.data || null
    } catch {}
  }

  if (!media?.length) return null

  let ext = 'ogg'
  try { ext = (mime.split('/')[1] || '').split(';')[0] || ext } catch {}
  if (!/^[a-z0-9]+$/i.test(ext)) ext = 'ogg'

  return { media, ext, mime }
}

function resolveLanguage(args) {
  const raw = (args[0] || '').toLowerCase().trim()
  if (raw && LANGS.has(raw)) return raw
  return null
}

function languageLabel(lang) {
  if (!lang) return 'Auto'
  const labels = { es: 'Español', en: 'English', pt: 'Português', fr: 'Français', de: 'Deutsch', it: 'Italiano' }
  return labels[lang] || lang.toUpperCase()
}

let handler = async (m, { conn, args, usedPrefix, command }) => {
  let inputPath = ''
  let wavPath = ''

  try {
    const source = await downloadQuotedAudio(m, conn)
    if (!source) {
      return conn.sendMessage(m.chat, {
        text: `*[❗] Respondé a una nota de voz o audio (máx. ${getMaxAudioDuration()} seg).*\n\nEjemplo:\n> (respondés audio)\n> ${usedPrefix + command}`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    const lang = resolveLanguage(args)
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    inputPath = join(tmpdir(), `stt_in_${id}.${source.ext}`)
    wavPath = join(tmpdir(), `stt_${id}.wav`)

    writeFileSync(inputPath, Buffer.from(source.media))

    const duration = await getAudioDurationSeconds(inputPath)
    if (duration > getMaxAudioDuration()) {
      return conn.sendMessage(m.chat, {
        text: `*[❗] Audio muy largo.* Máximo ${getMaxAudioDuration()} segundos (tiene ~${Math.ceil(duration)}s).`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    if (duration < 0.4) {
      return conn.sendMessage(m.chat, {
        text: '*[❗] El audio es demasiado corto para transcribir.*',
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    await conn.sendPresenceUpdate('composing', m.chat)

    await convertAudioToWav(inputPath, wavPath)

    if (!existsSync(wavPath)) {
      throw new Error('No se pudo convertir el audio (FFmpeg)')
    }

    const text = await transcribeWavFile(wavPath, lang, duration)

    if (!text) {
      return conn.sendMessage(m.chat, {
        text: '*[❗] No se detectó texto claro en el audio.*\n\nPrueba con una nota de voz más nítida, sin ruido de fondo.',
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    const langLabel = languageLabel(lang)
    await conn.sendMessage(m.chat, {
      text: `🎙️ *Transcripción* (~${Math.ceil(duration)}s | ${langLabel})\n\n${text}`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  } catch (e) {
    console.error('[stt] Error:', e)
    const hint = /ffmpeg|ffprobe/i.test(String(e.message || e))
      ? '\n\nVerificá que FFmpeg esté instalado en el PATH.'
      : /whisper|model|onnx/i.test(String(e.message || e))
        ? '\n\nLa primera vez descarga el modelo local (~40-150 MB, sin API).'
        : ''

    conn.sendMessage(m.chat, {
      text: `*[❌] Error al transcribir:* ${e.message || 'desconocido'}${hint}`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  } finally {
    for (const file of [inputPath, wavPath]) {
      try { if (file && existsSync(file)) unlinkSync(file) } catch {}
    }
  }
}

handler.help = ['#stt + {responder nota de voz/audio ≤1min} → texto local sin API (idioma auto, opcional: es/en/pt)']
handler.tags = ['audio', 'tools']
handler.command = ['stt', 'att', 'transcribir', 'escuchar', 'voz2text']

export default handler
