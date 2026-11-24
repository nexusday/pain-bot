/**
 * Sticker con sonido nativo de WhatsApp.
 *
 * Protocolo (WAProto 2.26.41.6):
 *   Message.stickerMessage             -> StickerMessage
 *   StickerMessage.audioMessage = 26   -> AudioMessage  (clip incrustado)
 *
 * El audio se reproduce con el campo 26. `Message.audioStickerMessage` (134)
 * es solo un envoltorio genérico FutureProofMessage sin ruta dedicada de
 * decodificación: enviarlo hace que el cliente muestre el sticker pero ignore
 * el audio. Por eso aquí no se usa el 134.
 *
 * El `@whiskeysockets/baileys` instalado aún no declara el campo 26, pero su
 * codificador protobuf se puede extender sin reemplazar toda la librería.
 */
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { prepareWAMessageMedia, proto } from '@whiskeysockets/baileys'

const CAMPO_AUDIO_DENTRO_STICKER = 26
const TIPO_LENGTH_DELIMITED = 2
const LADO_STICKER = 512
const MAX_DURACION_AUDIO_S = 5

let protoParcheado = false

// Una conversión a la vez por proceso: `/sa` no debe disparar varios FFmpeg
// simultáneos en un servidor compartido. El llamador envuelve el sticker y la
// extracción de audio en `conLimiteStickerAudio`.
const MAX_CONVERSIONES = 1
const MAX_COLA_CONVERSIONES = 10
let conversionesActivas = 0
const colaConversiones = []

export function conLimiteStickerAudio(trabajo) {
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

/**
 * Extrae el audio del propio video y lo convierte a OGG/Opus (máx. 5 s).
 * Si el video no tiene pista de audio, FFmpeg falla y se informa al usuario.
 * Debe llamarse dentro de `conLimiteStickerAudio`.
 */
export async function extraerAudioDeVideo(video) {
  if (!video?.length) throw new Error('Falta el video.')

  const directorio = join(process.cwd(), 'tmp')
  await mkdir(directorio, { recursive: true })

  const sello = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const entrada = join(directorio, `sa_video_${sello}.mp4`)
  const salida = join(directorio, `sa_video_${sello}.ogg`)

  await writeFile(entrada, video)
  try {
    try {
      await ejecutarFfmpeg([
        '-i', entrada,
        '-t', String(MAX_DURACION_AUDIO_S),
        '-vn',
        '-c:a', 'libopus',
        '-b:a', '64k',
        '-ar', '48000',
        '-ac', '1',
        '-vbr', 'on',
        salida
      ])
    } catch (error) {
      throw new Error('El video no tiene sonido o su audio no se pudo extraer.')
    }
    const audio = await readFile(salida)
    if (!audio?.length) throw new Error('El video no tiene sonido.')
    return audio
  } finally {
    await Promise.all([entrada, salida].map((ruta) => unlink(ruta).catch(() => {})))
  }
}

/**
 * Añade el campo 26 (`StickerMessage.audioMessage`) al codificador.
 * Idempotente. No envuelve el mensaje en el campo 134.
 */
export function parchearProtoAudioSticker() {
  if (protoParcheado) return
  protoParcheado = true

  const stickerOriginal = proto.Message.StickerMessage.encode
  proto.Message.StickerMessage.encode = function (mensaje, writer, profundidad) {
    const salida = stickerOriginal.call(this, mensaje, writer, profundidad)
    if (mensaje?.audioMessage) {
      console.log('[sa] encode: audioMessage dentro del sticker (campo 26)')
      const audio = proto.Message.AudioMessage.encode(mensaje.audioMessage).finish()
      salida
        .uint32((CAMPO_AUDIO_DENTRO_STICKER << 3) | TIPO_LENGTH_DELIMITED)
        .bytes(audio)
    }
    return salida
  }
}

/** Construye el sticker normal con el audio incrustado. */
export function construirContenidoAudioSticker(stickerMessage, audioMessage) {
  if (!stickerMessage || !audioMessage) {
    throw new Error('Faltan los datos del sticker o del audio.')
  }
  return {
    stickerMessage: {
      ...stickerMessage,
      width: stickerMessage.width || LADO_STICKER,
      height: stickerMessage.height || LADO_STICKER,
      isAnimated: Boolean(stickerMessage.isAnimated),
      stickerSentTs: stickerMessage.stickerSentTs || Date.now(),
      audioMessage
    }
  }
}

/**
 * Sube el sticker y el audio y envía un único `audioStickerMessage`.
 * El audio debe venir ya en OGG/Opus (`extraerAudioDeVideo`).
 */
export async function enviarStickerConAudioNativo(conn, jid, { sticker, audio, isAnimated = false }) {
  if (!conn?.waUploadToServer) throw new Error('El socket no tiene subida de medios.')
  if (typeof conn.relayMessage !== 'function') throw new Error('El socket no soporta relayMessage.')
  if (!sticker?.length) throw new Error('Falta el sticker.')
  if (!audio?.length) throw new Error('Falta el audio.')

  parchearProtoAudioSticker()

  const [stickerSubido, audioSubido] = await Promise.all([
    prepareWAMessageMedia(
      { sticker },
      { upload: conn.waUploadToServer }
    ),
    prepareWAMessageMedia(
      { audio, mimetype: 'audio/ogg; codecs=opus', ptt: true },
      { upload: conn.waUploadToServer }
    )
  ])

  const stickerMessage = stickerSubido?.stickerMessage
  const audioMessage = audioSubido?.audioMessage
  if (!stickerMessage || !audioMessage) {
    throw new Error('No se pudieron preparar el sticker o el audio.')
  }

  stickerMessage.isAnimated = Boolean(isAnimated)
  if (!stickerMessage.width) stickerMessage.width = LADO_STICKER
  if (!stickerMessage.height) stickerMessage.height = LADO_STICKER

  const contenido = construirContenidoAudioSticker(stickerMessage, audioMessage)
  // Sin atributos manuales: relayMessage detecta `stickerMessage` y envía
  // type=media / mediatype=sticker. El audio viaja en el campo 26.
  // El tercer argumento es obligatorio (aunque vaya vacío): relayMessage
  // desestructura sus opciones y sin él lanza TypeError.
  await conn.relayMessage(jid, contenido, {})
  return contenido
}
