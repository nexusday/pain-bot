/**
 * Soporte para `/sa` (sticker con sonido).
 *
 * WhatsApp no permite audio dentro de un sticker WebP/WebM: lo que se ve como
 * "sticker con sonido" es un video corto enviado con `gifPlayback`, que se
 * reproduce en bucle y conserva la pista de audio. Este módulo guarda la
 * imagen mientras el usuario manda el audio y construye el MP4 con FFmpeg.
 *
 * Todo es bajo demanda: no hay intervalos ni trabajo en reposo.
 */
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { fileTypeFromBuffer } from 'file-type'

const TTL_MS = 2 * 60 * 1000
const MAX_SESIONES = 50
const MAX_BYTES = 6 * 1024 * 1024
const MAX_TOTAL_BYTES = 64 * 1024 * 1024
const LIMPIEZA_MS = 30_000
const MAX_DURACION_S = 10
const LADO_MAX = 512

const sesiones = new Map()
const chatsConSesion = new Set()
let bytesEnEspera = 0
let ultimaLimpieza = 0

// Una conversión FFmpeg a la vez por proceso. Evita que varios `/sa`
// simultáneos disparen el CPU de un servidor compartido.
const MAX_CONVERSIONES = 1
const MAX_COLA_CONVERSIONES = 10
let conversionesActivas = 0
const colaConversiones = []

function conLimiteConversion(trabajo) {
  return new Promise((resolve, reject) => {
    const ejecutar = () => {
      conversionesActivas++
      Promise.resolve()
        .then(trabajo)
        .then(resolve, reject)
        .finally(() => {
          conversionesActivas--
          const siguiente = colaConversiones.shift()
          if (siguiente) siguiente()
        })
    }
    if (conversionesActivas < MAX_CONVERSIONES) ejecutar()
    else if (colaConversiones.length < MAX_COLA_CONVERSIONES) colaConversiones.push(ejecutar)
    else reject(new Error('Hay muchas conversiones en curso. Intenta de nuevo en unos segundos.'))
  })
}

function claveSesion(chat, sender) {
  return `${chat}:${sender}`
}

/** WebP animado (ANIM/ANMF o flag VP8X). Evita depender del plugin aquí. */
function esWebPAnimado(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 20) return false
  if (buffer[0] !== 0x52 || buffer[1] !== 0x49 || buffer[2] !== 0x46 || buffer[3] !== 0x46) return false
  if (buffer.toString('ascii', 8, 12) !== 'WEBP') return false
  let offset = 12
  while (offset + 8 <= buffer.length) {
    const chunk = buffer.toString('ascii', offset, offset + 4)
    const size = buffer.readUInt32LE(offset + 4)
    if (chunk === 'ANIM' || chunk === 'ANMF') return true
    if (chunk === 'VP8X' && offset + 8 < buffer.length && (buffer[offset + 8] & 0x02)) return true
    offset += 8 + size + (size % 2)
    if (size < 0) break
  }
  return false
}

function borrarSesion(clave) {
  const sesion = sesiones.get(clave)
  if (!sesion) return null
  sesiones.delete(clave)
  bytesEnEspera = Math.max(0, bytesEnEspera - sesion.buffer.length)
  const chat = sesion.chat
  for (const otra of sesiones.values()) {
    if (otra.chat === chat) return sesion
  }
  chatsConSesion.delete(chat)
  return sesion
}

function limpiarSesiones(ahora = Date.now()) {
  if (ahora - ultimaLimpieza < LIMPIEZA_MS) return
  ultimaLimpieza = ahora
  for (const [clave, sesion] of [...sesiones]) {
    if (ahora - sesion.at > TTL_MS) borrarSesion(clave)
  }
}

/** ¿Hay una imagen esperando audio en este chat? (filtro temprano del handler) */
export function haySesionStickerAudio(chat, sender = null) {
  if (!chat) return false
  limpiarSesiones()
  if (sender) return sesiones.has(claveSesion(chat, sender))
  return chatsConSesion.has(chat)
}

/** Guarda la imagen hasta que llegue el audio. Devuelve false si no cabe. */
export function crearSesionStickerAudio({ chat, sender, buffer, tipo, modo }) {
  if (!chat || !sender || !buffer?.length) return false
  if (buffer.length > MAX_BYTES) return false
  limpiarSesiones()

  // Nunca acumular más de 64 MB esperando audio: se descarta la más antigua.
  let masVieja = null
  for (const [clave, sesion] of sesiones) {
    if (!masVieja || sesion.at < masVieja.sesion.at) masVieja = { clave, sesion }
  }
  while (masVieja && (sesiones.size >= MAX_SESIONES || bytesEnEspera + buffer.length > MAX_TOTAL_BYTES)) {
    borrarSesion(masVieja.clave)
    masVieja = null
    for (const [clave, sesion] of sesiones) {
      if (!masVieja || sesion.at < masVieja.sesion.at) masVieja = { clave, sesion }
    }
  }

  const clave = claveSesion(chat, sender)
  borrarSesion(clave)
  sesiones.set(clave, {
    chat,
    buffer,
    tipo,
    modo: modo === 'sticker' ? 'sticker' : 'video',
    at: Date.now()
  })
  chatsConSesion.add(chat)
  bytesEnEspera += buffer.length
  return true
}

