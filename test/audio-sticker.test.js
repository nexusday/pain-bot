import test from 'node:test'
import assert from 'node:assert/strict'
import protobuf from 'protobufjs/minimal.js'
const { Reader } = protobuf
import { proto } from '@whiskeysockets/baileys'
import {
  construirContenidoAudioSticker,
  parchearProtoAudioSticker
} from '../lib/audio-sticker.js'

/** Lee los campos de nivel superior de un mensaje protobuf. */
function campos(buffer) {
  const reader = Reader.create(buffer)
  const lista = []
  while (reader.pos < reader.len) {
    const tag = reader.uint32()
    const numero = tag >>> 3
    const tipo = tag & 7
    if (tipo === 2) lista.push([numero, reader.bytes()])
    else if (tipo === 0) {
      // Los int64 (stickerSentTs/mediaKeyTimestamp) no caben en int32; hay que
      // consumir el varint completo para no desalinear el resto.
      reader.uint64()
      lista.push([numero, null])
    } else reader.skipType(tipo)
  }
  return lista
}

/**
 * El sticker viaja en `Message.stickerMessage` (26) y el audio dentro de
 * `StickerMessage.audioMessage` (26). El envoltorio 134 no debe usarse.
 */
function analizarSticker(bytes) {
  const exterior = campos(bytes)
  const envoltorios134 = exterior.filter(([numero]) => numero === 134)
  const sticker = exterior.find(([numero]) => numero === 26)?.[1]
  assert.ok(sticker, 'falta Message.stickerMessage')
  const interior = campos(sticker)
  const audios = interior.filter(([numero]) => numero === 26)
  return { envoltorios134, audios }
}

test('el contenido nativo anida el audio dentro del sticker', () => {
  const contenido = construirContenidoAudioSticker(
    { url: 'https://ejemplo/sticker.enc', mimetype: 'image/webp', isAnimated: true },
    { url: 'https://ejemplo/audio.enc', mimetype: 'audio/ogg; codecs=opus', ptt: true }
  )

  assert.equal(contenido.audioStickerMessage, undefined)
  const sticker = contenido.stickerMessage
  assert.equal(sticker.url, 'https://ejemplo/sticker.enc')
  assert.equal(sticker.isAnimated, true)
  assert.equal(sticker.width, 512)
  assert.equal(sticker.height, 512)
  assert.equal(sticker.audioMessage.url, 'https://ejemplo/audio.enc')
  assert.equal(sticker.audioMessage.ptt, true)
})

test('rechaza contenido incompleto', () => {
  assert.throws(() => construirContenidoAudioSticker(null, {}))
  assert.throws(() => construirContenidoAudioSticker({}, null))
})

test('el codificador emite el audio embebido (26) sin envoltorio 134', () => {
  parchearProtoAudioSticker()
  const contenido = construirContenidoAudioSticker(
    { url: 'https://ejemplo/sticker.enc', mimetype: 'image/webp' },
    { url: 'https://ejemplo/audio.enc', mimetype: 'audio/ogg; codecs=opus', ptt: true }
  )

  const { envoltorios134, audios } = analizarSticker(proto.Message.encode(contenido).finish())
  assert.equal(envoltorios134.length, 0, 'no debe usarse el envoltorio 134')
  assert.equal(audios.length, 1, 'debe haber un StickerMessage.audioMessage')
})

test('el parche es idempotente y no duplica el audio', () => {
  parchearProtoAudioSticker()
  parchearProtoAudioSticker()
  const contenido = construirContenidoAudioSticker(
    { url: 'https://ejemplo/sticker.enc', mimetype: 'image/webp' },
    { url: 'https://ejemplo/audio.enc', mimetype: 'audio/ogg; codecs=opus' }
  )
  const { envoltorios134, audios } = analizarSticker(proto.Message.encode(contenido).finish())
  assert.equal(envoltorios134.length, 0)
  assert.equal(audios.length, 1)
})
