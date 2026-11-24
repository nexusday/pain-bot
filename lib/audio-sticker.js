/**
 * Sticker con sonido nativo de WhatsApp.
 *
 * Protocolo (WAProto):
 *   Message.audioStickerMessage = 134  -> FutureProofMessage
 *   FutureProofMessage.message         -> Message
 *   Message.stickerMessage             -> StickerMessage
 *   StickerMessage.audioMessage = 26   -> AudioMessage
 *
 * El `@whiskeysockets/baileys` instalado aún no declara esos campos, pero su
 * codificador protobuf se puede extender sin reemplazar toda la librería: el
 * mensaje viaja en un solo sobre y el cliente nuevo lo reproduce como sticker
 * con audio. Es una extensión de codificación, no un cambio de conexión.
 */
import { prepareWAMessageMedia, proto } from '@whiskeysockets/baileys'

const CAMPO_AUDIO_STICKER = 134
const CAMPO_AUDIO_DENTRO_STICKER = 26
const TIPO_LENGTH_DELIMITED = 2
const LADO_STICKER = 512

let protoParcheado = false

/**
 * Añade los dos campos nuevos al codificador. Es idempotente y solo escribe
 * cuando el objeto realmente trae `audioStickerMessage`/`audioMessage`.
 */
export function parchearProtoAudioSticker() {
  if (protoParcheado) return
  protoParcheado = true

  const stickerOriginal = proto.Message.StickerMessage.encode
  proto.Message.StickerMessage.encode = function (mensaje, writer, profundidad) {
    const salida = stickerOriginal.call(this, mensaje, writer, profundidad)
    if (mensaje?.audioMessage) {
      const audio = proto.Message.AudioMessage.encode(mensaje.audioMessage).finish()
      salida
        .uint32((CAMPO_AUDIO_DENTRO_STICKER << 3) | TIPO_LENGTH_DELIMITED)
        .bytes(audio)
    }
    return salida
  }

  const mensajeOriginal = proto.Message.encode
  proto.Message.encode = function (mensaje, writer, profundidad) {
    const salida = mensajeOriginal.call(this, mensaje, writer, profundidad)
    if (mensaje?.audioStickerMessage?.message) {
      const sobre = proto.Message.FutureProofMessage.encode(mensaje.audioStickerMessage).finish()
      salida
        .uint32((CAMPO_AUDIO_STICKER << 3) | TIPO_LENGTH_DELIMITED)
        .bytes(sobre)
    }
    return salida
  }
}

/** Construye el contenido exacto que entiende el cliente de WhatsApp. */
export function construirContenidoAudioSticker(stickerMessage, audioMessage) {
  if (!stickerMessage || !audioMessage) {
    throw new Error('Faltan los datos del sticker o del audio.')
  }
  return {
    audioStickerMessage: {
      message: {
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
  }
}

/**
 * Sube el sticker y el audio y envía un único `audioStickerMessage`.
 * El audio debe venir ya en OGG/Opus (`prepararAudioSticker`).
 */
export async function enviarAudioStickerNativo(conn, jid, { sticker, audio, isAnimated = false }) {
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
  stickerMessage.width = LADO_STICKER
  stickerMessage.height = LADO_STICKER

  const contenido = construirContenidoAudioSticker(stickerMessage, audioMessage)
  await conn.relayMessage(jid, contenido, {
    additionalAttributes: { type: 'media', mediatype: 'sticker' }
  })
  return contenido
}
