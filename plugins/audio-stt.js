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

const ejecutarPromesa = promisify(exec)

const IDIOMAS = new Set(['es', 'en', 'pt', 'fr', 'de', 'it'])

function esMedioAudio(mime = '', mtype = '') {
  return /audio|ogg|opus|mpeg|mp4|m4a|wav|webm/i.test(mime) ||
    /audioMessage|ptt|voice/i.test(mtype)
}

async function descargarAudioCitado(m, conn) {
  if (!m.quoted) return null

  const q = m.getQuotedObj?.() || m.quoted
  const metaAudio = q.msg?.audioMessage || q.msg?.voiceMessage || {}
  const mime = q.msg?.mimetype || q.mimetype || metaAudio.mimetype || ''
  const mtype = q.mtype || ''

  if (!esMedioAudio(mime, mtype)) return null

  let medio = null
  try { medio = await q.download?.() } catch {}

  if ((!medio || !medio.length) && conn.downloadM && q.msg) {
    try {
      medio = await conn.downloadM(
        q.msg.audioMessage || q.msg.voiceMessage || q.msg,
        'audioMessage'
      )
    } catch {}
  }

  if ((!medio || !medio.length) && conn.getFile && q.msg) {
    try {
      const archivo = await conn.getFile(q.msg.audioMessage || q.msg.voiceMessage || q.msg)
      medio = archivo?.data || null
    } catch {}
  }

  if (!medio?.length) return null

  let ext = 'ogg'
  try { ext = (mime.split('/')[1] || '').split(';')[0] || ext } catch {}
  if (!/^[a-z0-9]+$/i.test(ext)) ext = 'ogg'

  return { medio, ext, mime }
}

function resolverIdioma(args) {
  const crudo = (args[0] || '').toLowerCase().trim()
  if (crudo && IDIOMAS.has(crudo)) return crudo
  return null
}

function etiquetaIdioma(idioma) {
  if (!idioma) return 'Auto'
  const etiquetas = { es: 'Español', en: 'English', pt: 'Português', fr: 'Français', de: 'Deutsch', it: 'Italiano' }
  return etiquetas[idioma] || idioma.toUpperCase()
}

let handler = async (m, { conn, args, usedPrefix, command }) => {
  let rutaEntrada = ''
  let rutaWav = ''

  try {
    const fuente = await descargarAudioCitado(m, conn)
    if (!fuente) {
      return conn.sendMessage(m.chat, {
        text: `*[❗] Respondé a una nota de voz o audio (máx. ${getMaxAudioDuration()} seg).*\n\nEjemplo:\n> (respondés audio)\n> ${usedPrefix + command}`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    const idioma = resolverIdioma(args)
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    rutaEntrada = join(tmpdir(), `stt_in_${id}.${fuente.ext}`)
    rutaWav = join(tmpdir(), `stt_${id}.wav`)

    writeFileSync(rutaEntrada, Buffer.from(fuente.media))

    const duracion = await getAudioDurationSeconds(rutaEntrada)
    if (duracion > getMaxAudioDuration()) {
      return conn.sendMessage(m.chat, {
        text: `*[❗] Audio muy largo.* Máximo ${getMaxAudioDuration()} segundos (tiene ~${Math.ceil(duracion)}s).`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    if (duracion < 0.4) {
      return conn.sendMessage(m.chat, {
        text: '*[❗] El audio es demasiado corto para transcribir.*',
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    await conn.sendPresenceUpdate('composing', m.chat)

    await convertAudioToWav(rutaEntrada, rutaWav)

    if (!existsSync(rutaWav)) {
      throw new Error('No se pudo convertir el audio (FFmpeg)')
    }

    const text = await transcribeWavFile(rutaWav, idioma, duracion)

    if (!text) {
      return conn.sendMessage(m.chat, {
        text: '*[❗] No se detectó texto claro en el audio.*\n\nPrueba con una nota de voz más nítida, sin ruido de fondo.',
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    const etiquetaIdiomaRes = etiquetaIdioma(idioma)
    await conn.sendMessage(m.chat, {
      text: `🎙️ *Transcripción* (~${Math.ceil(duracion)}s | ${etiquetaIdiomaRes})\n\n${text}`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  } catch (e) {
    console.error('[stt] Error:', e)
    const pista = /ffmpeg|ffprobe/i.test(String(e.message || e))
      ? '\n\nVerificá que FFmpeg esté instalado en el PATH.'
      : /whisper|model|onnx/i.test(String(e.message || e))
        ? '\n\nLa primera vez descarga el modelo local (~40-150 MB, sin API).'
        : ''

    conn.sendMessage(m.chat, {
      text: `*[❌] Error al transcribir:* ${e.message || 'desconocido'}${pista}`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  } finally {
    for (const archivo of [rutaEntrada, rutaWav]) {
      try { if (archivo && existsSync(archivo)) unlinkSync(archivo) } catch {}
    }
  }
}

handler.help = ['#stt + {responder nota de voz/audio ≤1min} → texto local sin API (idioma auto, opcional: es/en/pt)']
handler.tags = ['audio', 'tools']
handler.command = ['stt', 'att', 'transcribir', 'escuchar', 'voz2text']

export default handler
