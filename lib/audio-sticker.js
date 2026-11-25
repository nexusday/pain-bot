/**
 * Sticker con sonido nativo de WhatsApp.
 *
 * Protocolo (WAProto 2.26.41.6):
 *   Message.audioStickerMessage = 134  -> FutureProofMessage
 *   FutureProofMessage.message         -> Message
 *   Message.stickerMessage             -> StickerMessage
 *   StickerMessage.audioMessage = 26   -> AudioMessage (clip incrustado)
 *
 * El cliente desenvuelve el sobre 134 para mostrar el sticker; el sonido se
 * reproduce desde el campo 26 dentro del sticker. Hacen falta LOS DOS: 134
 * sin 26 muestra un sticker mudo, y 26 sin 134 se trata como sticker normal.
 *
 * El `@whiskeysockets/baileys` instalado aún no declara esos campos, pero su
 * codificador protobuf se puede extender sin reemplazar toda la librería.
 */
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import protobuf from 'protobufjs/minimal.js'
import { prepareWAMessageMedia, proto } from '@whiskeysockets/baileys'
import { iniciarActividadWorker } from './worker-metrics.js'

const { Writer } = protobuf

const CAMPO_AUDIO_DENTRO_STICKER = 26
const TIPO_LENGTH_DELIMITED = 2
const LADO_STICKER = 512
const MAX_DURACION_AUDIO_S = 30

const MARCA_PROTO = Symbol.for('pain.audioStickerPatch.v2')
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
    else if (colaConversiones.length < MAX_COLA_CONVERSIONES) {
      colaConversiones.push(ejecutar)
      console.log(`[sa] conversión en cola (${colaConversiones.length} pendiente/s)`)
    } else reject(new Error('Hay muchas conversiones en curso. Intenta de nuevo en unos segundos.'))
  })
}

function ejecutarFfmpeg(args) {
  const finalizarActividad = iniciarActividadWorker('ffmpeg')
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
  }).finally(finalizarActividad)
}

/**
 * Extrae el audio del propio video y lo convierte a OGG/Opus (máx. 30 s).
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
        '-threads', '1',
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
 * Escribe un `Message` que solo contiene el sticker (26) con su audio (26).
 */
function escribirMensajeSticker(writer, sticker) {
  writer.uint32((26 << 3) | TIPO_LENGTH_DELIMITED).fork()
  proto.Message.StickerMessage.encode(sticker, writer)
  const audio = sticker.audioMessage
  if (audio) {
    const audioBytes = proto.Message.AudioMessage.encode(audio).finish()
    writer
      .uint32((CAMPO_AUDIO_DENTRO_STICKER << 3) | TIPO_LENGTH_DELIMITED)
      .bytes(audioBytes)
  }
  writer.ldelim()
}

/**
 * Añade el sobre 134 + el campo 26 al codificador. Idempotente.
 *
 * La ruta real de `relayMessage` usa `Message.encode`, pero no el
 * `StickerMessage.encode` parcheado. Por eso el sticker se escribe aquí
 * manualmente, con el audio dentro, y luego se envuelve en 134.
 */
export function parchearProtoAudioSticker() {
  if (protoParcheado || proto.Message?.[MARCA_PROTO]) return
  protoParcheado = true
  proto.Message[MARCA_PROTO] = true

  const mensajeOriginal = proto.Message.encode

  proto.Message.encode = function (mensaje, writer, profundidad) {
    const sticker = mensaje?.stickerMessage
    if (!sticker?.audioMessage) {
      return mensajeOriginal.call(this, mensaje, writer, profundidad)
    }

    console.log('[sa] encode: audio sticker (134 + campo 26)')

    // 1) Mensaje interno: solo stickerMessage + audioMessage.
    const interno = Writer.create()
    escribirMensajeSticker(interno, sticker)

    // 2) Sobre FutureProofMessage { message = 1: mensaje interno }.
    const sobre = Writer.create()
    sobre.uint32((1 << 3) | TIPO_LENGTH_DELIMITED).bytes(interno.finish())

    // 3) Mensaje externo sin sticker + campo 134.
    const copia = Object.assign(Object.create(Object.getPrototypeOf(mensaje)), mensaje)
    delete copia.stickerMessage
    const salida = mensajeOriginal.call(this, copia, writer, profundidad)
    salida
      .uint32((134 << 3) | TIPO_LENGTH_DELIMITED)
      .bytes(sobre.finish())

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
 * Sube el sticker y el audio y envía un único sticker con el audio incrustado.
 * El audio debe venir ya en OGG/Opus (`extraerAudioDeVideo`).
 */
export async function enviarStickerConAudioNativo(conn, jid, {
  sticker,
  audio,
  isAnimated = false,
  contextInfo = null
}) {
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
  // Cita/rcanal: en un sticker el contexto va dentro de StickerMessage (17).
  if (contextInfo) stickerMessage.contextInfo = contextInfo

  const contenido = construirContenidoAudioSticker(stickerMessage, audioMessage)
  // Sin atributos manuales: relayMessage detecta `stickerMessage` y envía
  // type=media / mediatype=sticker. El audio viaja en el campo 26.
  // El tercer argumento es obligatorio (aunque vaya vacío): relayMessage
  // desestructura sus opciones y sin él lanza TypeError.
  await conn.relayMessage(jid, contenido, {})
  return contenido
}