/** Extrae y elimina la sesión (un solo uso). */
export function tomarSesionStickerAudio(chat, sender) {
  if (!chat || !sender) return null
  limpiarSesiones()
  return borrarSesion(claveSesion(chat, sender))
}

export function cancelarSesionStickerAudio(chat, sender) {
  return Boolean(borrarSesion(claveSesion(chat, sender)))
}

function ejecutarFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proceso = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], {
      windowsHide: true
    })
    let salidaError = ''
    proceso.stderr?.on('data', (trozo) => {
      if (salidaError.length < 2000) salidaError += trozo.toString()
    })
    proceso.on('error', reject)
    proceso.on('close', (codigo) => {
      if (codigo === 0) resolve()
      else reject(new Error(salidaError.trim().slice(0, 300) || `FFmpeg terminó con código ${codigo}`))
    })
  })
}

async function extensionDe(buffer, tipo) {
  try {
    const detectado = await fileTypeFromBuffer(buffer)
    if (detectado?.ext) return detectado.ext
  } catch {}
  if (tipo === 'audio') return 'ogg'
  if (tipo === 'video') return 'mp4'
  if (tipo === 'sticker') return 'webp'
  return 'jpg'
}

/**
 * Convierte imagen/video/sticker + audio en un MP4 corto (máx. 10 s) que
 * WhatsApp reproduce como GIF con sonido. Una sola pasada de FFmpeg y una
 * conversión ligera con Sharp solo si el sticker es WebP animado.
 */
export function construirVideoConAudio(visual, tipoVisual, audio) {
  if (!visual?.length) return Promise.reject(new Error('Falta la imagen o video.'))
  if (!audio?.length) return Promise.reject(new Error('Falta el audio.'))
  return conLimiteConversion(() => construirVideoConAudioInterno(visual, tipoVisual, audio))
}

async function construirVideoConAudioInterno(visual, tipoVisual, audio) {
  const directorio = join(process.cwd(), 'tmp')
  await mkdir(directorio, { recursive: true })

  const sello = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  // Algunos FFmpeg no decodifican WebP animado. Sharp sí: se convierte a GIF
  // solo para los stickers animados y se mantiene el resto sin pasos extra.
  let entradaVisual = visual
  let extensionVisual = await extensionDe(visual, tipoVisual)
  if (tipoVisual === 'sticker' && esWebPAnimado(visual)) {
    try {
      const { obtenerSharp } = await import('./sharp.js')
      // `effort: 1` + paleta reducida: convierte 43 frames en ~1-2 s en vez
      // de ~26 s con la configuración por defecto.
      entradaVisual = await obtenerSharp()(visual, { animated: true })
        .resize(LADO_MAX, LADO_MAX, { fit: 'inside', withoutEnlargement: true })
        .gif({ effort: 1, colours: 64, dither: 0 })
        .toBuffer()
      extensionVisual = 'gif'
    } catch (error) {
      console.warn('[sa] No se pudo convertir el WebP animado a GIF:', error?.message || error)
    }
  }

  const extensionAudio = await extensionDe(audio, 'audio')
  const rutaVisual = join(directorio, `sa_${sello}.${extensionVisual}`)
  const rutaAudio = join(directorio, `sa_${sello}_audio.${extensionAudio}`)
  const rutaSalida = join(directorio, `sa_${sello}_final.mp4`)

  await writeFile(rutaVisual, entradaVisual)
  await writeFile(rutaAudio, audio)

  const filtro =
    `scale=${LADO_MAX}:${LADO_MAX}:force_original_aspect_ratio=decrease,` +
    `pad=${LADO_MAX}:${LADO_MAX}:(ow-iw)/2:(oh-ih)/2:color=black,format=yuv420p`

  try {
    const esImagen = tipoVisual === 'image' ||
      (tipoVisual === 'sticker' && !esWebPAnimado(visual))

    // Una sola pasada: video + audio y `-shortest` corta al terminar el audio.
    const entrada = esImagen
      ? ['-loop', '1', '-framerate', '30', '-i', rutaVisual]
      : ['-i', rutaVisual]

    await ejecutarFfmpeg([
      ...entrada,
      '-i', rutaAudio,
      '-t', String(MAX_DURACION_S),
      '-vf', filtro,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '28',
      '-c:a', 'aac',
      '-b:a', '96k',
      '-shortest',
      '-movflags', '+faststart',
      rutaSalida
    ])

    return await readFile(rutaSalida)
  } finally {
    await Promise.all(
      [rutaVisual, rutaAudio, rutaSalida].map((ruta) =>
        unlink(ruta).catch(() => {})
      )
    )
  }
}

/** MIME correcto para reenviar el audio como nota de voz o archivo. */
export function mimeAudioDe(buffer) {
  if (!buffer?.length) return 'audio/mpeg'
  const cabecera = buffer.subarray(0, 12)
  if (cabecera.subarray(0, 4).toString() === 'OggS') return 'audio/ogg; codecs=opus'
  if (cabecera.subarray(0, 3).toString() === 'ID3') return 'audio/mpeg'
  if (cabecera.subarray(0, 4).toString() === 'RIFF') return 'audio/wav'
  if (cabecera.subarray(4, 8).toString() === 'ftyp') return 'audio/mp4'
  return 'audio/mpeg'
}
